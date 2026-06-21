/* src/components/HikmaChat.tsx */
'use client';

import React, { useState, useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import styles from './HikmaChat.module.css';
import { useHikma, ActiveModel } from '../context/HikmaContext';
import { AgentHarness, ThoughtStep, parseModelResponse } from '../lib/agent-harness';
import { Content } from '@google/generative-ai';
import HikmaSettings from './HikmaSettings';
import katex from 'katex';
import { useAuth } from '../context/AuthContext';
import { getSupabaseBrowserClient } from '../lib/supabase';
import {
  createSession,
  loadMessages,
  saveMessage,
  deleteSession,
  migrateGuestData,
  clearAllLocalGuestData
} from '../lib/chat-storage';

interface HikmaChatProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ParsedResponse {
  thoughts: string;
  searchPlan: string;
  notesAnalysis: string;
  response: string;
}


function renderThoughtsDashboard(parsed: ParsedResponse, isExpanded: boolean = false) {
  const { thoughts, searchPlan, notesAnalysis } = parsed;
  if (!thoughts && !searchPlan && !notesAnalysis) return null;

  return (
    <details open={isExpanded} style={{
      marginBottom: '0.75rem',
      border: '1px solid var(--border-color)',
      borderRadius: 'var(--radius-sm)',
      background: 'rgba(0, 0, 0, 0.15)',
      overflow: 'hidden'
    }}>
      <summary style={{
        padding: '0.35rem 0.5rem',
        fontSize: '0.725rem',
        cursor: 'pointer',
        fontFamily: 'var(--font-mono), monospace',
        color: 'var(--text-secondary)',
        userSelect: 'none'
      }}>
        View Companion Thoughts & Analysis
      </summary>
      
      <div style={{
        padding: '0.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        borderTop: '1px solid var(--border-color)',
        fontSize: '0.725rem',
        fontFamily: 'var(--font-mono), monospace',
        color: 'var(--text-muted)',
        whiteSpace: 'pre-wrap',
        lineHeight: '1.4'
      }}>
        {/* Thought block */}
        {thoughts && (
          <div>
            <div style={{ fontWeight: 700, color: 'var(--color-cs)', marginBottom: '0.25rem' }}>[THOUGHTS]</div>
            <div>{thoughts}</div>
          </div>
        )}

        {/* Search plan block */}
        {searchPlan && (
          <div style={{ borderTop: thoughts ? '1px dashed var(--border-color)' : 'none', paddingTop: thoughts ? '0.5rem' : 0 }}>
            <div style={{ fontWeight: 700, color: 'var(--color-math)', marginBottom: '0.25rem' }}>[SEARCH PLAN]</div>
            <div>{searchPlan}</div>
          </div>
        )}

        {/* Notes analysis block */}
        {notesAnalysis && (
          <div style={{ borderTop: (thoughts || searchPlan) ? '1px dashed var(--border-color)' : 'none', paddingTop: (thoughts || searchPlan) ? '0.5rem' : 0 }}>
            <div style={{ fontWeight: 700, color: 'var(--color-humanities)', marginBottom: '0.25rem' }}>[NOTES ANALYSIS]</div>
            <div>{notesAnalysis}</div>
          </div>
        )}
      </div>
    </details>
  );
}

// Custom Markdown and Wiki-Link Compiler
function parseTableRow(rowLine: string): string[] {
  let trimmed = rowLine.trim();
  if (trimmed.startsWith('|')) trimmed = trimmed.substring(1);
  if (trimmed.endsWith('|')) trimmed = trimmed.substring(0, trimmed.length - 1);
  return trimmed.split('|').map(cell => cell.trim());
}

function parseAlignments(sepLine: string): string[] {
  let trimmed = sepLine.trim();
  if (trimmed.startsWith('|')) trimmed = trimmed.substring(1);
  if (trimmed.endsWith('|')) trimmed = trimmed.substring(0, trimmed.length - 1);
  return trimmed.split('|').map(cell => {
    const c = cell.trim();
    const left = c.startsWith(':');
    const right = c.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    return 'left';
  });
}

function parseTables(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let i = 0;
  
  while (i < lines.length) {
    const line = lines[i];
    const isRow = (l: string) => l.includes('|');
    
    if (isRow(line) && i + 1 < lines.length) {
      const nextLine = lines[i + 1];
      const isSeparator = /^\s*\|?\s*(:?\s*-+\s*:?\s*\|?\s*)+\s*$/.test(nextLine);
      
      if (isSeparator) {
        const headers = parseTableRow(line);
        const alignments = parseAlignments(nextLine);
        
        let j = i + 2;
        const rows: string[][] = [];
        while (j < lines.length && isRow(lines[j])) {
          rows.push(parseTableRow(lines[j]));
          j++;
        }
        
        let tableHtml = '\n\n<table style="border-collapse: collapse; width: 100%; margin-bottom: 1.5rem; border: 1px solid var(--border-color); font-size: 0.9rem;">';
        tableHtml += '<thead><tr style="background-color: var(--bg-secondary); border-bottom: 2px solid var(--border-color);">';
        headers.forEach((header, idx) => {
          const align = alignments[idx] || 'left';
          tableHtml += `<th style="padding: 0.6rem 0.8rem; text-align: ${align}; border: 1px solid var(--border-color); font-weight: 700;">${header}</th>`;
        });
        tableHtml += '</tr></thead>';
        
        tableHtml += '<tbody>';
        rows.forEach((row, rowIdx) => {
          const rowBg = rowIdx % 2 === 0 ? 'var(--bg-primary)' : 'var(--bg-secondary)';
          tableHtml += `<tr style="background-color: ${rowBg}; border-bottom: 1px solid var(--border-color);">`;
          for (let idx = 0; idx < headers.length; idx++) {
            const cell = row[idx] || '';
            const align = alignments[idx] || 'left';
            tableHtml += `<td style="padding: 0.6rem 0.8rem; text-align: ${align}; border: 1px solid var(--border-color);">${cell}</td>`;
          }
          tableHtml += '</tr>';
        });
        tableHtml += '</tbody></table>\n\n';
        
        result.push(tableHtml);
        i = j;
        continue;
      }
    }
    
    result.push(line);
    i++;
  }
  return result.join('\n');
}

function resolveSlugToUrl(slug: string): string {
  const s = slug.trim();
  if (s.includes('::')) {
    const parts = s.split('::');
    const parent = parts[0].toLowerCase();
    const section = parts[parts.length - 1].toLowerCase();
    if (section === 'introduction') {
      return `/notes/${parent}`;
    }
    return `/notes/${parent}#${section}`;
  }
  
  if (s.startsWith('/') || s.startsWith('http://') || s.startsWith('https://')) {
    return s;
  }
  
  const target = /[A-Z\s]/.test(s)
    ? s.toLowerCase().replace(/[\s_]+/g, '-').replace(/[^\w-]/g, '')
    : s.toLowerCase();
  return `/notes/${target}`;
}

// Custom Markdown and Wiki-Link Compiler
export function parseMarkdown(text: string): string {
  if (!text) return '';

  let textToParse = text;
  
  // Handle unclosed code blocks for streaming
  const codeBlockCount = (textToParse.match(/```/g) || []).length;
  if (codeBlockCount % 2 !== 0) {
    textToParse += '\n```';
  }

  // Handle unclosed display math blocks for streaming
  const displayMathCount = (textToParse.match(/\$\$/g) || []).length;
  if (displayMathCount % 2 !== 0) {
    textToParse += '\n$$';
  }

  // Protect display math blocks ($$...$$)
  const mathBlocks: string[] = [];
  textToParse = textToParse.replace(/\$\$([\s\S]*?)\$\$/g, (_, math) => {
    const placeholder = `__MATH_BLOCK_PLACEHOLDER_${mathBlocks.length}__`;
    try {
      const rendered = katex.renderToString(math.trim(), {
        displayMode: true,
        throwOnError: false
      });
      mathBlocks.push(rendered);
    } catch {
      mathBlocks.push(`<div class="katex-error" style="color:var(--color-cs);padding:0.5rem;background:rgba(224,90,71,0.05);margin:0.5rem 0;">$$${math}$$</div>`);
    }
    return placeholder;
  });

  // Protect inline math ($...$)
  const inlineMaths: string[] = [];
  textToParse = textToParse.replace(/\$([^\s\$](?:[^\$\n]*?[^\s\$])?)\$/g, (_, math) => {
    if (/^\s*\d+(\.\d+)?\s*$/.test(math) || math.trim() === '') {
      return `$${math}$`;
    }
    const placeholder = `__INLINE_MATH_PLACEHOLDER_${inlineMaths.length}__`;
    try {
      const rendered = katex.renderToString(math.trim(), {
        displayMode: false,
        throwOnError: false
      });
      inlineMaths.push(rendered);
    } catch {
      inlineMaths.push(`<span class="katex-error" style="color:var(--color-cs);">$${math}$</span>`);
    }
    return placeholder;
  });

  // 1. Escape HTML
  let html = textToParse
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Protect code blocks from markdown transformations
  const codeBlocks: string[] = [];
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
    const placeholder = `__CODE_BLOCK_PLACEHOLDER_${codeBlocks.length}__`;
    codeBlocks.push(`<pre><code class="language-${lang}">${code.trim()}</code></pre>`);
    return placeholder;
  });

  // Protect inline code with emphasis blocks inside ``
  const inlineCodes: string[] = [];
  html = html.replace(/`([^`]+)`/g, (_, code) => {
    const placeholder = `__INLINE_CODE_PLACEHOLDER_${inlineCodes.length}__`;
    let parsedCode = code;
    parsedCode = parsedCode.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    parsedCode = parsedCode.replace(/__(.*?)__/g, '<strong>$1</strong>');
    parsedCode = parsedCode.replace(/\*(.*?)\*/g, '<em>$1</em>');
    parsedCode = parsedCode.replace(/_(.*?)_/g, '<em>$1</em>');
    inlineCodes.push(`<code>${parsedCode}</code>`);
    return placeholder;
  });

  // 2. Headers: ### Title -> <h3 ...>Title</h3>
  html = html.replace(/^(#{1,6})\s+(.+)$/gm, (_, hashes, content) => {
    const level = hashes.length;
    return `<h${level} style="font-weight: 700; margin-top: 1rem; margin-bottom: 0.5rem; color: var(--text-color); font-size: ${1.8 - level * 0.15}rem;">${content}</h${level}>`;
  });

  // 3. Blockquotes: > quote
  html = html.replace(/^>\s+(.+)$/gm, '<blockquote style="border-left: 4px solid var(--border-color); padding-left: 1rem; margin-left: 0; margin-right: 0; color: var(--text-muted); font-style: italic; margin-bottom: 0.75rem;">$1</blockquote>');

  // 4. Bold: **text**
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

  // 5. Italic: *text*
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

  // 6. Standard markdown links: [text](url) — handle before wikilinks
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, url) => {
    const targetUrl = resolveSlugToUrl(url);
    const isInternal = targetUrl.startsWith('/');
    const target = isInternal ? '' : ' target="_blank" rel="noopener noreferrer"';
    return `<a href="${targetUrl}"${target} class="wiki-link" style="color:var(--color-cs);font-weight:500;text-decoration:underline;">${label}</a>`;
  });

  // 6b. Double bracket wiki links: [[slug]] or [[display|slug]]
  html = html.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, p1, p2) => {
    const rawSlug = (p2 || p1).trim();
    const targetUrl = resolveSlugToUrl(rawSlug);
    const label = p1.trim();
    return `<a href="${targetUrl}" class="wiki-link" style="color:var(--color-cs);font-weight:500;text-decoration:underline;">${label}</a>`;
  });

  // 7. Bullet and Numbered lists & Horizontal Rules
  const lines = html.split('\n');
  let inList = false;
  let inNumberedList = false;
  const processedLines = lines.map(line => {
    const hrMatch = line.match(/^\s*([-*_])\s*\1\s*\1(?:\s*\1)*\s*$/);
    const listMatch = line.match(/^(\s*)[*-]\s+(.+)$/);
    const numMatch = line.match(/^(\s*)\d+\.\s+(.+)$/);
    if (hrMatch) {
      let prefix = '';
      if (inList) {
        prefix += '</ul>';
        inList = false;
      }
      if (inNumberedList) {
        prefix += '</ol>';
        inNumberedList = false;
      }
      return `${prefix}\n\n<hr style="border: 0; border-top: 1px solid var(--border-color); margin: 1.5rem 0;" />\n\n`;
    } else if (listMatch) {
      let prefix = '';
      if (inNumberedList) {
        prefix += '</ol>';
        inNumberedList = false;
      }
      if (!inList) {
        prefix += '<ul style="margin-left: 1.25rem; margin-bottom: 0.75rem; list-style-type: disc;">';
        inList = true;
      }
      return `${prefix}<li style="margin-bottom: 0.25rem;">${listMatch[2]}</li>`;
    } else if (numMatch) {
      let prefix = '';
      if (inList) {
        prefix += '</ul>';
        inList = false;
      }
      if (!inNumberedList) {
        prefix += '<ol style="margin-left: 1.25rem; margin-bottom: 0.75rem; list-style-type: decimal;">';
        inNumberedList = true;
      }
      return `${prefix}<li style="margin-bottom: 0.25rem;">${numMatch[2]}</li>`;
    } else {
      let prefix = '';
      if (inList) {
        prefix += '</ul>';
        inList = false;
      }
      if (inNumberedList) {
        prefix += '</ol>';
        inNumberedList = false;
      }
      return `${prefix}${line}`;
    }
  });
  if (inList) {
    processedLines.push('</ul>');
  }
  if (inNumberedList) {
    processedLines.push('</ol>');
  }
  html = processedLines.join('\n');

  // Parse Tables
  html = parseTables(html);

  // 8. Paragraph split
  const blocks = html.split(/\n\n+/);
  html = blocks.map(block => {
    const trimmed = block.trim();
    if (!trimmed) return '';
    if (
      trimmed.startsWith('<ul') ||
      trimmed.startsWith('<ol') ||
      trimmed.startsWith('<li') ||
      trimmed.startsWith('<pre') ||
      trimmed.startsWith('<h') ||
      trimmed.startsWith('<blockquote') ||
      trimmed.startsWith('<table') ||
      trimmed.startsWith('<hr') ||
      trimmed.startsWith('__CODE_BLOCK_PLACEHOLDER_') ||
      trimmed.startsWith('__MATH_BLOCK_PLACEHOLDER_')
    ) {
      return trimmed;
    }
    return `<p style="margin-bottom: 0.75rem; line-height: 1.5;">${trimmed.replace(/\n/g, '<br />')}</p>`;
  }).filter(Boolean).join('\n');

  // Restore code blocks, inline code, display math, and inline math
  codeBlocks.forEach((codeBlock, idx) => {
    html = html.replace(`__CODE_BLOCK_PLACEHOLDER_${idx}__`, codeBlock);
  });
  inlineCodes.forEach((inlineCode, idx) => {
    html = html.replace(`__INLINE_CODE_PLACEHOLDER_${idx}__`, inlineCode);
  });
  mathBlocks.forEach((mathBlock, idx) => {
    html = html.replace(`__MATH_BLOCK_PLACEHOLDER_${idx}__`, mathBlock);
  });
  inlineMaths.forEach((inlineMath, idx) => {
    html = html.replace(`__INLINE_MATH_PLACEHOLDER_${idx}__`, inlineMath);
  });

  return html;
}

export default function HikmaChat({ isOpen, onClose }: HikmaChatProps) {
  const { user } = useAuth();
  const supabase = getSupabaseBrowserClient();

  const {
    apiKey,
    mistralApiKey,
    hikmaName,
    systemPrompt,
    selectedModel,
    setSelectedModel,
    isKeySaved,
    isMistralKeySaved,
    activeSessionId,
    setActiveSessionId,
    sessions,
    refreshSessions,
  } = useHikma();

  const pathname = usePathname();
  const [selectedText, setSelectedText] = useState('');
  const [messages, setMessages] = useState<Content[]>([]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [currentResponse, setCurrentResponse] = useState('');
  const [thoughtSteps, setThoughtSteps] = useState<ThoughtStep[]>([]);
  const [isThoughtsExpanded, setIsThoughtsExpanded] = useState(true);
  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(null);

  // Autocomplete & Pinned Notes
  const [slugMap, setSlugMap] = useState<{
    byFilename: Record<string, string>;
    bySlug: Record<string, { filename: string; relativePath: string; title: string }>;
  } | null>(null);
  const [autocompleteVisible, setAutocompleteVisible] = useState(false);
  const [autocompleteQuery, setAutocompleteQuery] = useState('');
  const [autocompleteIndex, setAutocompleteIndex] = useState(0);
  const [atSymbolIndex, setAtSymbolIndex] = useState(-1);
  const [pinnedNotes, setPinnedNotes] = useState<{ slug: string; title: string }[]>([]);

  // Socratic clarification dialog
  const [clarification, setClarification] = useState<{
    question: string;
    options?: string[];
    resolve: (answer: string) => void;
  } | null>(null);

  // Sessions and Migration states
  const [migrationModalOpen, setMigrationModalOpen] = useState(false);

  // Overlay panel controls ('chat' | 'settings' | 'history')
  const [activePanel, setActivePanel] = useState<'chat' | 'settings' | 'history'>('chat');
  const [settingsTab, setSettingsTab] = useState<'agent' | 'api' | 'system' | 'user'>('agent');

  const activeHarnessRef = useRef<AgentHarness | null>(null);
  const chatAreaRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const skipNextLoadRef = useRef(false);

  // Load slug map on mount
  useEffect(() => {
    fetch('/api/notes?slugMap=true')
      .then(res => res.json())
      .then(data => setSlugMap(data))
      .catch(err => console.error('Failed to load slugMap:', err));
  }, []);

  // Listen for guest state migration flag from URL callback
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('migratestate') === 'true' && user) {
        const guestSessions = localStorage.getItem('maktaba_guest_sessions');
        if (guestSessions && JSON.parse(guestSessions).length > 0) {
          setMigrationModalOpen(true);
        }
        // Clean URL parameters
        const newUrl = window.location.pathname;
        window.history.replaceState({}, '', newUrl);
      }
    }
  }, [user]);

  // Load sessions list on user auth change, when drawer opens, or when history panel is shown
  useEffect(() => {
    refreshSessions();
  }, [user, supabase, isOpen, activePanel, refreshSessions]);

  // Load messages whenever active session changes
  useEffect(() => {
    if (skipNextLoadRef.current) {
      skipNextLoadRef.current = false;
      return;
    }

    if (activeSessionId) {
      setIsThinking(false);
      setThoughtSteps([]);
      setCurrentResponse('');
      
      loadMessages(supabase, user, activeSessionId)
        .then((dbMsgs) => {
          const modelMsgs: Content[] = dbMsgs.map((m) => ({
            role: m.role,
            parts: m.parts,
          }));
          setMessages(modelMsgs);
        })
        .catch(err => console.error('[HikmaChat] Failed to load messages:', err));
    } else {
      setMessages([]);
    }
  }, [activeSessionId, supabase, user]);

  // Auto-scroll chat area to bottom when messages or thoughts update
  useEffect(() => {
    if (chatAreaRef.current) {
      chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight;
    }
  }, [messages, currentResponse, thoughtSteps, isThinking]);

  // Listen for selection changes on the window to capture highlighted context
  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      const text = selection ? selection.toString().trim() : '';
      if (text.length > 0) {
        setSelectedText(text);
      }
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, []);

  // Automatically tag note context when a note page is opened
  useEffect(() => {
    if (!pathname || !slugMap) return;
    const match = pathname.match(/^\/notes\/([a-zA-Z0-9-_]+)$/);
    if (match) {
      const slug = match[1];
      const entry = slugMap.bySlug[slug];
      if (entry) {
        setPinnedNotes(prev => {
          if (prev.some(n => n.slug === slug)) return prev;
          return [...prev, { slug, title: entry.title }];
        });
      }
    }
  }, [pathname, slugMap]);

  // Handle Autocomplete Filtering
  const getFilteredNotes = () => {
    if (!slugMap || !autocompleteQuery) return [];
    const queryLower = autocompleteQuery.toLowerCase();
    
    // Return matching notes sorted by length of title to prioritize shorter/more precise matches
    return Object.entries(slugMap.byFilename)
      .filter(([filename]) => filename.toLowerCase().includes(queryLower))
      .map(([filename, slug]) => ({ title: filename, slug }))
      .slice(0, 5);
  };

  const filteredNotes = getFilteredNotes();

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setInput(value);

    // Adjust height dynamically
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;

    const selectionStart = e.target.selectionStart;
    const lastAtIndex = value.lastIndexOf('@', selectionStart - 1);

    if (lastAtIndex !== -1) {
      const textBetween = value.slice(lastAtIndex + 1, selectionStart);
      // Only trigger autocomplete if there are no spaces or newlines in the term
      if (!textBetween.includes(' ') && !textBetween.includes('\n')) {
        setAutocompleteVisible(true);
        setAutocompleteQuery(textBetween);
        setAtSymbolIndex(lastAtIndex);
        setAutocompleteIndex(0);
        return;
      }
    }
    setAutocompleteVisible(false);
    setAtSymbolIndex(-1);
  };

  const handleSelectNote = (note: { slug: string; title: string }) => {
    if (atSymbolIndex === -1) return;

    const beforeAt = input.slice(0, atSymbolIndex);
    const afterCursor = input.slice(textareaRef.current?.selectionStart || 0);
    
    // Insert reference tag in textarea
    const updatedText = `${beforeAt}@${note.title} ${afterCursor}`;
    setInput(updatedText);

    // Add note to pinned set if not already present
    if (!pinnedNotes.some(n => n.slug === note.slug)) {
      setPinnedNotes(prev => [...prev, note]);
    }

    setAutocompleteVisible(false);
    setAtSymbolIndex(-1);

    // Focus input and adjust cursor
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const cursorPosition = beforeAt.length + note.title.length + 2;
        textareaRef.current.setSelectionRange(cursorPosition, cursorPosition);
      }
    }, 10);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (autocompleteVisible && filteredNotes.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setAutocompleteIndex(prev => (prev + 1) % filteredNotes.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setAutocompleteIndex(prev => (prev - 1 + filteredNotes.length) % filteredNotes.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        handleSelectNote(filteredNotes[autocompleteIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setAutocompleteVisible(false);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleRemovePin = (slug: string) => {
    setPinnedNotes(prev => prev.filter(n => n.slug !== slug));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isThinking) return;

    const queryText = input.trim();
    setInput('');
    setIsThinking(true);
    setCurrentResponse('');
    setThoughtSteps([]);
    setIsThoughtsExpanded(true);
    setPendingUserMessage(queryText); // Show user bubble immediately

    if (textareaRef.current) {
      textareaRef.current.style.height = '38px';
    }

    // Append custom instruction for pinned notes if any are selected
    let finalQuery = queryText;
    if (pinnedNotes.length > 0) {
      const pinsStr = pinnedNotes.map(n => `"${n.title}" (slug: "${n.slug}")`).join(', ');
      finalQuery = `Note: The user has explicitly pinned the following note(s) as context: ${pinsStr}. Please prioritize reading their summaries or sections first using your tools.\n\nQuery: ${queryText}`;
    }

    if (selectedText) {
      finalQuery = `Note: The user has highlighted and shared the following excerpt from their active reading as context:
"""
${selectedText}
"""

${finalQuery}`;
    }

    setPinnedNotes([]); // Clear pins
    setSelectedText(''); // Clear selected text

    const onStepLog = (step: ThoughtStep) => {
      setThoughtSteps(prev => [...prev, step]);
    };

    const onStreamText = (text: string) => {
      setCurrentResponse(text);
    };

    const onClarificationPrompt = (question: string, options?: string[]): Promise<string> => {
      return new Promise<string>((resolve) => {
        setClarification({
          question,
          options,
          resolve: (answer: string) => {
            setClarification(null);
            resolve(answer);
          }
        });
      });
    };

    // Budget loops according to preset
    const maxLoops = 20;

    let currentSessionId = activeSessionId;

    try {
      if (!currentSessionId) {
        skipNextLoadRef.current = true;
        const sessionTitle = queryText.length > 30 ? queryText.slice(0, 30) + '...' : queryText;
        const sessionObj = await createSession(supabase, user, sessionTitle, selectedModel);
        currentSessionId = sessionObj.id;
        setActiveSessionId(currentSessionId);
        // Refresh sessions list
        refreshSessions();
      }

      // Save user message to storage
      await saveMessage(supabase, user, currentSessionId, 'user', [{ text: finalQuery }]);

      const harness = new AgentHarness(apiKey, onStepLog, onStreamText, onClarificationPrompt);
      activeHarnessRef.current = harness;

      // Run harness with current messages context mapped to Content[]
      const historyContext: Content[] = messages.map((m) => ({
        role: m.role,
        parts: m.parts,
      }));

      const updatedHistory = await harness.run(finalQuery, historyContext, systemPrompt, maxLoops, selectedModel, mistralApiKey);
      
      // Save all subsequent messages (tool calls, tool responses, and model response) to storage
      const newMsgs = updatedHistory.slice(historyContext.length + 1);
      for (const msg of newMsgs) {
        const isFinalModelResponse = msg === updatedHistory[updatedHistory.length - 1];
        await saveMessage(
          supabase,
          user,
          currentSessionId,
          msg.role as 'user' | 'model' | 'system',
          msg.parts,
          isFinalModelResponse ? thoughtSteps : undefined
        );
      }

      // Load fresh messages from DB to update state
      const freshDbMsgs = await loadMessages(supabase, user, currentSessionId);
      const mappedMsgs: Content[] = freshDbMsgs.map((m) => ({
        role: m.role,
        parts: m.parts,
      }));
      setMessages(mappedMsgs);
    } catch (err) {
      console.error('[HikmaChat] ReAct execution failed:', err);
      const errMsg = err instanceof Error ? err.message : 'An unexpected error occurred';
      
      if (currentSessionId) {
        try {
          await saveMessage(supabase, user, currentSessionId, 'model', [{ text: `Error: ${errMsg}` }]);
          const freshDbMsgs = await loadMessages(supabase, user, currentSessionId);
          setMessages(freshDbMsgs.map(m => ({ role: m.role, parts: m.parts })));
        } catch (saveErr) {
          console.error('[HikmaChat] Failed to save error message:', saveErr);
        }
      }
    } finally {
      setPendingUserMessage(null);
      setIsThinking(false);
      activeHarnessRef.current = null;
    }
  };

  const handleCancelRun = () => {
    if (activeHarnessRef.current) {
      activeHarnessRef.current.cancel();
      setIsThinking(false);
    }
  };

  const handleClearChat = () => {
    setActiveSessionId(null);
    setMessages([]);
    setThoughtSteps([]);
  };

  const getMessageText = (msg: Content): string => {
    const textPart = msg.parts.find(p => p.text);
    return textPart?.text || '';
  };

  const isToolMessage = (msg: Content): boolean => {
    return msg.parts.some(p => p.functionCall || p.functionResponse);
  };



  const getToolLogsForModelMessage = (modelMsgIdx: number, allMessages: Content[]): { name: string; query?: string; slug?: string; success: boolean }[] => {
    const logs: { name: string; query?: string; slug?: string; success: boolean }[] = [];
    let i = modelMsgIdx - 1;
    const collectedToolMessages: Content[] = [];
    while (i >= 0) {
      const prevMsg = allMessages[i];
      if (prevMsg.role === 'user' && !isToolMessage(prevMsg)) {
        break;
      }
      if (isToolMessage(prevMsg)) {
        collectedToolMessages.push(prevMsg);
      }
      i--;
    }
    collectedToolMessages.reverse();

    collectedToolMessages.forEach(msg => {
      msg.parts.forEach(part => {
        if (part.functionCall) {
          const call = part.functionCall;
          const args = call.args as Record<string, string | number | boolean | undefined>;
          const query = args?.query ? String(args.query) : undefined;
          const slug = args?.slug ? String(args.slug) : undefined;
          logs.push({
            name: call.name,
            query,
            slug,
            success: true,
          });
        }
        if (part.functionResponse) {
          const resp = part.functionResponse;
          const responseData = resp.response as Record<string, unknown> | undefined;
          const success = !(responseData && (responseData.error || responseData.err || responseData.failed));
          const matchingCall = [...logs].reverse().find(c => c.name === resp.name);
          if (matchingCall && !success) {
            matchingCall.success = false;
          }
        }
      });
    });
    return logs;
  };

  const renderToolLogsDashboard = (logs: { name: string; query?: string; slug?: string; success: boolean }[]) => {
    if (logs.length === 0) return null;

    return (
      <details style={{
        marginBottom: '0.75rem',
        border: '1px solid var(--border-color)',
        borderRadius: 'var(--radius-sm)',
        background: 'rgba(0, 0, 0, 0.15)',
        overflow: 'hidden'
      }}>
        <summary style={{
          padding: '0.35rem 0.5rem',
          fontSize: '0.725rem',
          cursor: 'pointer',
          fontFamily: 'var(--font-mono), monospace',
          color: 'var(--text-secondary)',
          userSelect: 'none'
        }}>
          Tool call logs ({logs.length})
        </summary>
        
        <div style={{
          padding: '0.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.35rem',
          borderTop: '1px solid var(--border-color)',
          fontSize: '0.725rem',
          fontFamily: 'var(--font-mono), monospace',
          color: 'var(--text-muted)',
          lineHeight: '1.4'
        }}>
          {logs.map((log, lIdx) => {
            const status = log.success ? '✓' : '✗';
            let hint = '';
            if (log.query) hint = ` "${log.query}"`;
            else if (log.slug) hint = ` "${log.slug}"`;
            return (
              <div key={lIdx} style={{ color: log.success ? 'inherit' : 'var(--color-cs)' }}>
                {status} {log.name}{hint}
              </div>
            );
          })}
        </div>
      </details>
    );
  };

  // Scans final response text for standard double bracket references to show source pills
  // Strip injected preamble from user messages so only the clean original query is shown.
  // Handles both "Note: The user has pinned…" and "Note: The user has highlighted…" prefixes.
  const getDisplayText = (text: string): string => {
    // Find the last occurrence of "\n\nQuery: " which marks where the real query starts
    const marker = '\n\nQuery: ';
    const idx = text.lastIndexOf(marker);
    if (idx !== -1) return text.slice(idx + marker.length).trim();
    // Fallback: if the whole thing is a preamble with no Query marker, return as-is
    return text;
  };

  const extractSources = (text: string): string[] => {
    const matches = text.match(/\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g);
    if (!matches) return [];
    
    const uniqueSlugs = new Set<string>();
    matches.forEach(m => {
      const parts = m.slice(2, -2).split('|');
      const term = parts[1] || parts[0];
      const slug = term.trim().toLowerCase().replace(/[-\s]+/g, '-').replace(/[^\w-]/g, '');
      if (slug) uniqueSlugs.add(slug);
    });
    return Array.from(uniqueSlugs);
  };

  // Find human readable titles from computed slugs
  const getNoteTitleFromSlug = (slug: string): string => {
    if (!slugMap) return slug;
    const entry = slugMap.bySlug[slug];
    return entry ? entry.title : slug;
  };

  return (
    <>
      {/* Background overlay when drawer is open */}
      {isOpen && <div className={styles.backdrop} onClick={onClose} />}

      <div
        className={`${styles.drawer} ${
          isOpen ? styles.drawerOpen : styles.drawerClosed
        }`}
      >
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerTitleWrapper}>
            <span className={styles.headerTitle}>{hikmaName}</span>
            <span className={styles.headerSubtitle}>Scholarly AI Companion</span>
          </div>

          <div className={styles.headerActions}>
            <button
              className={`${styles.iconBtn} ${
                activePanel === 'history' ? styles.activeAction : ''
              }`}
              title="Conversation History"
              onClick={() => {
                setActivePanel(prev => (prev === 'history' ? 'chat' : 'history'));
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 8v4l3 3" />
                <circle cx="12" cy="12" r="9" />
              </svg>
            </button>

            <button
              className={`${styles.iconBtn} ${
                activePanel === 'settings' && settingsTab === 'api' ? styles.activeAction : ''
              }`}
              title="Google AI Credentials"
              onClick={() => {
                setSettingsTab('api');
                setActivePanel(prev => (prev === 'settings' && settingsTab === 'api' ? 'chat' : 'settings'));
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
              </svg>
            </button>

            <button
              className={`${styles.iconBtn} ${
                activePanel === 'settings' && settingsTab !== 'api' ? styles.activeAction : ''
              }`}
              title="Configure Instructions"
              onClick={() => {
                setSettingsTab('agent');
                setActivePanel(prev => (prev === 'settings' && settingsTab === 'agent' ? 'chat' : 'settings'));
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
            </button>

            {messages.length > 0 && (
              <button
                className={styles.iconBtn}
                title="New Conversation"
                onClick={handleClearChat}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
              </button>
            )}

            <button
              className={styles.iconBtn}
              title="Close Drawer"
              onClick={onClose}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>
        </div>

        {/* Dynamic Panels */}
        <div className={styles.body}>
          {/* Settings Overlay */}
          {activePanel === 'settings' && (
            <div className={styles.overlayPanel}>
              <div className={styles.overlayHeader}>
                <span className={styles.overlayTitle}>
                  {settingsTab === 'api' ? 'API ACCESS PARAMETERS' : 'PRESETS & BEHAVIOR'}
                </span>
                <button
                  className={styles.iconBtn}
                  onClick={() => setActivePanel('chat')}
                >
                  Close
                </button>
              </div>
              <div className={styles.overlayContent} style={{ overflowY: 'auto', flex: 1, padding: '0.25rem 0' }}>
                <HikmaSettings defaultTab={settingsTab} onSaved={() => setActivePanel('chat')} />
              </div>
            </div>
          )}

          {/* History Overlay */}
          {activePanel === 'history' && (
            <div className={styles.overlayPanel}>
              <div className={styles.overlayHeader}>
                <span className={styles.overlayTitle}>CONVERSATION HISTORY</span>
                <button
                  className={styles.iconBtn}
                  onClick={() => setActivePanel('chat')}
                >
                  Close
                </button>
              </div>
              <div className={styles.overlayContent}>
                <button
                  className={styles.newSessionBtn}
                  onClick={() => {
                    handleClearChat();
                    setActivePanel('chat');
                  }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <line x1="5" y1="12" x2="19" y2="12"></line>
                  </svg>
                  New Conversation
                </button>

                {sessions.length === 0 ? (
                  <div style={{ textAlign: 'center', marginTop: '3rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                    No saved conversations found.
                  </div>
                ) : (
                  <div className={styles.historyList}>
                    {sessions.map((session) => {
                      const isActive = session.id === activeSessionId;
                      const dateStr = new Date(session.updated_at).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      });

                      return (
                        <div
                          key={session.id}
                          className={`${styles.historyItem} ${isActive ? styles.activeHistoryItem : ''}`}
                          onClick={() => {
                            setActiveSessionId(session.id);
                            setActivePanel('chat');
                          }}
                        >
                          <div className={styles.historyItemTitleWrapper}>
                            <div className={styles.historyItemTitle} title={session.title}>
                              {session.title}
                            </div>
                            <div className={styles.historyItemMeta}>
                              <span>{dateStr}</span>
                              <span className={styles.historyModelBadge}>{session.model_name}</span>
                            </div>
                          </div>
                          <button
                            className={styles.deleteSessionBtn}
                            title="Delete Conversation"
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (confirm('Are you sure you want to delete this conversation?')) {
                                try {
                                  await deleteSession(supabase, user, session.id);
                                  if (activeSessionId === session.id) {
                                    handleClearChat();
                                  }
                                  await refreshSessions();
                                } catch (err) {
                                  console.error('Failed to delete session:', err);
                                }
                              }
                            }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polyline points="3 6 5 6 21 6"></polyline>
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Socratic Clarification Modal Overlay */}
          {clarification && (
            <div className={styles.clarificationOverlay}>
              <div className={styles.clarificationCard}>
                <div className={styles.clarificationQuestion}>
                  {clarification.question}
                </div>
                <div className={styles.clarificationOptions}>
                  {clarification.options?.map((opt, idx) => (
                    <button
                      key={idx}
                      className={styles.optionBtn}
                      onClick={() => clarification.resolve(opt)}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
                <div className={styles.writeInWrapper}>
                  <input
                    type="text"
                    className={styles.writeInInput}
                    placeholder="Write a custom response..."
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        clarification.resolve(e.currentTarget.value.trim());
                      }
                    }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Chat scrolling feed */}
          <div className={styles.chatArea} ref={chatAreaRef}>
            {messages.length === 0 && !isThinking && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.75rem', marginTop: '1.5rem', padding: '0 0.5rem' }}>
                <div style={{ textAlign: 'center' }}>
                  <h4 style={{ fontFamily: 'var(--font-newsreader)', fontSize: '1.35rem', marginBottom: '0.5rem', color: 'var(--text-primary)' }}>
                    A Living Companion of Knowledge
                  </h4>
                  <p style={{ fontSize: '0.813rem', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                    Ask {hikmaName} to explain concepts, connect papers, or query tags. Use `@` followed by any keyword to pin relevant notes directly to context.
                  </p>
                </div>

                {sessions.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    <div style={{
                      fontSize: '0.725rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.05em',
                      color: 'var(--text-muted)',
                      fontFamily: 'var(--font-mono), monospace',
                      borderBottom: '1px solid var(--border-color)',
                      paddingBottom: '0.35rem'
                    }}>
                      Recent Research Sessions
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                      {sessions.slice(0, 10).map((session) => {
                        const dateStr = new Date(session.updated_at).toLocaleDateString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        });
                        return (
                          <div
                            key={session.id}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '0.65rem 0.85rem',
                              background: 'rgba(255, 255, 255, 0.02)',
                              border: '1px solid var(--border-color)',
                              borderRadius: 'var(--radius-sm)',
                              cursor: 'pointer',
                              fontSize: '0.813rem',
                            }}
                            className={styles.dashboardSessionItem}
                            onClick={() => {
                              setActiveSessionId(session.id);
                            }}
                          >
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', minWidth: 0, flex: 1 }}>
                              <div style={{ fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={session.title}>
                                {session.title}
                              </div>
                              <div style={{ fontSize: '0.688rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontFamily: 'var(--font-mono), monospace' }}>
                                <span>{dateStr}</span>
                                <span className={styles.historyModelBadge} style={{ margin: 0 }}>{session.model_name}</span>
                              </div>
                            </div>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                              <polyline points="9 18 15 12 9 6"></polyline>
                            </svg>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {messages
              .filter(msg => !isToolMessage(msg))
              .map((msg, idx) => {
                const rawText = getMessageText(msg);
                // For user messages, strip any injected context preamble so only the clean query shows
                const text = msg.role === 'user' ? getDisplayText(rawText) : rawText;
                const parsed = msg.role === 'model'
                  ? parseModelResponse(rawText)
                  : { thoughts: '', searchPlan: '', notesAnalysis: '', response: text };
                const sources = msg.role === 'model' ? extractSources(text) : [];

                return (
                  <div
                    key={idx}
                    className={`${styles.messageRow} ${
                      msg.role === 'user' ? styles.userRow : styles.modelRow
                    }`}
                  >
                    <div
                      className={`${styles.bubble} ${
                        msg.role === 'user' ? styles.userBubble : styles.modelBubble
                      }`}
                    >
                      <div className={styles.bubbleHeader}>
                        <span
                          className={
                            msg.role === 'user' ? styles.userName : styles.modelName
                          }
                        >
                          {msg.role === 'user' ? 'User' : hikmaName}
                        </span>
                      </div>
                      
                      {msg.role === 'model' && (
                        <>
                          {renderToolLogsDashboard(getToolLogsForModelMessage(messages.indexOf(msg), messages))}
                          {renderThoughtsDashboard(parsed, false)}
                        </>
                      )}

                    <div
                      className={styles.markdown}
                      dangerouslySetInnerHTML={{ __html: parseMarkdown(parsed.response) }}
                    />

                    {sources.length > 0 && (
                      <div className={styles.citations}>
                        <div className={styles.citationsTitle}>Cited library sources:</div>
                        <div className={styles.citationsList}>
                          {sources.map(slug => (
                            <a
                              key={slug}
                              href={`/notes/${slug}`}
                              className={styles.citationLink}
                            >
                              {getNoteTitleFromSlug(slug)}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Pending user bubble — shows immediately while agent is running */}
            {pendingUserMessage && (
              <div className={`${styles.messageRow} ${styles.userRow}`}>
                <div className={`${styles.bubble} ${styles.userBubble}`}>
                  <div className={styles.bubbleHeader}>
                    <span className={styles.userName}>User</span>
                  </div>
                  <div
                    className={styles.markdown}
                    dangerouslySetInnerHTML={{ __html: parseMarkdown(pendingUserMessage) }}
                  />
                </div>
              </div>
            )}

            {/* Current Active Streaming Thought logs & text bubble */}
            {isThinking && (
              <div className={`${styles.messageRow} ${styles.modelRow}`}>
                <div className={`${styles.bubble} ${styles.modelBubble}`}>
                  <div className={styles.bubbleHeader}>
                    <span className={styles.modelName}>{hikmaName} (Thinking...)</span>
                  </div>

                  {/* Collapsible thought logs */}
                  {thoughtSteps.length > 0 && (
                    <div className={styles.thoughtsContainer}>
                      <div
                        className={styles.thoughtsHeader}
                        onClick={() => setIsThoughtsExpanded(!isThoughtsExpanded)}
                      >
                        <div className={styles.thoughtsHeaderLeft}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}>
                              <circle cx="12" cy="12" r="10" />
                              <line x1="12" y1="8" x2="12" y2="12" />
                              <line x1="12" y1="16" x2="12.01" y2="16" />
                            </svg>
                          <span>Reasoning Steps ({thoughtSteps.length})</span>
                        </div>
                        <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                          {isThoughtsExpanded ? '▼ Collapse' : '▲ Expand'}
                        </span>
                      </div>

                      {isThoughtsExpanded && (
                        <div className={styles.thoughtsList}>
                          {thoughtSteps.map((step, sIdx) => (
                            <div key={sIdx} className={styles.thoughtItem}>
                              <span className={styles.thoughtIcon}>
                                {step.type === 'error' ? (
                                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <circle cx="12" cy="12" r="10" />
                                    <line x1="15" y1="9" x2="9" y2="15" />
                                    <line x1="9" y1="9" x2="15" y2="15" />
                                  </svg>
                                ) : (
                                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="9 18 15 12 9 6" />
                                  </svg>
                                )}
                              </span>
                              <span
                                className={`${styles.thoughtText} ${
                                  styles[`thought${step.type.charAt(0).toUpperCase() + step.type.slice(1)}`]
                                }`}
                              >
                                {step.message}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {(() => {
                    const parsed = parseModelResponse(currentResponse);
                    const { thoughts, searchPlan, notesAnalysis, response } = parsed;
                    const hasThoughts = thoughts || searchPlan || notesAnalysis;
                    return (
                      <>
                        {renderThoughtsDashboard(parsed, isThoughtsExpanded)}

                        <div className={styles.markdown}>
                          <span
                            dangerouslySetInnerHTML={{
                              __html: parseMarkdown(response || (hasThoughts ? '' : 'Retrieving library context...')),
                            }}
                          />
                          <span className={styles.cursor} />
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            )}
          </div>

          <div className={styles.bottomSection}>
            {/* Autocomplete Droplist */}
            {autocompleteVisible && filteredNotes.length > 0 && (
              <div className={styles.autocomplete}>
                {filteredNotes.map((note, index) => (
                  <div
                    key={note.slug}
                    className={`${styles.autocompleteItem} ${
                      index === autocompleteIndex ? styles.autocompleteItemActive : ''
                    }`}
                    onClick={() => handleSelectNote(note)}
                  >
                    <span>{note.title}</span>
                    <span className={styles.autocompleteSlug}>{note.slug}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Pinned References & Quote Row */}
            {(pinnedNotes.length > 0 || selectedText) && (
              <div className={styles.pinnedRow}>
                {selectedText && (
                  <div className={styles.selectedTextBadge}>
                    <span className={styles.selectedTextText} title={selectedText}>
                      📝 Quote: &quot;{selectedText.length > 40 ? selectedText.slice(0, 40) + '...' : selectedText}&quot;
                    </span>
                    <button
                      type="button"
                      className={styles.removePinBtn}
                      onClick={() => setSelectedText('')}
                    >
                      ×
                    </button>
                  </div>
                )}
                {pinnedNotes.map(note => (
                  <div key={note.slug} className={styles.pinnedBadge}>
                    <span>📌 {note.title}</span>
                    <button
                      type="button"
                      className={styles.removePinBtn}
                      onClick={() => handleRemovePin(note.slug)}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Entry Form */}
            <form onSubmit={handleSubmit} className={styles.inputForm}>
              <div className={styles.modelSelectRow}>
                <select
                  className={styles.modelDropdown}
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value as ActiveModel)}
                  title="Select active model"
                >
                  {isMistralKeySaved && (
                    <optgroup label="Mistral Models">
                      <option value="mistral-large-latest">Mistral Large</option>
                      <option value="mistral-medium-latest">Mistral Medium</option>
                      <option value="mistral-small-latest">Mistral Small</option>
                      <option value="codestral-latest">Codestral</option>
                      <option value="open-mixtral-8x22b">Mixtral 8x22B</option>
                      <option value="open-mixtral-8x7b">Mixtral 8x7B</option>
                      <option value="open-mistral-7b">Mistral 7B</option>
                    </optgroup>
                  )}
                  {(isKeySaved || (!isKeySaved && !isMistralKeySaved)) && (
                    <optgroup label="Gemini Models (Free)">
                      <option value="gemma-4-31b-it">Gemma 4 31B</option>
                      <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                    </optgroup>
                  )}
                </select>
              </div>
              <div className={styles.inputRow}>
                <textarea
                  ref={textareaRef}
                  className={styles.textarea}
                  placeholder="Ask anything... Use '@' to pin notes."
                  value={input}
                  onChange={handleTextareaChange}
                  onKeyDown={handleKeyDown}
                  disabled={isThinking}
                  rows={1}
                />
                {isThinking ? (
                  <button
                    type="button"
                    className={styles.btn}
                    style={{ background: '#ef4444' }}
                    onClick={handleCancelRun}
                  >
                    Cancel
                  </button>
                ) : (
                  <button
                    type="submit"
                    className={styles.btn}
                    disabled={!input.trim()}
                  >
                    Send
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      </div>

      {migrationModalOpen && (
        <div className={styles.clarificationOverlay} style={{ zIndex: 2000 }}>
          <div className={styles.clarificationCard} style={{ maxWidth: '400px', padding: '1.5rem' }}>
            <h4 style={{ fontFamily: 'var(--font-newsreader)', fontSize: '1.25rem', marginBottom: '0.75rem', color: 'var(--text-primary)' }}>
              Sync Guest Conversations
            </h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: '1.4', marginBottom: '1.5rem' }}>
              We found local chat history and customized companion settings from your guest session. Would you like to sync them to your cloud account so they are preserved across devices?
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                className={styles.btn}
                style={{ background: 'transparent', border: '1px solid var(--border-color)', color: 'var(--text-secondary)' }}
                onClick={async () => {
                  await clearAllLocalGuestData();
                  setMigrationModalOpen(false);
                  refreshSessions();
                }}
              >
                No, Clear Local Data
              </button>
              <button
                className={styles.btn}
                onClick={async () => {
                  if (supabase && user) {
                    try {
                      await migrateGuestData(supabase, user.id);
                      // Force reload to sync all settings fresh from Supabase profile
                      window.location.reload();
                    } catch (err) {
                      console.error('Migration failed:', err);
                      alert('Migration failed. Check console for details.');
                    }
                  }
                  setMigrationModalOpen(false);
                }}
              >
                Yes, Sync Data
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
