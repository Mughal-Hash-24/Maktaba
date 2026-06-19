/* src/components/LandingStats.tsx */
'use client';

import { useState, useEffect } from 'react';
import styles from '../styles/landing.module.css';

interface LandingStatsProps {
  totalNotes: number;
  totalWords: number;
  totalDomains: number;
  totalConnections: number;
}

export default function LandingStats({
  totalNotes,
  totalWords,
  totalDomains,
  totalConnections
}: LandingStatsProps) {
  const [notes, setNotes] = useState(0);
  const [words, setWords] = useState(0);
  const [domains, setDomains] = useState(0);
  const [connections, setConnections] = useState(0);

  useEffect(() => {
    // Basic counting animation
    const duration = 1200; // 1.2 seconds animation
    const steps = 30;
    const intervalTime = duration / steps;
    
    let currentStep = 0;

    const timer = setInterval(() => {
      currentStep++;
      const progress = currentStep / steps;
      
      // Easing function (easeOutQuad)
      const ease = progress * (2 - progress);

      setNotes(Math.floor(totalNotes * ease));
      setWords(Math.floor(totalWords * ease));
      setDomains(Math.floor(totalDomains * ease));
      setConnections(Math.floor(totalConnections * ease));

      if (currentStep >= steps) {
        clearInterval(timer);
        // Ensure final values are exact
        setNotes(totalNotes);
        setWords(totalWords);
        setDomains(totalDomains);
        setConnections(totalConnections);
      }
    }, intervalTime);

    return () => clearInterval(timer);
  }, [totalNotes, totalWords, totalDomains, totalConnections]);

  return (
    <div className={`${styles.statsStrip} ${styles.fadeIn} ${styles.delay1} glass`}>
      <div className={styles.statCard}>
        <div className={styles.statNumber}>{notes.toLocaleString()}</div>
        <div className={styles.statLabel}>Total Notes</div>
      </div>
      <div className={styles.statCard}>
        <div className={styles.statNumber}>{words.toLocaleString()}</div>
        <div className={styles.statLabel}>Words Indexed</div>
      </div>
      <div className={styles.statCard}>
        <div className={styles.statNumber}>{domains}</div>
        <div className={styles.statLabel}>Domains</div>
      </div>
      <div className={styles.statCard}>
        <div className={styles.statNumber}>{connections.toLocaleString()}</div>
        <div className={styles.statLabel}>Connections</div>
      </div>
    </div>
  );
}
