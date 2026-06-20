/* src/app/loading.tsx */
export default function DefaultLoading() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '60vh',
      gap: 'var(--space-md)',
      color: 'var(--text-secondary)'
    }}>
      {/* Premium glowing spinner */}
      <div style={{
        width: '40px',
        height: '40px',
        border: '3px solid var(--border-color)',
        borderTop: '3px solid var(--color-cs)',
        borderRadius: '50%',
        animation: 'spin 1s infinite linear',
        boxShadow: '0 0 10px var(--shadow-glow)'
      }} />
      <span style={{ fontSize: '0.95rem', fontWeight: 500, letterSpacing: '0.5px' }}>
        Opening library doors...
      </span>
    </div>
  );
}
