// src/lib/supabase.ts
import { createBrowserClient } from '@supabase/ssr';

// Client-side Supabase client (singleton helper)
let browserClient: ReturnType<typeof createBrowserClient> | null = null;

export function getSupabaseBrowserClient() {
  if (typeof window === 'undefined') return null;
  if (!browserClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      console.warn('Supabase client initialized without NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY env vars.');
      return null;
    }
    browserClient = createBrowserClient(url, key);
  }
  return browserClient;
}
