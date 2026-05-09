import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import { useEffect, useState } from 'react';

import { isSupabaseConfigured, supabase } from './supabase';

/**
 * Subscribe to the current Supabase auth session.
 * Returns null when no user is signed in, or when supabase env is not wired.
 */
export const useSession = (): { session: Session | null; loading: boolean } => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session ?? null);
        setLoading(false);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (mounted) setSession(s);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { session, loading };
};

/** Send a magic link to the user's email. Redirects back to the app via deep link. */
export const sendMagicLink = async (email: string): Promise<{ error: string | null }> => {
  if (!isSupabaseConfigured) {
    return { error: 'Supabase env not configured. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.' };
  }
  const emailRedirectTo = Linking.createURL('/');
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { emailRedirectTo, shouldCreateUser: true },
  });
  return { error: error?.message ?? null };
};

/**
 * Verify the 6-digit code from the magic-link email. Use this when the deep
 * link redirect (link tap) doesn't bounce back into Expo Go — the email also
 * includes a {{ .Token }} the user can type in manually.
 */
export const verifyEmailOtp = async (
  email: string,
  token: string,
): Promise<{ error: string | null }> => {
  if (!isSupabaseConfigured) {
    return { error: 'Supabase env not configured.' };
  }
  const { error } = await supabase.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: token.trim(),
    type: 'email',
  });
  return { error: error?.message ?? null };
};

/**
 * Handle an incoming deep link URL from the magic-link email.
 * Supabase emits URLs like `<scheme>://#access_token=...&refresh_token=...` (implicit flow)
 * or `<scheme>://?code=...` (PKCE). We try both shapes.
 */
export const handleAuthDeepLink = async (url: string): Promise<void> => {
  if (!isSupabaseConfigured) return;

  // Strip everything before the fragment/query so we can parse.
  const { queryParams, path } = Linking.parse(url);
  // expo-linking puts both query (?a=b) and fragment (#a=b) into queryParams.
  const params = queryParams ?? {};

  const accessToken = typeof params.access_token === 'string' ? params.access_token : null;
  const refreshToken = typeof params.refresh_token === 'string' ? params.refresh_token : null;
  const code = typeof params.code === 'string' ? params.code : null;
  const tokenHash = typeof params.token_hash === 'string' ? params.token_hash : null;
  const type = typeof params.type === 'string' ? params.type : null;

  try {
    if (accessToken && refreshToken) {
      await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    } else if (code) {
      await supabase.auth.exchangeCodeForSession(code);
    } else if (tokenHash && type) {
      // verifyOtp signature varies by type; magiclink uses token_hash
      await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as 'magiclink' | 'email' });
    }
  } catch (err) {
     
    console.warn('[auth] deep link handler failed', { url, path, err });
  }
};

export const signOut = async (): Promise<void> => {
  if (!isSupabaseConfigured) return;
  await supabase.auth.signOut();
};

/**
 * Email + password sign-in. Used as a dev fallback when magic-link email
 * delivery is rate-limited or unreliable. Magic link remains primary auth
 * per spec; this is a development-time alternate path.
 *
 * TODO post-sprint: decide whether to keep password as a fallback option in
 * production or remove. (Tracked in NOTES.md.)
 */
export const signInWithPassword = async (
  email: string,
  password: string,
): Promise<{ error: string | null }> => {
  if (!isSupabaseConfigured) return { error: 'Supabase not configured' };
  const { error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  return { error: error?.message ?? null };
};

/**
 * Email + password sign-up. Requires Supabase project to have "Confirm
 * email" toggled OFF (Authentication → Providers → Email) — otherwise this
 * will queue a confirmation email and hit the same rate limit we're trying
 * to avoid.
 */
export const signUpWithPassword = async (
  email: string,
  password: string,
): Promise<{ error: string | null }> => {
  if (!isSupabaseConfigured) return { error: 'Supabase not configured' };
  const { error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
  });
  return { error: error?.message ?? null };
};
