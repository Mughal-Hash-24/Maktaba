/* src/app/library/loading.tsx */
import styles from '../../styles/library.module.css';

export default function LibraryLoading() {
  return (
    <div className={styles.container}>
      {/* Title section skeleton */}
      <div className={styles.titleSection}>
        <div className="skeleton" style={{ width: '260px', height: '2.5rem', marginBottom: '8px' }} />
        <div className="skeleton" style={{ width: '480px', height: '1.2rem' }} />
      </div>

      {/* Wing Tabs skeleton */}
      <div className={styles.wingTabs} style={{ gap: '16px' }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="skeleton" style={{ width: '100px', height: '2.2rem', borderRadius: '4px' }} />
        ))}
      </div>

      {/* Toolbar skeleton */}
      <div className={styles.toolbar}>
        <div className="skeleton" style={{ width: '320px', height: '2.2rem', borderRadius: 'var(--radius-lg)' }} />
        <div className={styles.toolbarControls}>
          <div className="skeleton" style={{ width: '150px', height: '2rem', borderRadius: '4px' }} />
          <div className="skeleton" style={{ width: '150px', height: '2rem', borderRadius: '4px' }} />
          <div className="skeleton" style={{ width: '120px', height: '2rem', borderRadius: 'var(--radius-md)' }} />
        </div>
      </div>

      {/* Shelves Loading Skeletons */}
      <div className={styles.shelvesContainer}>
        {/* Science & Tech Wing Skeleton */}
        <div className={styles.wingSection}>
          <div className={styles.wingHeader}>
            <div className="skeleton" style={{ width: '180px', height: '1.6rem' }} />
            <div className={styles.wingLine} />
          </div>

          <div className={styles.shelvesContainer}>
            {/* Shelf Row 1 */}
            <div className={styles.shelfRow}>
              <div className={styles.shelfHeader}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <div className="skeleton" style={{ width: '120px', height: '1.8rem', borderRadius: '4px' }} />
                  <div className="skeleton" style={{ width: '60px', height: '1rem' }} />
                </div>
              </div>
              <div className={styles.shelfBooksScroll} style={{ minHeight: '230px' }}>
                {[1, 2, 3, 4, 5, 6, 7].map((b) => (
                  <div
                    key={b}
                    className="skeleton"
                    style={{
                      width: '135px',
                      height: '190px',
                      borderRadius: '4px 6px 6px 4px',
                      flexShrink: 0
                    }}
                  />
                ))}
              </div>
              <div className={styles.shelfLedge} />
            </div>

            {/* Shelf Row 2 */}
            <div className={styles.shelfRow} style={{ marginTop: 'var(--space-md)' }}>
              <div className={styles.shelfHeader}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <div className="skeleton" style={{ width: '140px', height: '1.8rem', borderRadius: '4px' }} />
                  <div className="skeleton" style={{ width: '60px', height: '1rem' }} />
                </div>
              </div>
              <div className={styles.shelfBooksScroll} style={{ minHeight: '230px' }}>
                {[1, 2, 3, 4].map((b) => (
                  <div
                    key={b}
                    className="skeleton"
                    style={{
                      width: '135px',
                      height: '190px',
                      borderRadius: '4px 6px 6px 4px',
                      flexShrink: 0
                    }}
                  />
                ))}
              </div>
              <div className={styles.shelfLedge} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
