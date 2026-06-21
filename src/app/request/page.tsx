// src/app/request/page.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { getSupabaseBrowserClient } from '../../lib/supabase';
import styles from './request.module.css';

interface NoteRequest {
  id: string;
  topic: string;
  context: string;
  created_at: string;
}

export default function RequestPage() {
  const { user, signIn } = useAuth();
  const supabase = getSupabaseBrowserClient();

  const [topic, setTopic] = useState('');
  const [context, setContext] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [requests, setRequests] = useState<NoteRequest[]>([]);

  // Fetch past requests on user mount
  useEffect(() => {
    if (!supabase || !user) return;

    const fetchRequests = async () => {
      try {
        const { data, error } = await supabase
          .from('note_requests')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw error;
        setRequests(data || []);
      } catch (err) {
        console.error('[RequestPage] Error loading past requests:', err);
      }
    };

    fetchRequests();
  }, [user, supabase]);

  const handleSignIn = async () => {
    try {
      await signIn('google');
    } catch (err) {
      console.error('Sign in failed:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topic.trim() || !supabase || !user) return;

    setIsSubmitting(true);
    setSuccess(false);

    try {
      const { data, error } = await supabase
        .from('note_requests')
        .insert({
          topic: topic.trim(),
          context: context.trim() || null,
          user_id: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      setTopic('');
      setContext('');
      setSuccess(true);
      if (data) {
        setRequests(prev => [data as NoteRequest, ...prev]);
      }
    } catch (err) {
      console.error('[RequestPage] Error submitting note request:', err);
      alert('Failed to submit request. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.title}>Request a Note</h1>
      <p className={styles.subtitle}>
        Is there a subject, concept, or paper missing from the library? Let us know what you want to study next. Pinned requests guide the curator&apos;s weekly vault expansions.
      </p>

      <div className={styles.card}>
        {!user ? (
          <div className={styles.unauthenticated}>
            <h3 className={styles.unauthTitle}>Sign in to Submit Requests</h3>
            <p className={styles.unauthText}>
              You must be registered and authenticated to submit topic requests to the library curator.
            </p>
            <button onClick={handleSignIn} className={styles.authBtn}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                <polyline points="10 17 15 12 10 7" />
                <line x1="15" y1="12" x2="3" y2="12" />
              </svg>
              Sign In with Google
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className={styles.form}>
            {success && (
              <div className={styles.successMessage}>
                ✓ Your topic request has been successfully submitted! The curator has been notified and will integrate this into future research sprints.
              </div>
            )}

            <div className={styles.formGroup}>
              <label htmlFor="topic" className={styles.label}>Topic / Concept Name</label>
              <input
                id="topic"
                type="text"
                className={styles.input}
                placeholder="e.g., Fourier Transform, Bayt al-Hikma, TCP Congestion Control"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                required
                disabled={isSubmitting}
              />
            </div>

            <div className={styles.formGroup}>
              <label htmlFor="context" className={styles.label}>Additional Context (Optional)</label>
              <textarea
                id="context"
                className={styles.textarea}
                placeholder="Why are you interested in this? Mention any notes in the library that this should connect with (e.g. [[virtual-memory]])..."
                value={context}
                onChange={(e) => setContext(e.target.value)}
                disabled={isSubmitting}
              />
            </div>

            <button
              type="submit"
              className={styles.submitBtn}
              disabled={isSubmitting || !topic.trim()}
            >
              {isSubmitting ? 'Submitting Request...' : 'Submit Request'}
            </button>
          </form>
        )}
      </div>

      {user && (
        <div>
          <h2 className={styles.historyTitle}>Your Requested Topics ({requests.length})</h2>
          {requests.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>You haven&apos;t requested any notes yet.</p>
          ) : (
            <div className={styles.requestList}>
              {requests.map((req) => {
                const dateStr = new Date(req.created_at).toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                });

                return (
                  <div key={req.id} className={styles.requestItem}>
                    <div className={styles.requestHeader}>
                      <span className={styles.requestTopic}>{req.topic}</span>
                      <span className={styles.requestDate}>{dateStr}</span>
                    </div>
                    {req.context && (
                      <p className={styles.requestContext}>{req.context}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
