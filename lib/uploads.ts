import * as FileSystem from 'expo-file-system/legacy';

import { isSupabaseConfigured, supabase } from './supabase';

type TypedTag = { type?: string; value: string };

export type LocalScreenshot = {
  id: string;
  uri: string;
  storagePath?: string;
  createdAt: string;
  /** expo-media-library asset id, when the screenshot was imported from the device. */
  deviceAssetId?: string | null;
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
  manualTags?: TypedTag[];
  aiTags?: TypedTag[];
  notes?: string | null;
  aiReviewed?: boolean;
  localOnly?: boolean;
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
 *
 * `fileHash` is an optional fingerprint stored on the row for duplicate
 * detection. If a row with the same file_hash already exists for this user,
 * the upload is skipped and the existing row is returned.
 */
export const uploadScreenshot = async (
  uri: string,
  opts: { fileHash?: string; fileCreatedAt?: string; deviceAssetId?: string } = {},
): Promise<LocalScreenshot> => {
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

  const { error: insertErr } = await supabase.from('screenshots').insert({
    id,
    user_id: userId,
    storage_path: storagePath,
    file_hash: opts.fileHash ?? null,
    file_created_at: opts.fileCreatedAt ?? null,
    device_asset_id: opts.deviceAssetId ?? null,
  });
  if (insertErr) {
    // eslint-disable-next-line no-console
    console.warn('[uploadScreenshot] row insert failed', insertErr);
  }

  return { id, uri, storagePath, createdAt, deviceAssetId: opts.deviceAssetId ?? null };
};

/** Get the set of file_hash values already stored for the current user. */
export const fetchExistingFingerprints = async (): Promise<Set<string>> => {
  if (!isSupabaseConfigured) return new Set();
  const { data, error } = await supabase
    .from('screenshots')
    .select('file_hash')
    .not('file_hash', 'is', null)
    .limit(10000);
  if (error || !data) {
    // eslint-disable-next-line no-console
    console.warn('[fetchExistingFingerprints] failed', error);
    return new Set();
  }
  return new Set(data.map((r: { file_hash: string | null }) => r.file_hash).filter(Boolean) as string[]);
};
