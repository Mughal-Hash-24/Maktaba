// src/components/AuthButton.tsx
'use client';

import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import styles from './AuthButton.module.css';

export default function AuthButton() {
  const { user, signIn, signOut, loading } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);

  if (loading) {
    return (
      <div className={styles.userProfile} style={{ opacity: 0.5 }}>
        <div className={styles.userName}>Loading session...</div>
      </div>
    );
  }

  const handleSignIn = async (provider: 'google' | 'github') => {
    try {
      await signIn(provider);
    } catch (err) {
      console.error('Sign in failed:', err);
      alert('Sign in failed. Check console for details.');
    }
  };

  const getInitials = (name?: string) => {
    if (!name) return 'S';
    return name.slice(0, 1).toUpperCase();
  };

  return (
    <div className={styles.authContainer}>
      {user ? (
        <div className={styles.userProfile}>
          <div className={styles.userInfo}>
            <div className={styles.avatar}>
              {getInitials(user.user_metadata?.full_name || user.email)}
            </div>
            <span className={styles.userName} title={user.email}>
              {user.user_metadata?.full_name || user.email?.split('@')[0] || 'Scholar'}
            </span>
          </div>
          <button
            onClick={signOut}
            className={styles.signOutBtn}
            aria-label="Sign out"
            title="Sign Out"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </div>
      ) : (
        <button onClick={() => setModalOpen(true)} className={styles.authBtn}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
            <polyline points="10 17 15 12 10 7" />
            <line x1="15" y1="12" x2="3" y2="12" />
          </svg>
          Sign In to Sync
        </button>
      )}

      {modalOpen && (
        <div className={styles.modalOverlay} onClick={() => setModalOpen(false)}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <button className={styles.closeBtn} onClick={() => setModalOpen(false)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
            <h3 className={styles.modalTitle}>Sign in to Maktaba</h3>
            <p className={styles.modalDesc}>
              Connect your account to sync your chat sessions, companion personality preferences, and custom study templates across all devices.
            </p>
            <div className={styles.providerList}>
              <button
                onClick={() => handleSignIn('google')}
                className={`${styles.providerBtn} ${styles.googleBtn}`}
              >
                <svg className={styles.providerIcon} viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                Continue with Google
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
