import { isSupabaseConfigured, supabase } from './supabase';
import type { LocalScreenshot } from './uploads';

type Row = {
  id: string;
  storage_path: string;
  created_at: string;
};

/**
 * Fetch the current user's screenshots and resolve each storage_path to a
 * signed URL we can render. Returns [] when supabase isn't configured.
 *
 * Sprint v1: signed URLs are valid for 1 hour. Refetch on app open.
 */
export const fetchScreenshots = async (): Promise<LocalScreenshot[]> => {
  if (!isSupabaseConfigured) return [];

  const { data, error } = await supabase
    .from('screenshots')
    .select('id, storage_path, created_at')
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[screenshots] fetch failed', error);
    return [];
  }

  const rows = (data ?? []) as Row[];
  if (rows.length === 0) return [];

  const { data: signed, error: signErr } = await supabase.storage
    .from('screenshots')
    .createSignedUrls(
      rows.map((r) => r.storage_path),
      60 * 60,
    );
  if (signErr || !signed) {
    // eslint-disable-next-line no-console
    console.warn('[screenshots] sign failed', signErr);
    return [];
  }

  return rows.map((r, i) => ({
    id: r.id,
    uri: signed[i]?.signedUrl ?? '',
    storagePath: r.storage_path,
    createdAt: r.created_at,
  }));
};
