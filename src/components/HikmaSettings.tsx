/* src/components/HikmaSettings.tsx */
'use client';

import React, { useState, useEffect } from 'react';
import { useHikma, PersonalityPreset, PRESET_INSTRUCTIONS, DEFAULT_SYSTEM_INSTRUCTION } from '../context/HikmaContext';
import styles from './HikmaSettings.module.css';

interface HikmaSettingsProps {
  onSaved?: () => void;
  defaultTab?: 'agent' | 'api' | 'system' | 'user';
}

export default function HikmaSettings({ onSaved, defaultTab }: HikmaSettingsProps) {
  const {
    hikmaName,
    preset,
    userInstructions,
    updateSettings,
    isKeySaved,
    rememberKey,
    saveApiKey,
    clearApiKey,
    isMistralKeySaved,
    rememberMistralKey,
    saveMistralApiKey,
    clearMistralApiKey,
  } = useHikma();

  // Settings states
  const [name, setName] = useState(hikmaName);
  const [activePreset, setActivePreset] = useState<PersonalityPreset>(preset);
  const [customInstructions, setCustomInstructions] = useState(userInstructions);
  const [activeTab, setActiveTab] = useState<'agent' | 'api' | 'system' | 'user'>(defaultTab || 'agent');

  // Gemini API states
  const [inputKey, setInputKey] = useState('');
  const [remember, setRemember] = useState(rememberKey);
  const [isValidating, setIsValidating] = useState(false);
  const [apiKeyError, setApiKeyError] = useState<string | null>(null);

  // Mistral API states
  const [inputMistralKey, setInputMistralKey] = useState('');
  const [rememberMistral, setRememberMistral] = useState(rememberMistralKey);
  const [isMistralValidating, setIsMistralValidating] = useState(false);
  const [mistralKeyError, setMistralKeyError] = useState<string | null>(null);

  // Sync defaultTab prop with state
  useEffect(() => {
    if (defaultTab) {
      setActiveTab(defaultTab);
    }
  }, [defaultTab]);

  // Sync state values when context changes
  useEffect(() => {
    setName(hikmaName);
    setActivePreset(preset);
    setCustomInstructions(userInstructions);
    setRemember(rememberKey);
    setRememberMistral(rememberMistralKey);
  }, [hikmaName, preset, userInstructions, rememberKey, rememberMistralKey]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings(name.trim() || 'Hikma', activePreset, customInstructions);
    if (onSaved) {
      onSaved();
    }
  };

  const handleSaveKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputKey.trim()) return;

    setIsValidating(true);
    setApiKeyError(null);

    const success = await saveApiKey(inputKey, remember);
    setIsValidating(false);

    if (success) {
      setInputKey('');
    } else {
      setApiKeyError('Invalid API key or quota exceeded. Please check your key.');
    }
  };

  const handleClearKey = () => {
    clearApiKey();
    setApiKeyError(null);
  };

  const handleSaveMistralKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputMistralKey.trim()) return;

    setIsMistralValidating(true);
    setMistralKeyError(null);

    const success = await saveMistralApiKey(inputMistralKey, rememberMistral);
    setIsMistralValidating(false);

    if (success) {
      setInputMistralKey('');
    } else {
      setMistralKeyError('Invalid Mistral API key or verification failed.');
    }
  };

  const handleClearMistralKey = () => {
    clearMistralApiKey();
    setMistralKeyError(null);
  };

  const systemPromptToDisplay = `${PRESET_INSTRUCTIONS[activePreset]}\n\n${DEFAULT_SYSTEM_INSTRUCTION}`;

  return (
    <form onSubmit={handleSave} className={styles.card}>
      <h3 className={styles.title}>Hikma Companion Settings</h3>

      {/* Tabs Menu */}
      <div className={styles.tabsContainer}>
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === 'agent' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('agent')}
        >
          Profile
        </button>
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === 'api' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('api')}
        >
          API Keys
        </button>
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === 'system' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('system')}
        >
          System
        </button>
        <button
          type="button"
          className={`${styles.tabBtn} ${activeTab === 'user' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('user')}
        >
          User
        </button>
      </div>

      {activeTab === 'agent' && (
        <div className={styles.tabContent}>
          <div className={styles.formGroup}>
            <label className={styles.label}>Companion Name</label>
            <input
              type="text"
              className={styles.input}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Hikma"
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.label}>Personality & Search Presets</label>
            <div className={styles.presetsGrid}>
              {/* Scholar */}
              <div
                className={`${styles.presetOption} ${
                  activePreset === 'scholar' ? styles.presetActive : ''
                }`}
                onClick={() => setActivePreset('scholar')}
              >
                <span className={styles.presetLabel}>📖 Scholar</span>
                <span className={styles.presetDesc}>
                  Deep, multi-hop searches (max 10 loops) for highly detailed academic synthesis.
                </span>
              </div>

              {/* Tutor */}
              <div
                className={`${styles.presetOption} ${
                  activePreset === 'tutor' ? styles.presetActive : ''
                }`}
                onClick={() => setActivePreset('tutor')}
              >
                <span className={styles.presetLabel}>🧑‍🏫 Tutor</span>
                <span className={styles.presetDesc}>
                  Socratic learning guide. Leverages clarifications and step-by-step guidance.
                </span>
              </div>

              {/* Debate */}
              <div
                className={`${styles.presetOption} ${
                  activePreset === 'debate' ? styles.presetActive : ''
                }`}
                onClick={() => setActivePreset('debate')}
              >
                <span className={styles.presetLabel}>⚖️ Debate</span>
                <span className={styles.presetDesc}>
                  Critical thinker. Highlights dialectics and alternative perspectives in notes.
                </span>
              </div>

              {/* Concise */}
              <div
                className={`${styles.presetOption} ${
                  activePreset === 'concise' ? styles.presetActive : ''
                }`}
                onClick={() => setActivePreset('concise')}
              >
                <span className={styles.presetLabel}>⚡ Concise</span>
                <span className={styles.presetDesc}>
                  Fast, direct answers. Limits search depth to 2 loops to prevent extra token usage.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'api' && (
        <div className={styles.tabContent}>
          {/* Gemini API Key */}
          <div className={styles.formGroup} style={{ borderBottom: '1px dashed var(--border-color)', paddingBottom: '1.25rem', marginBottom: '1.25rem' }}>
            <div className={styles.apiHeaderRow}>
              <label className={styles.label}>Google Gemini API Key</label>
              <div className={styles.statusWrapper}>
                <span
                  className={`${styles.dot} ${
                    isKeySaved ? styles.dotActive : styles.dotInactive
                  }`}
                />
                <span className={styles.statusText}>
                  {isKeySaved ? 'Active (Direct Client)' : 'Inactive (Server Proxy)'}
                </span>
              </div>
            </div>

            {!isKeySaved ? (
              <div className={styles.keyInputBlock}>
                <div className={styles.row}>
                  <input
                    type="password"
                    className={styles.input}
                    placeholder="Enter Gemini API Key..."
                    value={inputKey}
                    onChange={(e) => setInputKey(e.target.value)}
                    disabled={isValidating}
                  />
                  <button
                    type="button"
                    className={styles.btn}
                    onClick={handleSaveKey}
                    disabled={isValidating || !inputKey.trim()}
                  >
                    {isValidating ? 'Verifying...' : 'Save Key'}
                  </button>
                </div>

                <div className={styles.checkboxRow}>
                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      className={styles.checkbox}
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                      disabled={isValidating}
                    />
                    Remember key on this device
                  </label>
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.link}
                  >
                    Get key →
                  </a>
                </div>

                {apiKeyError && <div className={styles.errorText}>{apiKeyError}</div>}
              </div>
            ) : (
              <div className={styles.keyInputBlock}>
                <div className={styles.row}>
                  <input
                    type="text"
                    className={styles.input}
                    value="••••••••••••••••••••••••••••••••••••••••"
                    disabled
                  />
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnSecondary}`}
                    onClick={handleClearKey}
                  >
                    Clear Key
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Mistral API Key */}
          <div className={styles.formGroup}>
            <div className={styles.apiHeaderRow}>
              <label className={styles.label}>Mistral API Key</label>
              <div className={styles.statusWrapper}>
                <span
                  className={`${styles.dot} ${
                    isMistralKeySaved ? styles.dotActive : styles.dotInactive
                  }`}
                />
                <span className={styles.statusText}>
                  {isMistralKeySaved ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>

            {!isMistralKeySaved ? (
              <div className={styles.keyInputBlock}>
                <div className={styles.row}>
                  <input
                    type="password"
                    className={styles.input}
                    placeholder="Enter Mistral API Key..."
                    value={inputMistralKey}
                    onChange={(e) => setInputMistralKey(e.target.value)}
                    disabled={isMistralValidating}
                  />
                  <button
                    type="button"
                    className={styles.btn}
                    onClick={handleSaveMistralKey}
                    disabled={isMistralValidating || !inputMistralKey.trim()}
                  >
                    {isMistralValidating ? 'Verifying...' : 'Save Key'}
                  </button>
                </div>

                <div className={styles.checkboxRow}>
                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      className={styles.checkbox}
                      checked={rememberMistral}
                      onChange={(e) => setRememberMistral(e.target.checked)}
                      disabled={isMistralValidating}
                    />
                    Remember key on this device
                  </label>
                  <a
                    href="https://console.mistral.ai/api-keys/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.link}
                  >
                    Get key →
                  </a>
                </div>

                {mistralKeyError && <div className={styles.errorText}>{mistralKeyError}</div>}
              </div>
            ) : (
              <div className={styles.keyInputBlock}>
                <div className={styles.row}>
                  <input
                    type="text"
                    className={styles.input}
                    value="••••••••••••••••••••••••••••••••••••••••"
                    disabled
                  />
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnSecondary}`}
                    onClick={handleClearMistralKey}
                  >
                    Clear Key
                  </button>
                </div>
              </div>
            )}
          </div>

          <p className={styles.notice}>
            Notice: Keys are stored locally in your browser. All inference queries are made directly from your client.
          </p>
        </div>
      )}

      {activeTab === 'system' && (
        <div className={styles.tabContent}>
          <div className={styles.formGroup}>
            <div className={styles.banner}>
              <span>🔒 System instructions are read-only to guarantee proper library indexing & tool functions.</span>
            </div>
            <textarea
              className={styles.textarea}
              style={{ opacity: 0.75, cursor: 'not-allowed', fontStyle: 'italic' }}
              value={systemPromptToDisplay}
              readOnly
            />
          </div>
        </div>
      )}

      {activeTab === 'user' && (
        <div className={styles.tabContent}>
          <div className={styles.formGroup}>
            <label className={styles.label}>Custom Instructions</label>
            <textarea
              className={styles.textarea}
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
              placeholder="Inject custom guidelines (e.g., 'Prefer explaining mathematical properties through examples, translate citations to Urdu...')"
            />
            <span className={styles.helperText}>
              These instructions will be appended to the prompt template and will guide the companion&apos;s behavior.
            </span>
          </div>
        </div>
      )}

      {(activeTab === 'agent' || activeTab === 'user') && (
        <div className={styles.saveRow}>
          <button type="submit" className={styles.btn}>
            Save Settings
          </button>
        </div>
      )}
    </form>
  );
}
