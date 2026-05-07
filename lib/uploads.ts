import * as FileSystem from 'expo-file-system/legacy';

import { isSupabaseConfigured, supabase } from './supabase';

export type LocalScreenshot = {
  id: string;
  uri: string;
  storagePath?: string;
  createdAt: string;
  category?: string | null;
  subject?: string | null;
  status?: string | null;
  urgency?: string | null;
  resonance?: 1 | 2 | 3 | null;
  difficulty?: 'beginner' | 'intermediate' | 'advanced' | null;
  timeToComplete?: 'quick' | 'afternoon' | 'full_day' | 'multi_day' | 'long_term' | null;
  sourceUrl?: string | null; // AI-extracted
  sourceUrlManual?: string | null; // user-set
  actionUrl?: string | null;
  actionUrlType?: string | null;
};

const guessExt = (uri: string): string => {
  const m = uri.match(/\.(\w{3,4})(\?|$)/);
  return (m?.[1] ?? 'jpg').toLowerCase();
};

const uriToBytes = async (uri: string): Promise<ArrayBuffer> => {
  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
};

/**
 * Uploads to Supabase Storage if configured + signed in. Otherwise no-ops and
 * returns a local-only record (sprint mode — env may not be wired yet).
 *
 * Caller is responsible for kicking off analysis after the returned record
 * has been added to UI state — see analyzeAndPersist in lib/analyze.
 */
export const uploadScreenshot = async (uri: string): Promise<LocalScreenshot> => {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const createdAt = new Date().toISOString();

  if (!isSupabaseConfigured) {
    return { id, uri, createdAt };
  }

  const { data: userRes } = await supabase.auth.getUser();
  const userId = userRes.user?.id;
  if (!userId) return { id, uri, createdAt };

  const ext = guessExt(uri);
  const storagePath = `${userId}/${id}.${ext}`;
  const bytes = await uriToBytes(uri);

  const { error: uploadErr } = await supabase.storage
    .from('screenshots')
    .upload(storagePath, bytes, { contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}` });
  if (uploadErr) {
    // eslint-disable-next-line no-console
    console.warn('[uploadScreenshot] storage upload failed', uploadErr);
    return { id, uri, createdAt };
  }

  const { error: insertErr } = await supabase
    .from('screenshots')
    .insert({ id, user_id: userId, storage_path: storagePath });
  if (insertErr) {
    // eslint-disable-next-line no-console
    console.warn('[uploadScreenshot] row insert failed', insertErr);
  }

  return { id, uri, storagePath, createdAt };
};
