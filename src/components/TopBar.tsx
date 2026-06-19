/* src/components/TopBar.tsx */
'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import styles from '../styles/layout.module.css';

// Type for search results
interface SearchResult {
  slug: string;
  title: string;
  snippet?: string;
  excerpt?: string; // pagefind uses excerpt
  url?: string; // pagefind uses url
  tags?: string[];
}

export default function TopBar() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load and apply initial theme
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    const root = document.documentElement;
    if (savedTheme) {
      setTheme(savedTheme);
      root.setAttribute('data-theme', savedTheme);
    } else {
      setTheme('dark');
      root.setAttribute('data-theme', 'dark');
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem('theme', nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
    // Dispatch custom event so the Graph canvas resolves colors dynamically
    window.dispatchEvent(new Event('themechange'));
  };

  // Check for API Key (Stage 4 feature, but let's wire indicator now)
  useEffect(() => {
    const checkApiKey = () => {
      const key = sessionStorage.getItem('gemini_api_key') || localStorage.getItem('gemini_api_key');
      setHasApiKey(!!key);
    };

    checkApiKey();
    // Check every 2 seconds or on storage event
    const interval = setInterval(checkApiKey, 2000);
    window.addEventListener('storage', checkApiKey);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('storage', checkApiKey);
    };
  }, []);

  // Keyboard shortcut Ctrl+K or / to focus search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey && e.key === 'k') || e.key === '/') {
        // Don't focus if typing in an input or textarea
        if (
          document.activeElement?.tagName === 'INPUT' ||
          document.activeElement?.tagName === 'TEXTAREA'
        ) {
          return;
        }
        e.preventDefault();
        inputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Perform search (Pagefind with API Fallback)
  useEffect(() => {
    const performSearch = async () => {
      if (query.trim().length < 2) {
        setResults([]);
        return;
      }

      setIsLoading(true);
      
      try {
        // 1. Try Pagefind
        if (typeof window !== 'undefined') {
          // @ts-expect-error - pagefind.js is built statically
          const pagefind = await import(/* webpackIgnore: true */ '/pagefind/pagefind.js');
          
          // Ensure pagefind is initialized
          if (pagefind.init) {
            await pagefind.init();
          }

          const searchResult = await pagefind.search(query);
          const data: SearchResult[] = [];
          
          for (const r of searchResult.results) {
            const rData = await r.data();
            // Parse slug from URL (e.g. /notes/virtual-memory.html -> virtual-memory)
            const match = rData.url.match(/\/notes\/([^/.]+)/);
            if (match) {
              const slug = match[1];
              data.push({
                slug,
                title: rData.meta.title || slug,
                snippet: rData.excerpt,
              });
            }
            if (data.length >= 8) break; // Limit to top 8 note results
          }
          
          setResults(data);
          setIsLoading(false);
          return;
        }
      } catch (err) {
        console.warn('Pagefind search failed, falling back to API search:', err);
      }

      // 2. Fallback API Search
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data);
        }
      } catch (err) {
        console.error('Fallback search failed:', err);
      } finally {
        setIsLoading(false);
      }
    };

    const timeoutId = setTimeout(performSearch, 200);
    return () => clearTimeout(timeoutId);
  }, [query]);

  const handleResultClick = (slug: string) => {
    setQuery('');
    setIsOpen(false);
    router.push(`/notes/${slug}`);
  };

  const getDomainFromTags = (tags?: string[]): string => {
    if (!tags) return '';
    const fieldTag = tags.find(t => t.startsWith('field/'));
    if (!fieldTag) return '';
    return fieldTag.split('/')[1] || '';
  };

  return (
    <header className={styles.topbar}>
      <div className={styles.searchContainer}>
        <div style={{ position: 'relative' }}>
          <span className={styles.searchIcon}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          </span>
          <input
            ref={inputRef}
            type="text"
            className={styles.searchInput}
            placeholder="Search notes... (Press '/' to focus)"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIsOpen(true);
            }}
            onFocus={() => setIsOpen(true)}
          />
          <span className={styles.shortcutHint}>/</span>
        </div>

        {isOpen && (query.trim().length >= 2) && (
          <div ref={dropdownRef} className="glass" style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            right: 0,
            borderRadius: 'var(--radius-lg)',
            maxHeight: '400px',
            overflowY: 'auto',
            zIndex: 1000,
            padding: 'var(--space-sm) 0',
            boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.5)'
          }}>
            {isLoading ? (
              <div style={{ padding: 'var(--space-md)', textAlign: 'center', color: 'var(--text-secondary)' }}>
                Searching...
              </div>
            ) : results.length === 0 ? (
              <div style={{ padding: 'var(--space-md)', textAlign: 'center', color: 'var(--text-secondary)' }}>
                No results found
              </div>
            ) : (
              results.map((result) => {
                const domain = getDomainFromTags(result.tags);
                return (
                  <button
                    key={result.slug}
                    onClick={() => handleResultClick(result.slug)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: 'var(--space-sm) var(--space-md)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                      transition: 'background var(--transition-fast)',
                      borderBottom: '1px solid var(--border-color)'
                    }}
                    className="nav-search-item"
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{result.title}</span>
                      {domain && (
                        <span style={{
                          fontSize: '0.7rem',
                          textTransform: 'uppercase',
                          padding: '2px 6px',
                          borderRadius: 'var(--radius-sm)',
                          backgroundColor: `color-mix(in srgb, var(--color-${domain}, var(--text-muted)) 15%, transparent)`,
                          border: `1px solid var(--color-${domain}, var(--text-muted))`,
                          color: `var(--color-${domain}, var(--text-primary))`
                        }}>
                          {domain}
                        </span>
                      )}
                    </div>
                    {result.snippet && (
                      <p style={{
                        fontSize: '0.8rem',
                        color: 'var(--text-secondary)',
                        margin: 0,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical',
                        lineHeight: 1.4
                      }} dangerouslySetInnerHTML={{ __html: result.snippet }} />
                    )}
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>

      <div className={styles.topbarActions}>
        <button
          onClick={toggleTheme}
          className={styles.themeToggleBtn}
          aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          {theme === 'dark' ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5"></circle>
              <line x1="12" y1="1" x2="12" y2="3"></line>
              <line x1="12" y1="21" x2="12" y2="23"></line>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
              <line x1="1" y1="12" x2="3" y2="12"></line>
              <line x1="21" y1="12" x2="23" y2="12"></line>
              <line x1="4.22" y1="19.22" x2="5.64" y2="17.78"></line>
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
            </svg>
          )}
        </button>
        <div className={styles.apiKeyIndicator}>
          <span className={`${styles.indicatorDot} ${hasApiKey ? styles.indicatorDotActive : ''}`} />
          <span>{hasApiKey ? 'Hikma Engine Active' : 'Hikma Offline'}</span>
        </div>
      </div>
      
      {/* Inject custom styling rules for hover */}
      <style jsx global>{`
        .nav-search-item:hover {
          background-color: var(--bg-secondary) !important;
        }
      `}</style>
    </header>
  );
}
