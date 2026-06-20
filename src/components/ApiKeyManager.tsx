/* src/components/ApiKeyManager.tsx */
'use client';

import React, { useState } from 'react';
import { useHikma } from '../context/HikmaContext';
import styles from './ApiKeyManager.module.css';

export default function ApiKeyManager() {
  const {
    isKeySaved,
    rememberKey,
    saveApiKey,
    clearApiKey,
  } = useHikma();

  const [inputKey, setInputKey] = useState('');
  const [remember, setRemember] = useState(rememberKey);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputKey.trim()) return;

    setIsValidating(true);
    setError(null);

    const success = await saveApiKey(inputKey, remember);
    setIsValidating(false);

    if (success) {
      setInputKey('');
    } else {
      setError('Invalid API key or quota exceeded. Please check your key.');
    }
  };

  const handleClear = () => {
    clearApiKey();
    setError(null);
  };

  return (
    <div className={styles.card}>
      <div className={styles.header}>
        <span className={styles.title}>SCHOLARLY API KEY</span>
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
        <form onSubmit={handleSave} className={styles.inputGroup}>
          <div className={styles.row}>
            <input
              type="password"
              className={styles.input}
              placeholder="Enter Google AI API Key..."
              value={inputKey}
              onChange={(e) => setInputKey(e.target.value)}
              disabled={isValidating}
            />
            <button
              type="submit"
              className={styles.btn}
              disabled={isValidating || !inputKey.trim()}
            >
              {isValidating ? 'Validating...' : 'Save'}
            </button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                disabled={isValidating}
              />
              Remember on this device
            </label>
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.link}
            >
              Get free key →
            </a>
          </div>

          {error && <div className={styles.errorText}>{error}</div>}
        </form>
      ) : (
        <div className={styles.inputGroup}>
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
              onClick={handleClear}
            >
              Clear Key
            </button>
          </div>
        </div>
      )}

      <p className={styles.notice}>
        Notice: Your key is stored only in this browser and calls Google&apos;s servers directly.
        Maktaba never transmits or reads it. Verification is available in the source code.
      </p>
    </div>
  );
}
