/* src/app/graph/loading.tsx */
import styles from '../../styles/graph.module.css';

export default function GraphLoading() {
  return (
    <div className={styles.container}>
      <div className={styles.graphHeader}>
        <div className="skeleton" style={{ width: '240px', height: '2.2rem' }} />
        
        {/* Domain selection buttons skeleton */}
        <div className={styles.controls}>
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="skeleton"
              style={{
                width: '80px',
                height: '1.8rem',
                borderRadius: '20px'
              }}
            />
          ))}
        </div>
      </div>

      {/* Canvas Loader skeleton */}
      <div className={styles.canvasWrapper} style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--space-md)'
      }}>
        {/* Constellation spinner */}
        <div style={{
          width: '50px',
          height: '50px',
          border: '2px dashed rgba(255, 255, 255, 0.1)',
          borderTop: '2px solid var(--color-cs)',
          borderBottom: '2px solid var(--color-ai)',
          borderRadius: '50%',
          animation: 'spin 2s infinite linear'
        }} />
        <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', letterSpacing: '1px' }}>
          Mapping connections across the night sky...
        </span>

        {/* Legend block skeleton */}
        <div className={styles.legend} style={{ opacity: 0.5, pointerEvents: 'none' }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className={styles.legendItem}>
              <span className="skeleton" style={{ width: '12px', height: '12px', borderRadius: '50%' }} />
              <div className="skeleton" style={{ width: '80px', height: '0.8rem' }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
