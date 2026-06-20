/* src/context/HikmaContext.tsx */
'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { GoogleGenerativeAI } from '@google/generative-ai';

export type PersonalityPreset = 'scholar' | 'tutor' | 'debate' | 'concise';
export type ActiveModel =
  | 'mistral-large-latest'
  | 'mistral-medium-latest'
  | 'mistral-small-latest'
  | 'codestral-latest'
  | 'open-mixtral-8x22b'
  | 'open-mixtral-8x7b'
  | 'open-mistral-7b'
  | 'gemma-4-31b-it'
  | 'gemini-2.5-flash';

export const PRESET_INSTRUCTIONS: Record<PersonalityPreset, string> = {
  scholar: 'Style: You are a meticulous scholar. Provide comprehensive, deeply academic, and highly structured explanations. Draw connections between concepts and cite notes clearly.',
  tutor: 'Style: You are a patient Socratic tutor. Guide the user step-by-step. Break down complex ideas and ask helpful questions to guide understanding rather than giving direct answers immediately. You should use the askUser tool to prompt active recall.',
  debate: 'Style: You are a critical thinker. Present arguments, counterarguments, and alternative perspectives on the material. Challenge assumptions and highlight historical or theoretical debates found in the library.',
  concise: 'Style: You are a highly direct assistant. Keep your responses short, concise, and focused. Limit elaboration and summarize the core point in 1-2 paragraphs.'
};

export const DEFAULT_SYSTEM_INSTRUCTION = (name: string) =>
`You are ${name}, the AI scholar and learning companion for the Maktaba library.
You answer user queries by gathering relevant notes and sections using the tools available to you.

Instructions:
- Maintain a structured, highly intellectual, and technical tone.
- Do not make assumptions or invent facts that are not grounded in the library contents. If the library doesn't contain relevant notes, state so honestly.
- Cite the notes you draw from using wikilink syntax with the exact slug returned by your tools, e.g. [[virtual-memory]]. Do not invent or guess slugs — only cite slugs you have retrieved via readNoteSummary, readNoteSection, or semanticSearch.
- Use semanticSearch to locate relevant note sections. Use readNoteSummary to view the outline of a note, and readNoteSection to read the exact text blocks you need.
- Always fetch the summary of a note before requesting its full body.
- If the user's intent is ambiguous or too broad, invoke askUser with clarifying choices.
- You must structure your text response using XML-like blocks. Wrap your internal thinking steps inside <thought>...</thought> tags. Wrap your search planning strategy inside <search_plan>...</search_plan> tags. Wrap your comparisons and links between library notes inside <notes_analysis>...</notes_analysis> tags. Wrap your final, polite, and scholarly answer to the user inside <response>...</response> tags. Do not output anything outside of these tags.`;

interface HikmaContextType {
  apiKey: string | null;
  isKeySaved: boolean;
  rememberKey: boolean;
  mistralApiKey: string | null;
  isMistralKeySaved: boolean;
  rememberMistralKey: boolean;
  selectedModel: ActiveModel;
  hikmaName: string;
  systemPrompt: string;
  preset: PersonalityPreset;
  userInstructions: string;
  saveApiKey: (key: string, remember: boolean) => Promise<boolean>;
  clearApiKey: () => void;
  saveMistralApiKey: (key: string, remember: boolean) => Promise<boolean>;
  clearMistralApiKey: () => void;
  setSelectedModel: (model: ActiveModel) => void;
  updateSettings: (name: string, preset: PersonalityPreset, userInstructions: string) => void;
}

const HikmaContext = createContext<HikmaContextType | undefined>(undefined);

export function HikmaProvider({ children }: { children: React.ReactNode }) {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [isKeySaved, setIsKeySaved] = useState(false);
  const [rememberKey, setRememberKey] = useState(false);

  const [mistralApiKey, setMistralApiKey] = useState<string | null>(null);
  const [isMistralKeySaved, setIsMistralKeySaved] = useState(false);
  const [rememberMistralKey, setRememberMistralKey] = useState(false);

  const [selectedModel, setSelectedModelState] = useState<ActiveModel>('mistral-large-latest');

  const [hikmaName, setHikmaName] = useState('Hikma');
  const [preset, setPreset] = useState<PersonalityPreset>('scholar');
  const [userInstructions, setUserInstructions] = useState('');

  // Derived compiled system prompt — rebuilds whenever name, preset, or instructions change
  const systemPrompt = `${PRESET_INSTRUCTIONS[preset]}\n\n${DEFAULT_SYSTEM_INSTRUCTION(hikmaName)}${
    userInstructions.trim() ? `\n\nUser Instructions:\n${userInstructions.trim()}` : ''
  }`;

  useEffect(() => {
    // Load values from storage on mount
    const savedName = localStorage.getItem('hikma_custom_name');
    if (savedName) setHikmaName(savedName);

    const savedPreset = localStorage.getItem('hikma_preset');
    if (savedPreset) setPreset(savedPreset as PersonalityPreset);

    const savedUserInstructions = localStorage.getItem('hikma_user_instructions');
    if (savedUserInstructions) setUserInstructions(savedUserInstructions);

    // Try loading API key from session storage first
    let savedKey = sessionStorage.getItem('maktaba_gemini_api_key');
    let remembered = false;
    if (!savedKey) {
      savedKey = localStorage.getItem('maktaba_gemini_api_key');
      if (savedKey) remembered = true;
    }
    if (savedKey) {
      setApiKey(savedKey);
      setIsKeySaved(true);
      setRememberKey(remembered);
    }

    // Try loading Mistral API key from session storage first
    let savedMistralKey = sessionStorage.getItem('maktaba_mistral_api_key');
    let rememberedMistral = false;
    if (!savedMistralKey) {
      savedMistralKey = localStorage.getItem('maktaba_mistral_api_key');
      if (savedMistralKey) rememberedMistral = true;
    }
    if (savedMistralKey) {
      setMistralApiKey(savedMistralKey);
      setIsMistralKeySaved(true);
      setRememberMistralKey(rememberedMistral);
    }

    // Load selected model preference
    const savedModel = localStorage.getItem('hikma_selected_model');
    if (
      savedModel === 'mistral-large-latest' ||
      savedModel === 'mistral-medium-latest' ||
      savedModel === 'mistral-small-latest' ||
      savedModel === 'codestral-latest' ||
      savedModel === 'open-mixtral-8x22b' ||
      savedModel === 'open-mixtral-8x7b' ||
      savedModel === 'open-mistral-7b' ||
      savedModel === 'gemma-4-31b-it' ||
      savedModel === 'gemini-2.5-flash'
    ) {
      setSelectedModelState(savedModel as ActiveModel);
    } else {
      // Default: Prioritize mistral large if Mistral API Key is available
      if (savedMistralKey) {
        setSelectedModelState('mistral-large-latest');
      } else {
        setSelectedModelState('gemma-4-31b-it');
      }
    }

  }, []);

  const saveApiKey = async (key: string, remember: boolean): Promise<boolean> => {
    const trimmed = key.trim();
    if (!trimmed) return false;

    try {
      // Validate by making a lightweight direct client SDK test generation call
      const genAI = new GoogleGenerativeAI(trimmed);
      const model = genAI.getGenerativeModel({ model: 'gemma-4-31b-it' });
      
      // Perform a minimal, token-efficient query
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: 'Respond with the word "Ok" only.' }] }],
      });
      
      const response = await result.response;
      if (!response.text()) {
        throw new Error('No content returned from Gemini model');
      }

      // If validation succeeds, save key
      setApiKey(trimmed);
      setIsKeySaved(true);
      setRememberKey(remember);

      if (remember) {
        localStorage.setItem('maktaba_gemini_api_key', trimmed);
        sessionStorage.removeItem('maktaba_gemini_api_key');
      } else {
        sessionStorage.setItem('maktaba_gemini_api_key', trimmed);
        localStorage.removeItem('maktaba_gemini_api_key');
      }
      return true;
    } catch (err) {
      console.error('[HikmaContext] Gemini API Key validation failed:', err);
      return false;
    }
  };

  const clearApiKey = () => {
    setApiKey(null);
    setIsKeySaved(false);
    setRememberKey(false);
    sessionStorage.removeItem('maktaba_gemini_api_key');
    localStorage.removeItem('maktaba_gemini_api_key');
    setSelectedModel('mistral-large-latest');
  };

  const saveMistralApiKey = async (key: string, remember: boolean): Promise<boolean> => {
    const trimmed = key.trim();
    if (!trimmed) return false;

    try {
      // Validate by making a lightweight check to Mistral completions API
      const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${trimmed}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'mistral-small-latest',
          messages: [{ role: 'user', content: 'Respond with Ok only.' }],
          max_tokens: 5
        })
      });

      if (!res.ok) {
        throw new Error('Mistral key check returned error status');
      }

      setMistralApiKey(trimmed);
      setIsMistralKeySaved(true);
      setRememberMistralKey(remember);

      if (remember) {
        localStorage.setItem('maktaba_mistral_api_key', trimmed);
        sessionStorage.removeItem('maktaba_mistral_api_key');
      } else {
        sessionStorage.setItem('maktaba_mistral_api_key', trimmed);
        localStorage.removeItem('maktaba_mistral_api_key');
      }
      return true;
    } catch (err) {
      console.error('[HikmaContext] Mistral API Key validation failed:', err);
      return false;
    }
  };

  const clearMistralApiKey = () => {
    setMistralApiKey(null);
    setIsMistralKeySaved(false);
    setRememberMistralKey(false);
    sessionStorage.removeItem('maktaba_mistral_api_key');
    localStorage.removeItem('maktaba_mistral_api_key');
    setSelectedModel('gemma-4-31b-it');
  };

  const setSelectedModel = (model: ActiveModel) => {
    setSelectedModelState(model);
    localStorage.setItem('hikma_selected_model', model);
  };

  const updateSettings = (name: string, newPreset: PersonalityPreset, customInstructions: string) => {
    setHikmaName(name);
    setPreset(newPreset);
    setUserInstructions(customInstructions);

    localStorage.setItem('hikma_custom_name', name);
    localStorage.setItem('hikma_preset', newPreset);
    localStorage.setItem('hikma_user_instructions', customInstructions);
  };

  return (
    <HikmaContext.Provider
      value={{
        apiKey,
        isKeySaved,
        rememberKey,
        mistralApiKey,
        isMistralKeySaved,
        rememberMistralKey,
        selectedModel,
        hikmaName,
        systemPrompt,
        preset,
        userInstructions,
        saveApiKey,
        clearApiKey,
        saveMistralApiKey,
        clearMistralApiKey,
        setSelectedModel,
        updateSettings,
      }}
    >
      {children}
    </HikmaContext.Provider>
  );
}

export function useHikma() {
  const context = useContext(HikmaContext);
  if (!context) {
    throw new Error('useHikma must be used within a HikmaProvider');
  }
  return context;
}
