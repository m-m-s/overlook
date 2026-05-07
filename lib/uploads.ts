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

/**
 * Device-only architecture per CLAUDE.md: "Images: On device only. Never
 * stored on server." We persist metadata + device_asset_id; the image stays
 * on the phone. The only time bytes leave the device is during Claude
 * analysis (and they're discarded after).
 *
 * `uri` is kept in the returned record for immediate UI render but is NOT
 * persisted to the row. On reload, fetchScreenshots re-resolves the URI from
 * device_asset_id via MediaLibrary.
 */
export const uploadScreenshot = async (
  uri: string,
  opts: { fileHash?: string; fileCreatedAt?: string; deviceAssetId?: string } = {},
): Promise<LocalScreenshot> => {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const createdAt = new Date().toISOString();

  if (!isSupabaseConfigured) {
    return { id, uri, createdAt, deviceAssetId: opts.deviceAssetId ?? null };
  }

  const { data: userRes } = await supabase.auth.getUser();
  const userId = userRes.user?.id;
  if (!userId) return { id, uri, createdAt, deviceAssetId: opts.deviceAssetId ?? null };

  const { error: insertErr } = await supabase.from('screenshots').insert({
    id,
    user_id: userId,
    storage_path: null,
    file_hash: opts.fileHash ?? null,
    file_created_at: opts.fileCreatedAt ?? null,
    device_asset_id: opts.deviceAssetId ?? null,
  });
  if (insertErr) {
    console.warn('[uploadScreenshot] row insert failed', insertErr);
  }

  return { id, uri, createdAt, deviceAssetId: opts.deviceAssetId ?? null };
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
