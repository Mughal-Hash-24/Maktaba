/* src/components/TableOfContents.tsx */
'use client';

import { useState, useEffect } from 'react';
import styles from '../styles/note-reader.module.css';
import type { TocItem } from '../lib/toc';

interface TableOfContentsProps {
  items: TocItem[];
}

export default function TableOfContents({ items }: TableOfContentsProps) {
  const [activeId, setActiveId] = useState<string>('');

  useEffect(() => {
    const handleScroll = () => {
      // Find the heading that is closest to the top of the viewport
      const headingElements = items.map((item) => document.getElementById(item.id));
      
      let currentActiveId = '';
      const offset = 100; // Offset for top header

      for (let i = 0; i < headingElements.length; i++) {
        const el = headingElements[i];
        if (el) {
          const rect = el.getBoundingClientRect();
          // If the heading is above the threshold, mark it as active
          if (rect.top <= offset) {
            currentActiveId = items[i].id;
          }
        }
      }

      // Default to first item if scrolled to top
      if (!currentActiveId && items.length > 0) {
        currentActiveId = items[0].id;
      }

      setActiveId(currentActiveId);
    };

    window.addEventListener('scroll', handleScroll);
    // Run once on load
    handleScroll();

    return () => window.removeEventListener('scroll', handleScroll);
  }, [items]);

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    e.preventDefault();
    const element = document.getElementById(id);
    if (element) {
      const topbarHeight = 70;
      const elementPosition = element.getBoundingClientRect().top + window.pageYOffset;
      const offsetPosition = elementPosition - topbarHeight;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth',
      });
    }
  };

  return (
    <div className={styles.tocSidebar}>
      <h4 className={styles.tocTitle}>On this page</h4>
      <ul className={styles.tocList}>
        {items.map((item) => {
          const isActive = activeId === item.id;
          const depthClass = item.depth === 3 ? styles.tocDepth3 : styles.tocDepth2;
          return (
            <li key={item.id} className={`${styles.tocItem} ${depthClass}`}>
              <a
                href={`#${item.id}`}
                onClick={(e) => handleClick(e, item.id)}
                style={{
                  color: isActive ? 'var(--color-cs)' : 'var(--text-secondary)',
                  fontWeight: isActive ? '600' : 'normal',
                  transition: 'all var(--transition-fast)',
                }}
              >
                {item.text}
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
