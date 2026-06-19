/* src/app/notes/[slug]/loading.tsx */
import styles from '../../../styles/note-reader.module.css';

export default function NoteLoading() {
  return (
    <div className={styles.noteContainer}>
      <div className={styles.articleWrapper}>
        {/* Breadcrumb skeleton */}
        <div className={styles.breadcrumb} style={{ marginBottom: '24px' }}>
          <div className="skeleton" style={{ width: '60px', height: '0.95rem' }} />
          <span className={styles.breadcrumbSeparator}>/</span>
          <div className="skeleton" style={{ width: '80px', height: '0.95rem' }} />
          <span className={styles.breadcrumbSeparator}>/</span>
          <div className="skeleton" style={{ width: '120px', height: '0.95rem' }} />
        </div>

        {/* Title skeleton */}
        <div className="skeleton" style={{ width: '70%', height: '3rem', marginBottom: '16px' }} />

        {/* Metadata skeleton */}
        <div className={styles.metadata}>
          <div className="skeleton" style={{ width: '100px', height: '0.85rem' }} />
          <span style={{ color: 'var(--border-color)' }}>•</span>
          <div className={styles.tagList}>
            {[1, 2, 3].map((tag) => (
              <div key={tag} className="skeleton" style={{ width: '60px', height: '1.4rem', borderRadius: '4px' }} />
            ))}
          </div>
        </div>

        {/* Article Body skeleton paragraphs */}
        <div className={styles.article} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="skeleton" style={{ width: '100%', height: '1.1rem' }} />
          <div className="skeleton" style={{ width: '96%', height: '1.1rem' }} />
          <div className="skeleton" style={{ width: '92%', height: '1.1rem' }} />
          <div className="skeleton" style={{ width: '40%', height: '1.1rem', marginBottom: '16px' }} />

          <div className="skeleton" style={{ width: '100%', height: '1.1rem' }} />
          <div className="skeleton" style={{ width: '98%', height: '1.1rem' }} />
          <div className="skeleton" style={{ width: '90%', height: '1.1rem' }} />
          <div className="skeleton" style={{ width: '85%', height: '1.1rem', marginBottom: '16px' }} />

          {/* Heading skeleton */}
          <div className="skeleton" style={{ width: '40%', height: '1.8rem', marginTop: '24px', marginBottom: '12px' }} />
          
          <div className="skeleton" style={{ width: '100%', height: '1.1rem' }} />
          <div className="skeleton" style={{ width: '94%', height: '1.1rem' }} />
          <div className="skeleton" style={{ width: '60%', height: '1.1rem' }} />
        </div>

        {/* Backlinks skeleton */}
        <section className={styles.backlinksSection} style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '24px', marginTop: '48px' }}>
          <div className="skeleton" style={{ width: '240px', height: '1.6rem', marginBottom: '16px' }} />
          
          <div className={styles.backlinksGrid}>
            {[1, 2, 3].map((b) => (
              <div key={b} className={styles.backlinkCard} style={{ pointerEvents: 'none', background: 'rgba(255,255,255,0.01)' }}>
                <div className="skeleton" style={{ width: '70%', height: '1.1rem', marginBottom: '8px' }} />
                <div className="skeleton" style={{ width: '40%', height: '0.8rem' }} />
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Table of Contents sticky sidebar skeleton */}
      <aside className={styles.tocSidebar} style={{ pointerEvents: 'none' }}>
        <div className="skeleton" style={{ width: '80px', height: '0.85rem', marginBottom: '16px' }} />
        <ul className={styles.tocList}>
          {[1, 2, 3, 4, 5].map((i) => (
            <li key={i} className={styles.tocItem}>
              <div className="skeleton" style={{ width: `${80 - (i % 2) * 20}%`, height: '0.9rem' }} />
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
