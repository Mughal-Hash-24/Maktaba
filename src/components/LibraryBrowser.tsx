/* src/components/LibraryBrowser.tsx */
'use client';

import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import styles from '../styles/library.module.css';
import type { NoteMetadata } from '../lib/notes';

interface LibraryBrowserProps {
  initialNotes: NoteMetadata[];
}

const WINGS = [
  { key: 'all', label: 'All Wings' },
  { key: 'science-tech', label: 'Science & Tech' },
  { key: 'formal-sciences', label: 'Formal Sciences' },
  { key: 'humanities-arts', label: 'Humanities & Arts' },
  { key: 'social-sciences', label: 'Social Sciences' },
];

// Helper to determine which wing a subject tag belongs to
const getSubjectWing = (subjectTag: string): string => {
  const name = (subjectTag.split('/')[1] || '').toLowerCase();
  
  const formal = ['math', 'discrete', 'linear-algebra', 'statistics', 'logic'];
  const social = ['economics', 'psychology', 'cognitive-science', 'pak-studies', 'history', 'russia', 'law'];
  const humanities = ['philosophy', 'fiqh', 'literature', 'music'];
  
  if (formal.some(s => name.includes(s))) return 'formal-sciences';
  if (social.some(s => name.includes(s))) return 'social-sciences';
  if (humanities.some(s => name.includes(s))) return 'humanities-arts';
  
  // Default to Science & Tech (majority of CS notes)
  return 'science-tech';
};

const getWingColor = (wing: string): string => {
  switch (wing) {
    case 'science-tech': return 'var(--color-cs)';
    case 'formal-sciences': return 'var(--color-math)';
    case 'humanities-arts': return 'var(--color-humanities)';
    case 'social-sciences': return 'var(--color-social)';
    default: return 'var(--text-muted)';
  }
};

const getWingLabel = (wing: string): string => {
  switch (wing) {
    case 'science-tech': return 'Science & Tech';
    case 'formal-sciences': return 'Formal Sciences';
    case 'humanities-arts': return 'Humanities & Arts';
    case 'social-sciences': return 'Social Sciences';
    default: return 'General Wing';
  }
};

const normalizeSubjectName = (subjectTag: string): string => {
  const name = subjectTag.split('/')[1] || subjectTag;
  return name
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace('Dsa', 'DSA')
    .replace('Coal', 'COAL')
    .replace('Ai', 'AI')
    .replace('Sda', 'SDA')
    .replace('Os', 'OS')
    .replace('Cs', 'CS')
    .replace('Cpp', 'C++');
};

// Generates a beautiful procedurally generated book gradient based on its title hash
const getBookGradient = (title: string, wingColor: string, isLight: boolean): string => {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = title.charCodeAt(i) + ((hash << 5) - hash);
  }
  
  // Strictly warm hues (340 to 360 for reds/berries, and 0 to 60 for oranges/golds/browns)
  const warmHue = Math.abs(hash) % 80;
  const hue = warmHue < 20 ? (340 + warmHue) : (warmHue - 20);
  
  // Ensure the gradient end color also stays warm (doesn't drift into green/cool colors)
  const nextHue = (hue + 15) > 60 && (hue + 15) < 340 
    ? (hue - 15) 
    : (hue + 15) % 360;

  const saturation = isLight 
    ? 25 + Math.abs((hash >> 8) % 15) // 25% - 40% for soft light covers
    : 35 + Math.abs((hash >> 8) % 20); // 35% - 55%
  const lightness = isLight
    ? 75 + Math.abs((hash >> 16) % 8) // 75% - 83% for light parchment
    : 12 + Math.abs((hash >> 16) % 8); // 12% - 20%
  
  const endLightness = isLight ? lightness - 10 : 8;
  const mixPercentage = isLight ? '15%' : '13%';

  return `linear-gradient(135deg, hsl(${hue}, ${saturation}%, ${lightness}%) 0%, color-mix(in srgb, ${wingColor} ${mixPercentage}, transparent) 60%, hsl(${nextHue}, ${saturation}%, ${endLightness}%) 100%)`;
};

export default function LibraryBrowser({ initialNotes }: LibraryBrowserProps) {
  const searchParams = useSearchParams();
  const defaultWing = searchParams.get('wing') || 'all';
  const defaultSearch = searchParams.get('q') || '';

  const [activeWing, setActiveWing] = useState<string>(defaultWing);
  const [viewMode, setViewMode] = useState<'shelves' | 'catalog'>('shelves');
  const [searchQuery, setSearchQuery] = useState<string>(defaultSearch);
  const [sortShelvesBy, setSortShelvesBy] = useState<'name' | 'count'>('count');
  const [sortBooksBy, setSortBooksBy] = useState<'alphabetical' | 'length'>('alphabetical');
  const [isLight, setIsLight] = useState<boolean>(false);

  useEffect(() => {
    const checkTheme = () => {
      setIsLight(document.documentElement.getAttribute('data-theme') === 'light');
    };
    checkTheme();
    window.addEventListener('themechange', checkTheme);
    return () => window.removeEventListener('themechange', checkTheme);
  }, []);

  // Filter notes by search query
  const searchedNotes = useMemo(() => {
    if (!searchQuery.trim()) return initialNotes;
    const query = searchQuery.toLowerCase();
    
    return initialNotes.filter((note) => {
      const matchTitle = note.title.toLowerCase().includes(query);
      const matchTags = note.tags.some(tag => tag.toLowerCase().includes(query));
      return matchTitle || matchTags;
    });
  }, [initialNotes, searchQuery]);

  // Group filtered notes by their subject/ tags
  const shelfData = useMemo(() => {
    // Map of subjectTag -> array of notes
    const groups: Record<string, NoteMetadata[]> = {};
    
    searchedNotes.forEach((note) => {
      // Find subject tags
      const subjectTags = note.tags.filter(t => t.startsWith('subject/'));
      
      if (subjectTags.length === 0) {
        // Fallback shelf for untagged notes
        const fallbackKey = 'subject/general';
        if (!groups[fallbackKey]) groups[fallbackKey] = [];
        groups[fallbackKey].push(note);
      } else {
        subjectTags.forEach((tag) => {
          if (!groups[tag]) groups[tag] = [];
          // Avoid duplicate books on the same shelf
          if (!groups[tag].some(n => n.slug === note.slug)) {
            groups[tag].push(note);
          }
        });
      }
    });

    // Transform into structured shelf rows
    const shelves = Object.keys(groups).map((tag) => {
      const wing = getSubjectWing(tag);
      const books = groups[tag].sort((a, b) => {
        if (sortBooksBy === 'length') return b.wordCount - a.wordCount;
        return a.title.localeCompare(b.title);
      });

      return {
        tag,
        name: normalizeSubjectName(tag),
        wing,
        wingColor: getWingColor(wing),
        books,
      };
    });

    // Filter shelves by active Library Wing tab selection
    const filteredByWing = shelves.filter((shelf) => {
      if (activeWing === 'all') return true;
      return shelf.wing === activeWing;
    });

    // Sort shelves
    return filteredByWing.sort((a, b) => {
      if (sortShelvesBy === 'name') return a.name.localeCompare(b.name);
      return b.books.length - a.books.length; // Default to popular shelves first
    });
  }, [searchedNotes, activeWing, sortShelvesBy, sortBooksBy]);

  return (
    <div className={styles.container}>
      {/* Title block */}
      <div className={styles.titleSection}>
        <h1 className={styles.title}>The Grand Library</h1>
        <p className={styles.subtitle}>
          Browse and search notes styled as themed bookshelves across the academic wings.
        </p>
      </div>

      {/* Library Wing Navigation Tabs */}
      <nav className={styles.wingTabs} aria-label="Library Wings">
        {WINGS.map((wing) => {
          const isActive = activeWing === wing.key;
          return (
            <button
              key={wing.key}
              onClick={() => setActiveWing(wing.key)}
              className={`${styles.wingTab} ${isActive ? styles.wingTabActive : ''}`}
            >
              {wing.label}
            </button>
          );
        })}
      </nav>

      {/* Controls Toolbar */}
      <div className={styles.toolbar}>
        <div className={styles.searchWrapper}>
          <span className={styles.searchIcon}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
          </span>
          <input
            type="text"
            className={styles.localSearchInput}
            placeholder="Search shelves for books/topics..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className={styles.toolbarControls}>
          {/* Sorting selects */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <select
              value={sortShelvesBy}
              onChange={(e) => setSortShelvesBy(e.target.value as 'name' | 'count')}
              className={styles.sortSelect}
              style={{ padding: '6px var(--space-md)', fontSize: '0.8rem', width: 'auto' }}
              title="Sort Shelves"
            >
              <option value="count">Popular Shelves First</option>
              <option value="name">Shelves A-Z</option>
            </select>
            <select
              value={sortBooksBy}
              onChange={(e) => setSortBooksBy(e.target.value as 'alphabetical' | 'length')}
              className={styles.sortSelect}
              style={{ padding: '6px var(--space-md)', fontSize: '0.8rem', width: 'auto' }}
              title="Sort Books"
            >
              <option value="alphabetical">Books A-Z</option>
              <option value="length">Longest Books First</option>
            </select>
          </div>

          {/* View Toggles */}
          <div className={styles.viewToggle}>
            <button
              onClick={() => setViewMode('shelves')}
              className={`${styles.toggleBtn} ${viewMode === 'shelves' ? styles.toggleBtnActive : ''}`}
            >
              Shelves
            </button>
            <button
              onClick={() => setViewMode('catalog')}
              className={`${styles.toggleBtn} ${viewMode === 'catalog' ? styles.toggleBtnActive : ''}`}
            >
              Catalog
            </button>
          </div>
        </div>
      </div>

      {/* Main Shelves View */}
      {viewMode === 'shelves' ? (
        shelfData.length === 0 ? (
          <div className={styles.emptyState}>
            <h3>No books found matching &quot;{searchQuery}&quot;</h3>
            <p style={{ color: 'var(--text-muted)', marginTop: '8px', fontSize: '0.9rem' }}>
              Clear your search query or select a different library wing.
            </p>
          </div>
        ) : (
          <div className={styles.shelvesContainer}>
            {/* Group shelves by Wing for semantic rendering */}
            {['science-tech', 'formal-sciences', 'humanities-arts', 'social-sciences'].map((wingKey) => {
              const wingShelves = shelfData.filter(s => s.wing === wingKey);
              if (wingShelves.length === 0) return null;

              return (
                <section key={wingKey} className={styles.wingSection}>
                  <div className={styles.wingHeader}>
                    <h2 className={styles.wingTitle} style={{ color: getWingColor(wingKey) }}>
                      {getWingLabel(wingKey)}
                    </h2>
                    <div className={styles.wingLine} />
                  </div>

                  <div className={styles.shelvesContainer}>
                    {wingShelves.map((shelf) => (
                      <div key={shelf.tag} className={styles.shelfRow}>
                        <div className={styles.shelfHeader}>
                          <div className={styles.shelfLabel}>
                            <span className={styles.shelfTag} style={{ borderLeft: `3px solid ${shelf.wingColor}` }}>
                              {shelf.name}
                            </span>
                            <span className={styles.shelfBookCount}>
                              {shelf.books.length} {shelf.books.length === 1 ? 'book' : 'books'}
                            </span>
                          </div>
                        </div>

                        {/* Shelf Ledge & Book Row */}
                        <div className={styles.shelfBooksScroll}>
                          {shelf.books.map((book) => (
                            <Link key={book.slug} href={`/notes/${book.slug}`}>
                              <div
                                className={styles.book}
                                style={{
                                  background: getBookGradient(book.title, shelf.wingColor, isLight),
                                  borderLeft: `4px solid ${shelf.wingColor}`,
                                  '--book-text': isLight ? 'var(--text-primary)' : '#ffffff',
                                  '--book-footer-text': isLight ? 'var(--text-secondary)' : 'rgba(255, 255, 255, 0.7)',
                                  '--book-text-shadow': isLight ? 'none' : '1px 1px 2px rgba(0,0,0,0.8)',
                                } as React.CSSProperties}
                              >
                                <div className={styles.bookTitle}>{book.title}</div>
                                <div className={styles.bookFooter}>
                                  <span>{book.wordCount.toLocaleString()} w</span>
                                  <span>📖</span>
                                </div>
                              </div>
                            </Link>
                          ))}
                        </div>
                        <div className={styles.shelfLedge}>
                          <div
                            className={styles.shelfUnderglow}
                            style={{
                              background: `radial-gradient(ellipse at top, color-mix(in srgb, ${shelf.wingColor} 12%, transparent) 0%, transparent 80%)`
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )
      ) : (
        /* Classical Catalog List View */
        <div style={{ overflowX: 'auto' }}>
          <table className={styles.catalogTable}>
            <thead>
              <tr>
                <th className={styles.catalogTh}>Book Title</th>
                <th className={styles.catalogTh}>Subject / Shelf</th>
                <th className={styles.catalogTh}>Wing</th>
                <th className={styles.catalogTh}>Length</th>
                <th className={styles.catalogTh}>Connections</th>
              </tr>
            </thead>
            <tbody>
              {searchedNotes.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: 'var(--space-2xl)', textAlign: 'center', color: 'var(--text-muted)' }}>
                    No books in catalog match current search query.
                  </td>
                </tr>
              ) : (
                searchedNotes.map((note) => {
                  const subjectTag = note.tags.find(t => t.startsWith('subject/')) || 'subject/general';
                  const wing = getSubjectWing(subjectTag);
                  return (
                    <tr key={note.slug} className={styles.catalogTr}>
                      <td className={styles.catalogTd}>
                        <Link href={`/notes/${note.slug}`} className={styles.catalogLink}>
                          {note.title}
                        </Link>
                      </td>
                      <td className={styles.catalogTd}>{normalizeSubjectName(subjectTag)}</td>
                      <td className={styles.catalogTd} style={{ color: getWingColor(wing), fontWeight: 600 }}>
                        {getWingLabel(wing)}
                      </td>
                      <td className={styles.catalogTd}>{note.wordCount.toLocaleString()} words</td>
                      <td className={styles.catalogTd}>{note.linkCount} links</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
