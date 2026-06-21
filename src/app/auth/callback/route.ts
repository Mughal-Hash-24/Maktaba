// src/app/auth/callback/route.ts
import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '../../../lib/supabase-server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  // If a next parameter exists, redirect there, otherwise redirect to home
  const next = searchParams.get('next') ?? '/';

  if (code) {
    try {
      const supabase = await getSupabaseServerClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        // Appending migratestate=true lets the client know it should trigger the guest migration flow
        return NextResponse.redirect(`${origin}${next}?migratestate=true`);
      }
    } catch (err) {
      console.error('Error exchanging OAuth code for session:', err);
    }
  }

  // Return the user to home page or error path if exchange fails
  return NextResponse.redirect(`${origin}${next}`);
}
