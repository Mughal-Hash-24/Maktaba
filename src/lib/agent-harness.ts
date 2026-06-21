// src/lib/agent-harness.ts
import { GoogleGenerativeAI, Content, Part } from '@google/generative-ai';
import { toolDeclarations, executeTool } from './agent-tools';
import { ActiveModel } from '../context/HikmaContext';

export interface ThoughtStep {
  type: 'search' | 'read' | 'clarify' | 'answering' | 'error';
  message: string;
  timestamp: number;
}

export type ChatMessage = Content;

interface GeminiResponse {
  candidates?: {
    content?: {
      parts?: Part[];
    };
  }[];
  content?: {
    parts?: Part[];
  };
}

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: {
    id: string;
    type: 'string' | 'function';
    function: {
      name: string;
      arguments: string;
    };
  }[];
}

function convertGeminiToOpenAI(geminiMsgs: Content[], systemInstruction: string): OpenAIMessage[] {
  const openAIMsgs: OpenAIMessage[] = [
    { role: 'system', content: systemInstruction }
  ];

  geminiMsgs.forEach((msg, msgIdx) => {
    const role = msg.role === 'model' ? 'assistant' : msg.role;
    const parts = msg.parts || [];
    
    const functionCalls = parts.filter(p => p.functionCall);
    const textPart = parts.find(p => p.text);
    const functionResponses = parts.filter(p => p.functionResponse);

    if (role === 'assistant') {
      if (functionCalls.length > 0) {
        openAIMsgs.push({
          role: 'assistant',
          content: textPart?.text || null,
          tool_calls: functionCalls.map((fc, fcIdx) => ({
            id: `call_${msgIdx}_${fcIdx}`,
            type: 'function',
            function: {
              name: fc.functionCall!.name,
              arguments: JSON.stringify(fc.functionCall!.args)
            }
          }))
        });
      } else {
        openAIMsgs.push({
          role: 'assistant',
          content: textPart?.text || ''
        });
      }
    } else if (functionResponses.length > 0) {
      // Find the most recent assistant message with tool calls to map indices correctly
      let prevAssistantMsg: OpenAIMessage | null = null;
      for (let searchIdx = openAIMsgs.length - 1; searchIdx >= 0; searchIdx--) {
        if (openAIMsgs[searchIdx].role === 'assistant' && openAIMsgs[searchIdx].tool_calls) {
          prevAssistantMsg = openAIMsgs[searchIdx];
          break;
        }
      }

      functionResponses.forEach((fr, frIdx) => {
        let toolCallId = `call_${msgIdx - 1}_${frIdx}`;
        if (prevAssistantMsg && prevAssistantMsg.tool_calls && prevAssistantMsg.tool_calls[frIdx]) {
          toolCallId = prevAssistantMsg.tool_calls[frIdx].id;
        }

        openAIMsgs.push({
          role: 'tool',
          tool_call_id: toolCallId,
          name: fr.functionResponse!.name,
          content: JSON.stringify(fr.functionResponse!.response)
        });
      });
    } else {
      openAIMsgs.push({
        role: 'user',
        content: textPart?.text || ''
      });
    }
  });

  return openAIMsgs;
}

interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  [key: string]: unknown;
}

function convertSchemaToLowercase(schema: JsonSchema | undefined): JsonSchema | undefined {
  if (!schema) return undefined;

  const copy = { ...schema };
  if (typeof copy.type === 'string') {
    copy.type = copy.type.toLowerCase();
  }

  if (copy.properties && typeof copy.properties === 'object') {
    const props: Record<string, JsonSchema> = {};
    for (const key in copy.properties) {
      const propVal = convertSchemaToLowercase(copy.properties[key]);
      if (propVal) {
        props[key] = propVal;
      }
    }
    copy.properties = props;
  }

  if (copy.items && typeof copy.items === 'object') {
    copy.items = convertSchemaToLowercase(copy.items);
  }

  return copy;
}


export class AgentHarness {
  private apiKey: string | null;
  private onStepLog: (step: ThoughtStep) => void;
  private onStreamText: (chunk: string) => void;
  private onClarificationPrompt: (question: string, options?: string[]) => Promise<string>;
  private isCancelled: boolean = false;

  constructor(
    apiKey: string | null,
    onStepLog: (step: ThoughtStep) => void,
    onStreamText: (chunk: string) => void,
    onClarificationPrompt: (question: string, options?: string[]) => Promise<string>
  ) {
    this.apiKey = apiKey;
    this.onStepLog = onStepLog;
    this.onStreamText = onStreamText;
    this.onClarificationPrompt = onClarificationPrompt;
  }

  public cancel(): void {
    this.isCancelled = true;
    this.onStepLog({
      type: 'error',
      message: 'Run cancelled by user.',
      timestamp: Date.now(),
    });
  }

  /**
   * Executes the ReAct tool loop for a user query.
   * @param userQuery The incoming user query text.
   * @param history The conversation history of Content objects.
   * @returns Updated conversation history.
   */
  public async run(
    userQuery: string,
    history: Content[],
    systemInstruction: string,
    maxLoops: number = 20,
    selectedModel: ActiveModel = 'mistral-large-latest',
    mistralApiKey: string | null = null
  ): Promise<Content[]> {
    this.isCancelled = false;
    const conversation: Content[] = [...history];
    const accessedSlugs = new Set<string>();
    const noteTitleMap = new Map<string, string>();

    // Append the new user query to the active session list
    conversation.push({
      role: 'user',
      parts: [{ text: userQuery }],
    });

    let loopCount = 0;
    const executedActions = new Set<string>();

    const openAITools = toolDeclarations.map(decl => ({
      type: 'function',
      function: {
        name: decl.name,
        description: decl.description,
        parameters: convertSchemaToLowercase(decl.parameters as JsonSchema | undefined)
      }
    }));

    while (loopCount < maxLoops) {
      if (this.isCancelled) {
        return conversation;
      }

      this.onStepLog({
        type: 'answering',
        message: loopCount === 0 ? 'Analyzing query...' : 'Thinking...',
        timestamp: Date.now(),
      });

      let responseContent: GeminiResponse | null = null;

      // ─── Phase 1: Request from Gemini or Mistral ───
      const isMistralModel = selectedModel.startsWith('mistral-') || selectedModel.startsWith('codestral-') || selectedModel.startsWith('open-');
      if (isMistralModel && mistralApiKey) {
        // Mode A: Mistral direct client call
        try {
          const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${mistralApiKey}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              model: selectedModel,
              messages: convertGeminiToOpenAI(conversation, systemInstruction),
              tools: openAITools,
              tool_choice: 'auto'
            })
          });

          if (!res.ok) {
            const errText = await res.text();
            let errMsg = `HTTP Error ${res.status}: ${res.statusText}`;
            try {
              const errJson = JSON.parse(errText);
              if (errJson.error?.message) {
                errMsg = errJson.error.message;
              }
            } catch {
              if (errText) errMsg = errText.slice(0, 150);
            }
            throw new Error(errMsg);
          }

          const data = await res.json();
          const assistantMessage = data.choices?.[0]?.message;
          if (!assistantMessage) {
            throw new Error('No content returned from Mistral');
          }

          const parts: Part[] = [];
          if (assistantMessage.content) {
            parts.push({ text: assistantMessage.content });
          }
          if (assistantMessage.tool_calls) {
            (assistantMessage.tool_calls as { function: { name: string; arguments: string } }[]).forEach((tc) => {
              parts.push({
                functionCall: {
                  name: tc.function.name,
                  args: JSON.parse(tc.function.arguments)
                }
              });
            });
          }

          responseContent = {
            candidates: [{
              content: { parts }
            }]
          };
        } catch (_err: unknown) {
          const errMsg = _err instanceof Error ? _err.message : 'An unexpected error occurred';
          this.onStepLog({
            type: 'error',
            message: errMsg,
            timestamp: Date.now(),
          });
          throw new Error(errMsg);
        }
      } else if (this.apiKey) {
        // Mode B: Direct Gemini client SDK call
        try {
          const genAI = new GoogleGenerativeAI(this.apiKey);
          const model = genAI.getGenerativeModel({
            model: isMistralModel ? 'gemma-4-31b-it' : selectedModel,
            systemInstruction,
            tools: [{ functionDeclarations: toolDeclarations }],
          });

          // Call generateContent with standard structures
          const result = await model.generateContent({
            contents: conversation,
          });
          
          responseContent = result.response as unknown as GeminiResponse;
        } catch (_err: unknown) {
          const errMsg = _err instanceof Error ? _err.message : 'An unexpected error occurred';
          this.onStepLog({
            type: 'error',
            message: errMsg,
            timestamp: Date.now(),
          });
          throw new Error(errMsg);
        }
      } else {
        // Mode C: Server proxy call (curator key)
        try {
          const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: conversation,
              systemInstruction,
              modelName: isMistralModel ? 'gemma-4-31b-it' : selectedModel,
            }),
          });

          if (!res.ok) {
            const errText = await res.text();
            let errMsg = `HTTP Error ${res.status}: ${res.statusText}`;
            try {
              const errJson = JSON.parse(errText);
              if (errJson.error) {
                errMsg = typeof errJson.error === 'string' ? errJson.error : (errJson.error.message || errMsg);
              }
            } catch {
              if (errText) errMsg = errText.slice(0, 150);
            }
            throw new Error(errMsg);
          }

          responseContent = (await res.json()) as GeminiResponse;
        } catch (_err: unknown) {
          const errMsg = _err instanceof Error ? _err.message : 'An unexpected error occurred';
          this.onStepLog({
            type: 'error',
            message: errMsg,
            timestamp: Date.now(),
          });
          throw new Error(errMsg);
        }
      }

      if (this.isCancelled) return conversation;

      // Parse candidate parts
      const candidate = responseContent?.candidates?.[0] || responseContent;
      const responseParts: Part[] = candidate?.content?.parts || [];
      const functionCalls = responseParts.filter((p) => p.functionCall);
      const textResponse = responseParts.map((p) => p.text).join('').trim();

      // If text response is returned alongside no function calls, run streaming callback
      if (textResponse && functionCalls.length === 0) {
        // Intercept XML-based askUser if present
        const parsed = parseAllXmlTags(textResponse);
        if (parsed.askUser) {
          loopCount++;
          
          this.onStepLog({
            type: 'clarify',
            message: `Clarifying with user (XML): "${parsed.askUser.question}"`,
            timestamp: Date.now(),
          });

          // Push the model's text response (which contains the XML askUser) to the active conversation history
          conversation.push({
            role: 'model',
            parts: responseParts,
          });

          try {
            // Wait for user clarification response
            const answer = await this.onClarificationPrompt(parsed.askUser.question, parsed.askUser.options);
            
            // Push user response back to conversation history
            conversation.push({
              role: 'user',
              parts: [{ text: `User answer: ${answer}` }],
            });

            // Loop ceiling guard check
            if (loopCount >= maxLoops) {
              this.onStepLog({
                type: 'error',
                message: 'Reasoning loop limit reached. Compiling response...',
                timestamp: Date.now(),
              });
              conversation.push({
                role: 'user',
                parts: [{ text: 'System instruction: Maximum tool execution loops reached. Compile your final study answer now based on the collected context.' }],
              });
            }
            continue; // Continue the ReAct loop
          } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : 'Clarification error';
            this.onStepLog({
              type: 'error',
              message: `Clarification failed: ${errMsg}`,
              timestamp: Date.now(),
            });
            break;
          }
        }

        let finalResponse = textResponse;
        const parsedTags = parseAllXmlTags(textResponse);
        if (parsedTags.response && accessedSlugs.size > 0) {
          const citations: string[] = [];
          accessedSlugs.forEach(slug => {
            const title = noteTitleMap.get(slug) || slug;
            citations.push(`- [[${title}|${slug}]]`);
          });
          
          if (citations.length > 0) {
            const citationsBlock = `\n\n**Sources:**\n${citations.join('\n')}`;
            if (textResponse.includes('</response>')) {
              finalResponse = textResponse.replace('</response>', `${citationsBlock}\n</response>`);
            } else {
              finalResponse = `${textResponse.trim()}\n\n${citationsBlock}`;
            }
          }
        }

        this.onStepLog({
          type: 'answering',
          message: 'Synthesizing final response...',
          timestamp: Date.now(),
        });
        
        this.onStreamText(finalResponse);
        conversation.push({
          role: 'model',
          parts: [{ text: finalResponse }],
        });
        break;
      }

      // If function calls are returned, handle execution
      if (functionCalls.length > 0) {
        loopCount++;
        
        // Push the model's tool calls to the active conversation history
        conversation.push({
          role: 'model',
          parts: responseParts,
        });

        const toolResponses: Part[] = [];

        // Concurrently execute functions
        const promises = functionCalls.map(async (part) => {
          const call = part.functionCall!;
          const callKey = `${call.name}::${JSON.stringify(call.args)}`;

          // 1. Duplicate tool call guard
          if (executedActions.has(callKey)) {
            this.onStepLog({
              type: 'error',
              message: `Prevented duplicate tool call for ${call.name}.`,
              timestamp: Date.now(),
            });
            return {
              functionResponse: {
                name: call.name,
                response: { error: 'Duplicate tool call blocked. Try a different parameter or formulate an answer.' },
              },
            };
          }

          executedActions.add(callKey);

          // Update UI log
          this.logToolAction(call.name, call.args as Record<string, unknown>);

          try {
            const output = await executeTool(call.name, call.args as Record<string, unknown>, this.onClarificationPrompt);
            
            if (call.name === 'readNoteSummary' || call.name === 'readNoteSection' || call.name === 'readNoteFull') {
              const slug = (call.args as { slug?: string }).slug;
              if (slug) {
                accessedSlugs.add(slug);
                const outObj = output as { title?: string };
                if (outObj && outObj.title) {
                  noteTitleMap.set(slug, outObj.title);
                } else if (!noteTitleMap.has(slug)) {
                  try {
                    const res = await fetch(`/api/notes?slug=${slug}`);
                    if (res.ok) {
                      const note = await res.json();
                      if (note && note.title) {
                        noteTitleMap.set(slug, note.title);
                      }
                    }
                  } catch {
                    // Ignore fetch failures
                  }
                }
              }
            }

            return {
              functionResponse: {
                name: call.name,
                response: output as Record<string, unknown>,
              },
            };
          } catch (err: unknown) {
            const errMsg = err instanceof Error ? err.message : 'Execution error';
            return {
              functionResponse: {
                name: call.name,
                response: { error: errMsg },
              },
            };
          }
        });

        const results = await Promise.all(promises);
        toolResponses.push(...results);

        // Push tool responses back to conversation history (represented as a user turn in Gemini)
        conversation.push({
          role: 'user',
          parts: toolResponses,
        });

        // Loop ceiling guard check
        if (loopCount >= maxLoops) {
          this.onStepLog({
            type: 'error',
            message: 'Reasoning loop limit reached. Compiling response...',
            timestamp: Date.now(),
          });
          conversation.push({
            role: 'user',
            parts: [{ text: 'System instruction: Maximum tool execution loops reached. Compile your final study answer now based on the collected context.' }],
          });
        }
      } else {
        // Fallback for cases with no text and no tool calls
        break;
      }
    }

    return conversation;
  }

  private logToolAction(name: string, args: Record<string, unknown>): void {
    let msg = `Executing action: ${name}`;
    let type: 'search' | 'read' | 'clarify' | 'answering' = 'read';

    if (name === 'semanticSearch') {
      msg = `Searching database for: "${args.query as string}"`;
      type = 'search';
    } else if (name === 'readNoteSummary') {
      msg = `Reading metadata summary for: ${args.slug as string}`;
      type = 'read';
    } else if (name === 'readNoteSection') {
      msg = `Fetching section outline: ${args.sectionId as string}`;
      type = 'read';
    } else if (name === 'readNoteFull') {
      msg = `Loading full note: ${args.slug as string}`;
      type = 'read';
    } else if (name === 'askUser') {
      msg = `Clarifying with user: "${args.question as string}"`;
      type = 'clarify';
    }

    this.onStepLog({
      type,
      message: msg,
      timestamp: Date.now(),
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// XML tag parser helpers
// ─────────────────────────────────────────────────────────────────────────────

export interface ParsedTags {
  thoughts: string;
  searchPlan: string;
  notesAnalysis: string;
  response: string;
  askUser: {
    question: string;
    options?: string[];
  } | null;
  rawTags: Record<string, string>;
}

export interface ParsedResponse {
  thoughts: string;
  searchPlan: string;
  notesAnalysis: string;
  response: string;
}

export function parseAllXmlTags(text: string): ParsedTags {
  const rawTags: Record<string, string> = {};
  let tempText = text;

  const tagStartRegex = /<([a-zA-Z0-9_-]+)(?:\s+[^>]*)*>/g;
  
  const thoughtsSynonyms = ['thought', 'thoughts', 'thinking', 'reflection', 'reasoning', 'internal_thought', 'internal_thoughts'];
  const searchPlanSynonyms = ['search_plan', 'search-plan', 'searchplan', 'plan', 'search_strategy', 'search'];
  const notesAnalysisSynonyms = ['notes_analysis', 'notes-analysis', 'notesanalysis', 'analysis', 'notes', 'comparisons'];
  const responseSynonyms = ['response', 'answer', 'explanation', 'solution', 'summary', 'text'];
  const askUserSynonyms = ['askuser', 'ask_user', 'clarification', 'question', 'user_question', 'clarify'];

  const EXCLUDED_TAGS = ['b', 'i', 'u', 'strong', 'em', 'code', 'span', 'a', 'sub', 'sup', 'br', 'img', 'kbd', 'mark', 'del', 'ins', 'math'];

  let thoughts = '';
  let searchPlan = '';
  let notesAnalysis = '';
  let response = '';
  let askUser: ParsedTags['askUser'] = null;

  const parseAskUserContent = (innerContent: string): { question: string; options?: string[] } => {
    if (!innerContent.includes('<')) {
      return { question: innerContent.trim() };
    }
    
    let question = '';
    const qMatch = innerContent.match(/<(?:question|query)>([\s\S]*?)<\/(?:question|query)>/i);
    if (qMatch) {
      question = qMatch[1].trim();
    } else {
      question = innerContent.replace(/<(?:options|option|choices|choice)>[\s\S]*?<\/(?:options|option|choices|choice)>/gi, '').trim();
      question = question.replace(/<[^>]+>/g, '').trim();
    }

    const options: string[] = [];
    const optionsBlockMatch = innerContent.match(/<(?:options|choices)>([\s\S]*?)<\/(?:options|choices)>/i);
    const searchArea = optionsBlockMatch ? optionsBlockMatch[1] : innerContent;
    
    const optRegex = /<(?:option|choice)>([\s\S]*?)<\/(?:option|choice)>/gi;
    let optMatch;
    while ((optMatch = optRegex.exec(searchArea)) !== null) {
      options.push(optMatch[1].trim());
    }

    if (options.length === 0 && optionsBlockMatch) {
      const lines = optionsBlockMatch[1].split('\n');
      lines.forEach(l => {
        const cleaned = l.replace(/^\s*[*-]\s+/, '').trim();
        if (cleaned) options.push(cleaned);
      });
    }

    return {
      question: question || innerContent.trim(),
      options: options.length > 0 ? options : undefined
    };
  };

  while (true) {
    tagStartRegex.lastIndex = 0;
    const match = tagStartRegex.exec(tempText);
    if (!match) break;

    const fullTagStart = match[0];
    const tagName = match[1];
    const tagLower = tagName.toLowerCase();
    const startIdx = match.index;

    // If it's an inline HTML formatting tag, skip parsing it as a block/metadata tag
    if (EXCLUDED_TAGS.includes(tagLower)) {
      tempText = tempText.slice(0, startIdx) + '&lt;' + tempText.slice(startIdx + 1);
      continue;
    }

    // Parse attributes from the tag start (e.g. question="..." or options="...")
    const attrs: Record<string, string> = {};
    let attrMatch;
    const attrRegex = /([a-zA-Z0-9_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    while ((attrMatch = attrRegex.exec(fullTagStart)) !== null) {
      const name = attrMatch[1].toLowerCase();
      const val = attrMatch[2] ?? attrMatch[3] ?? '';
      attrs[name] = val;
    }

    const closeTag = `</${tagName}>`;
    const closeIdx = tempText.indexOf(closeTag, startIdx + fullTagStart.length);

    let content = '';
    let endIdx = -1;

    if (closeIdx !== -1) {
      content = tempText.slice(startIdx + fullTagStart.length, closeIdx);
      endIdx = closeIdx + closeTag.length;
    } else {
      const nextMatchRegex = /<([a-zA-Z0-9_-]+)(?:\s+[^>]*)*>/g;
      nextMatchRegex.lastIndex = startIdx + fullTagStart.length;
      let nextMatch = nextMatchRegex.exec(tempText);
      
      while (nextMatch && EXCLUDED_TAGS.includes(nextMatch[1].toLowerCase())) {
        nextMatch = nextMatchRegex.exec(tempText);
      }

      if (nextMatch) {
        content = tempText.slice(startIdx + fullTagStart.length, nextMatch.index);
        endIdx = nextMatch.index;
      } else {
        content = tempText.slice(startIdx + fullTagStart.length);
        endIdx = tempText.length;
      }
    }

    content = content.trim();
    rawTags[tagLower] = content;

    if (thoughtsSynonyms.includes(tagLower)) {
      thoughts = content;
    } else if (searchPlanSynonyms.includes(tagLower)) {
      searchPlan = content;
    } else if (notesAnalysisSynonyms.includes(tagLower)) {
      notesAnalysis = content;
    } else if (responseSynonyms.includes(tagLower)) {
      response = content;
    } else if (askUserSynonyms.includes(tagLower)) {
      const innerParsed = parseAskUserContent(content);
      const question = attrs['question'] || innerParsed.question;
      let options = innerParsed.options;
      if (!options && attrs['options']) {
        options = attrs['options'].split(',').map(s => s.trim()).filter(Boolean);
      }
      askUser = { question, options };
    }

    tempText = tempText.slice(0, startIdx) + ' ' + tempText.slice(endIdx);
  }

  // Restore the escaped '<' for excluded tags (so HTML formatting remains)
  tempText = tempText.replace(/&lt;/g, '<');

  // Strip remaining closing tags or self-closing tags
  tempText = tempText
    .replace(/<\/[a-zA-Z0-9_-]+>/g, '')
    .replace(/<[a-zA-Z0-9_-]+(?:\s+[^>]*)*\/>/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!response) {
    response = tempText;
  }

  if (askUser && (!response || response.trim() === '')) {
    response = `*Clarification:* ${askUser.question}`;
  }

  return {
    thoughts,
    searchPlan,
    notesAnalysis,
    response,
    askUser,
    rawTags
  };
}

export function parseModelResponse(text: string): ParsedResponse {
  const parsed = parseAllXmlTags(text);
  return {
    thoughts: parsed.thoughts,
    searchPlan: parsed.searchPlan,
    notesAnalysis: parsed.notesAnalysis,
    response: parsed.response
  };
}
