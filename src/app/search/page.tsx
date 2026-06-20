/* src/app/search/page.tsx */
'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useHikma, ActiveModel } from '../../context/HikmaContext';
import { AgentHarness, ChatMessage, ThoughtStep } from '../../lib/agent-harness';
import { parseMarkdown } from '../../components/HikmaChat';
import HikmaSettings from '../../components/HikmaSettings';
import styles from './search.module.css';

// ─────────────────────────────────────────────────────────────────────────────
// XML tag parser helpers
// ─────────────────────────────────────────────────────────────────────────────

interface ParsedResponse {
  thoughts: string;
  searchPlan: string;
  notesAnalysis: string;
  response: string;
}

function extractTag(text: string, tag: string): string {
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  const s = text.indexOf(open);
  const e = text.indexOf(close);
  if (s === -1) return '';
  if (e === -1) return text.slice(s + open.length).trim();
  return text.slice(s + open.length, e).trim();
}

function parseModelResponse(text: string): ParsedResponse {
  const thoughts      = extractTag(text, 'thought');
  const searchPlan    = extractTag(text, 'search_plan');
  const notesAnalysis = extractTag(text, 'notes_analysis');
  const response      = extractTag(text, 'response');
  if (!thoughts && !searchPlan && !notesAnalysis && !response) {
    return { thoughts: '', searchPlan: '', notesAnalysis: '', response: text.trim() };
  }
  return { thoughts, searchPlan, notesAnalysis, response };
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

function ThoughtPanel({ parsed, open: defaultOpen }: { parsed: ParsedResponse; open: boolean }) {
  const { thoughts, searchPlan, notesAnalysis } = parsed;
  if (!thoughts && !searchPlan && !notesAnalysis) return null;
  const count = [thoughts, searchPlan, notesAnalysis].filter(Boolean).length;
  return (
    <details className={styles.thoughtBox} open={defaultOpen}>
      <summary className={styles.thoughtSummary}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" />
        </svg>
        Thought process ({count} step{count !== 1 ? 's' : ''})
      </summary>
      <div className={styles.thoughtBody}>
        {thoughts && (
          <div>
            <div className={styles.thoughtSectionHeader}>[REASONING]</div>
            {thoughts}
          </div>
        )}
        {searchPlan && (
          <div>
            <div className={styles.thoughtSectionHeader}>[SEARCH PLAN]</div>
            {searchPlan}
          </div>
        )}
        {notesAnalysis && (
          <div>
            <div className={styles.thoughtSectionHeader}>[NOTES ANALYSIS]</div>
            {notesAnalysis}
          </div>
        )}
      </div>
    </details>
  );
}

function ToolPill({ text }: { text: string }) {
  return (
    <div className={styles.toolPill}>
      <span className={styles.toolSpinner} />
      {text}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

interface NoteRef { slug: string; title: string }
type SlugMap = {
  byFilename: Record<string, string>;
  bySlug: Record<string, { filename: string; relativePath: string; title: string }>;
} | null;

export default function HikmaLoungeChat() {
  const {
    apiKey,
    mistralApiKey,
    systemPrompt,
    hikmaName,
    selectedModel,
    setSelectedModel,
    isKeySaved,
    isMistralKeySaved
  } = useHikma();

  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [steps, setSteps] = useState<ThoughtStep[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [currentResponse, setCurrentResponse] = useState('');
  const [selectedText, setSelectedText] = useState('');
  const [pinnedNotes, setPinnedNotes] = useState<NoteRef[]>([]);
  const [slugMap, setSlugMap] = useState<SlugMap>(null);
  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(null);

  // @ autocomplete
  const [autocompleteVisible, setAutocompleteVisible] = useState(false);
  const [autocompleteQuery, setAutocompleteQuery] = useState('');
  const [autocompleteIndex, setAutocompleteIndex] = useState(0);
  const [atSymbolIndex, setAtSymbolIndex] = useState(-1);

  // Clarification modal
  const [clarification, setClarification] = useState<{
    question: string; options?: string[]; resolve: (a: string) => void;
  } | null>(null);

  const activeHarnessRef = useRef<AgentHarness | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const writeInInputRef = useRef<HTMLInputElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Load slug map
  useEffect(() => {
    fetch('/api/notes?slugMap=true')
      .then(r => r.json())
      .then(d => setSlugMap(d))
      .catch(() => {});
  }, []);

  // Capture highlighted text
  useEffect(() => {
    const handler = () => {
      const sel = window.getSelection();
      const txt = sel ? sel.toString().trim() : '';
      if (txt.length > 10) setSelectedText(txt);
    };
    document.addEventListener('selectionchange', handler);
    return () => document.removeEventListener('selectionchange', handler);
  }, []);



  // Auto-scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [history, currentResponse, steps]);

  // ── Autocomplete helpers ──────────────────────────────────────────────────

  const getFilteredNotes = useCallback((): NoteRef[] => {
    if (!slugMap || !autocompleteQuery) return [];
    const q = autocompleteQuery.toLowerCase();
    return Object.entries(slugMap.byFilename)
      .filter(([name]) => name.toLowerCase().includes(q))
      .map(([name, slug]) => ({ title: name, slug }))
      .slice(0, 6);
  }, [slugMap, autocompleteQuery]);

  const filteredNotes = getFilteredNotes();

  const handleSelectNote = useCallback((note: NoteRef) => {
    if (atSymbolIndex === -1 || !textareaRef.current) return;
    const before = query.slice(0, atSymbolIndex);
    const after  = query.slice(textareaRef.current.selectionStart);
    const updated = `${before}@${note.title} ${after}`;
    setQuery(updated);
    if (!pinnedNotes.some(n => n.slug === note.slug)) {
      setPinnedNotes(prev => [...prev, note]);
    }
    setAutocompleteVisible(false);
    setAtSymbolIndex(-1);
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        const pos = before.length + note.title.length + 2;
        textareaRef.current.setSelectionRange(pos, pos);
      }
    }, 10);
  }, [atSymbolIndex, query, pinnedNotes]);

  // ── Event Handlers ────────────────────────────────────────────────────────

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setQuery(val);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 220)}px`;

    const cursor = e.target.selectionStart;
    const lastAt = val.lastIndexOf('@', cursor - 1);
    if (lastAt !== -1) {
      const between = val.slice(lastAt + 1, cursor);
      if (!between.includes(' ') && !between.includes('\n')) {
        setAutocompleteVisible(true);
        setAutocompleteQuery(between);
        setAtSymbolIndex(lastAt);
        setAutocompleteIndex(0);
        return;
      }
    }
    setAutocompleteVisible(false);
    setAtSymbolIndex(-1);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (autocompleteVisible && filteredNotes.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setAutocompleteIndex(i => (i + 1) % filteredNotes.length); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setAutocompleteIndex(i => (i - 1 + filteredNotes.length) % filteredNotes.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); handleSelectNote(filteredNotes[autocompleteIndex]); return; }
      if (e.key === 'Escape') { e.preventDefault(); setAutocompleteVisible(false); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e); }
  };

  const handleCancel = () => {
    activeHarnessRef.current?.cancel();
    setIsThinking(false);
  };

  const handleClearHistory = () => {
    setHistory([]); setSteps([]); setCurrentResponse('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || isThinking) return;

    const userPrompt = query.trim();
    setQuery('');
    if (textareaRef.current) textareaRef.current.style.height = '44px';
    setIsThinking(true);
    setCurrentResponse('');
    setSteps([]);
    setPendingUserMessage(userPrompt); // Show bubble immediately

    const onStepLog  = (step: ThoughtStep) => setSteps(prev => [...prev, step]);
    const onStream   = (text: string) => setCurrentResponse(text);
    const onClarify  = (question: string, options?: string[]): Promise<string> =>
      new Promise(resolve => setClarification({ question, options, resolve: a => { setClarification(null); resolve(a); } }));

    let finalQuery = userPrompt;
    if (pinnedNotes.length > 0) {
      const pins = pinnedNotes.map(n => `"${n.title}" (slug: "${n.slug}")`).join(', ');
      finalQuery = `Note: The user has pinned: ${pins}. Please prioritise these notes.\n\nQuery: ${userPrompt}`;
    }
    if (selectedText) {
      finalQuery = `Note: The user has highlighted this excerpt as context:\n"""\n${selectedText}\n"""\n\n${finalQuery}`;
    }

    setPinnedNotes([]);
    setSelectedText('');

    const harness = new AgentHarness(apiKey, onStepLog, onStream, onClarify);
    activeHarnessRef.current = harness;
    try {
      const updated = await harness.run(finalQuery, history, systemPrompt, 20, selectedModel, mistralApiKey);
      setHistory(updated);
    } catch (err) {
      console.error('[HikmaLounge]', err);
      const errMsg = err instanceof Error ? err.message : 'An unexpected error occurred';
      setHistory(prev => [
        ...prev,
        {
          role: 'user',
          parts: [{ text: finalQuery }]
        },
        {
          role: 'model',
          parts: [{ text: `Error: ${errMsg}` }]
        }
      ]);
    } finally {
      setPendingUserMessage(null); // History now has the real message
      setIsThinking(false);
      activeHarnessRef.current = null;
    }
  };

  // Strip injected context preamble so historical user bubbles show only the original query.
  const getDisplayText = (text: string): string => {
    const marker = '\n\nQuery: ';
    const idx = text.lastIndexOf(marker);
    if (idx !== -1) return text.slice(idx + marker.length).trim();
    return text;
  };

  // ── Tool message helpers ──────────────────────────────────────────────────

  const isToolMessage = (msg: ChatMessage) => msg.parts.some(p => p.functionCall || p.functionResponse);

  const getToolText = (msg: ChatMessage): string => {
    const calls = msg.parts.filter(p => p.functionCall);
    if (calls.length > 0) {
      return calls.map(p => {
        const args = p.functionCall!.args as Record<string, string | number | boolean | undefined>;
        let hint = '';
        if (args?.query) hint = ` "${args.query}"`;
        else if (args?.slug) hint = ` "${args.slug}"`;
        return `${p.functionCall!.name}${hint}`;
      }).join(' · ');
    }
    return msg.parts.filter(p => p.functionResponse).map(p => `✓ ${p.functionResponse!.name}`).join(' · ');
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  const hasHistory = history.filter(m => !isToolMessage(m)).length > 0 || isThinking || !!pendingUserMessage;

  return (
    <div className={styles.container}>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className={styles.header}>
        {/* Left side — action buttons */}
        <div className={styles.headerLeft}>
          {hasHistory && (
            <button
              type="button"
              className={styles.iconBtn}
              onClick={handleClearHistory}
              title="New chat"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          )}
        </div>

        {/* Centre — title */}
        <div className={styles.headerCenter}>
          <h1 className={styles.title}>{hikmaName}</h1>
        </div>

        {/* Right side — settings */}
        <div className={styles.headerRight}>
          <button
            type="button"
            className={`${styles.iconBtn} ${showSettings ? styles.iconBtnActive : ''}`}
            onClick={() => setShowSettings(v => !v)}
            title="Custom instructions"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9" />
            </svg>
          </button>
        </div>
      </header>

      {/* ── Settings slide-out panel ────────────────────────────────────── */}
      {showSettings && (
        <div className={styles.settingsOverlay}>
          <div className={styles.settingsHeader}>
            <span className={styles.settingsLabel}>Settings</span>
            <button className={styles.iconBtn} onClick={() => setShowSettings(false)} title="Close">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', padding: '0.25rem 0' }}>
            <HikmaSettings onSaved={() => setShowSettings(false)} />
          </div>
        </div>
      )}

      {/* ── Clarification modal ────────────────────────────────────────── */}
      {clarification && (
        <div className={styles.modalOverlay}>
          <div className={styles.modal}>
            <h3 className={styles.modalQuestion}>{clarification.question}</h3>
            {clarification.options && clarification.options.length > 0 && (
              <div className={styles.modalOptions}>
                {clarification.options.map((opt, i) => (
                  <button key={i} className={styles.optionBtn} onClick={() => clarification.resolve(opt)}>
                    {opt}
                  </button>
                ))}
              </div>
            )}
            <div className={styles.writeInContainer}>
              <input
                type="text"
                className={styles.modalInput}
                placeholder="Type your answer…"
                ref={writeInInputRef}
                onKeyDown={e => { if (e.key === 'Enter') clarification.resolve(e.currentTarget.value.trim()); }}
              />
              <button className={styles.modalBtn} onClick={() => { if (writeInInputRef.current?.value.trim()) clarification.resolve(writeInInputRef.current.value.trim()); }}>
                Send
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Chat shell ────────────────────────────────────────────────────── */}
      <div className={styles.layout}>
        <div className={styles.chatScrollArea}>

          {/* ── Empty / welcome screen ─────────────────────────────────────── */}
          {!hasHistory && (
            <div className={styles.emptyStateWrap}>
              <h2 className={styles.emptyStateTitle}>What can I help you with?</h2>
              <p className={styles.emptyStateDesc}>
                Ask {hikmaName} anything about your library. Use <code>@filename</code> to pin notes or highlight text to add it as context.
              </p>
              <div className={styles.suggestionGrid}>
                {[
                  { label: 'Synthesis', text: 'Synthesise the SQL Left Outer Join notes with examples' },
                  { label: 'Explore',  text: 'Explain the core argument of the Gödel Incompleteness note' },
                  { label: 'Connect',  text: 'What connections exist between Complexity Theory and Logic?' },
                  { label: 'Quiz',     text: 'Quiz me on the main ideas in my CS notes' },
                ].map(s => (
                  <button key={s.label} className={styles.suggestionCard} onClick={() => setQuery(s.text)}>
                    <span className={styles.suggestionLabel}>{s.label}</span>
                    <span className={styles.suggestionText}>{s.text}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── Message feed ──────────────────────────────────────────────── */}
          {hasHistory && (
            <div className={styles.chatFeed}>
              {history.map((msg, idx) => {
                // Tool calls → pill strip
                if (isToolMessage(msg)) {
                  const txt = getToolText(msg);
                  if (!txt) return null;
                  return (
                    <div key={idx} className={styles.toolPillsContainer}>
                      <div className={styles.toolPill}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, opacity: 0.6 }}>
                          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                        </svg>
                        {txt}
                      </div>
                    </div>
                  );
                }

                const textPart = msg.parts.find(p => p.text);
                const raw = textPart?.text || '';
                const parsed = parseModelResponse(raw);

                if (msg.role === 'user') {
                  const displayText = getDisplayText(raw);
                  return (
                    <div key={idx} className={`${styles.messageRow} ${styles.userRow}`}>
                      <div className={styles.messageBubble}>
                        <div className={styles.msgUser} dangerouslySetInnerHTML={{ __html: parseMarkdown(displayText) }} />
                      </div>
                    </div>
                  );
                }

                // Model message
                return (
                  <div key={idx} className={`${styles.messageRow} ${styles.modelRow}`}>
                    <div className={styles.avatar}>ح</div>
                    <div className={styles.messageContent}>
                      <div className={styles.msgHeader}>
                        {hikmaName}
                        <span className={styles.modelTag}>AI Scholar</span>
                      </div>
                      <div className={`${styles.messageBubble} ${styles.msgModel}`}>
                        <ThoughtPanel parsed={parsed} open={false} />
                        <div dangerouslySetInnerHTML={{ __html: parseMarkdown(parsed.response || raw) }} />
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* ── Pending user bubble — shows immediately on submit ──────── */}
              {pendingUserMessage && (
                <div className={`${styles.messageRow} ${styles.userRow}`}>
                  <div className={styles.messageBubble}>
                    <div className={styles.msgUser} dangerouslySetInnerHTML={{ __html: parseMarkdown(pendingUserMessage) }} />
                  </div>
                </div>
              )}

              {/* ── Live step log pills ──────────────────────────────────── */}
              {isThinking && steps.length > 0 && (
                <div className={styles.toolPillsContainer}>
                  {steps.slice(-3).map((step, i) => (
                    <ToolPill key={i} text={step.message} />
                  ))}
                </div>
              )}

              {/* ── Streaming response ────────────────────────────────────── */}
              {isThinking && (
                <div className={`${styles.messageRow} ${styles.modelRow}`}>
                  <div className={styles.avatar}>ح</div>
                  <div className={styles.messageContent}>
                    <div className={styles.msgHeader}>
                      {hikmaName}
                      <span className={styles.modelTag}>thinking…</span>
                    </div>
                    <div className={`${styles.messageBubble} ${styles.msgModel}`}>
                      {(() => {
                        const p = parseModelResponse(currentResponse);
                        return (
                          <>
                            <ThoughtPanel parsed={p} open={true} />
                            <span
                              dangerouslySetInnerHTML={{
                                __html: parseMarkdown(p.response || (steps.length > 0 ? '' : 'Searching library…'))
                              }}
                            />
                            <span className={styles.streamCursor} />
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>
          )}
        </div>

        {/* ── Floating input panel ───────────────────────────────────────── */}
        <div className={styles.inputWrapper}>
          <div className={styles.inputCardOuter}>

            {/* @ Autocomplete menu */}
            {autocompleteVisible && filteredNotes.length > 0 && (
              <div className={styles.autocompleteMenu}>
                <div className={styles.autocompleteHeader}>📚 Notes — select to pin</div>
                <div className={styles.autocompleteList}>
                  {filteredNotes.map((note, i) => (
                    <button
                      key={note.slug}
                      className={`${styles.autocompleteItem} ${i === autocompleteIndex ? styles.autocompleteItemActive : ''}`}
                      onClick={() => handleSelectNote(note)}
                      onMouseEnter={() => setAutocompleteIndex(i)}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                      </svg>
                      {note.title}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className={`${styles.inputCard} ${isFocused ? styles.inputCardFocused : ''}`}>

                {/* Badge row (pinned notes + highlighted quote) */}
                {(pinnedNotes.length > 0 || selectedText) && (
                  <div className={styles.badgeRow}>
                    {pinnedNotes.map(note => (
                      <div key={note.slug} className={styles.badge}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                        </svg>
                        <span className={styles.badgeText}>{note.title}</span>
                        <button
                          type="button"
                          className={styles.badgeRemoveBtn}
                          onClick={() => setPinnedNotes(p => p.filter(n => n.slug !== note.slug))}
                        >×</button>
                      </div>
                    ))}
                    {selectedText && (
                      <div className={styles.badge}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
                        </svg>
                        <span className={styles.badgeText}>&quot;{selectedText.slice(0, 28)}{selectedText.length > 28 ? '…' : ''}&quot;</span>
                        <button type="button" className={styles.badgeRemoveBtn} onClick={() => setSelectedText('')}>×</button>
                      </div>
                    )}
                  </div>
                )}

                {/* Textarea */}
                <textarea
                  ref={textareaRef}
                  className={styles.textarea}
                  placeholder={`Ask ${hikmaName} anything… (@ to pin a note, Shift+Enter for newline)`}
                  value={query}
                  onChange={handleTextareaChange}
                  onKeyDown={handleKeyDown}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                  disabled={isThinking}
                  rows={1}
                />

                {/* Controls row */}
                <div className={styles.inputControlsRow}>
                  <div className={styles.controlsLeft}>
                    {/* @ mention hint button */}
                    <button
                      type="button"
                      className={styles.controlBtn}
                      title="Pin a note (@)"
                      onClick={() => { setQuery(q => q + '@'); textareaRef.current?.focus(); }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="4" />
                        <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94" />
                      </svg>
                      <span style={{ fontSize: '0.75rem' }}>Mention</span>
                    </button>
                    <div className={styles.modelSelectWrapper}>
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
                  </div>
                  <div className={styles.controlsRight}>
                    {history.length > 0 && !isThinking && (
                      <button type="button" className={styles.controlBtn} onClick={handleClearHistory} title="Clear chat">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6M14 11v6" />
                        </svg>
                      </button>
                    )}
                    {isThinking ? (
                      <button type="button" className={styles.cancelBtn} onClick={handleCancel} title="Stop">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                          <rect x="4" y="4" width="16" height="16" rx="2" />
                        </svg>
                      </button>
                    ) : (
                      <button type="submit" className={styles.sendBtn} disabled={!query.trim()}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="22" y1="2" x2="11" y2="13" />
                          <polygon points="22 2 15 22 11 13 2 9 22 2" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </form>

            <p className={styles.disclaimer}>
              {hikmaName} can make mistakes — verify important information in source notes.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
