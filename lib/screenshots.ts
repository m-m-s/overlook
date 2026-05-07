import { isSupabaseConfigured, supabase } from './supabase';
import type { LocalScreenshot } from './uploads';

export type ScreenshotPatch = Partial<{
  category: string | null;
  subject: string | null;
  status: string | null;
  urgency: string | null;
  urgency_date: string | null;
  resonance: 1 | 2 | 3 | null;
  difficulty: 'beginner' | 'intermediate' | 'advanced' | null;
  time_to_complete: 'quick' | 'afternoon' | 'full_day' | 'multi_day' | 'long_term' | null;
  source_url_manual: string | null;
  notes: string | null;
  manual_typed_tags: { type?: string; value: string }[];
}>;

type Row = {
  id: string;
  storage_path: string;
  created_at: string;
  category: string | null;
  subject: string | null;
  status: string | null;
  urgency: string | null;
  resonance: number | null;
  difficulty: string | null;
  time_to_complete: string | null;
  source_url: string | null;
  source_url_manual: string | null;
  action_url: string | null;
  action_url_type: string | null;
  manual_typed_tags: TypedTag[] | null;
  ai_typed_tags: TypedTag[] | null;
  notes: string | null;
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
    .select(
      'id, storage_path, created_at, category, subject, status, urgency, resonance, difficulty, time_to_complete, source_url, source_url_manual, action_url, action_url_type, manual_typed_tags, ai_typed_tags, notes',
    )
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
    category: r.category,
    subject: r.subject,
    status: r.status,
    urgency: r.urgency,
    resonance: (r.resonance === 1 || r.resonance === 2 || r.resonance === 3 ? r.resonance : null),
    difficulty: (r.difficulty as 'beginner' | 'intermediate' | 'advanced' | null) ?? null,
    timeToComplete: (r.time_to_complete as 'quick' | 'afternoon' | 'full_day' | 'multi_day' | 'long_term' | null) ?? null,
    sourceUrl: r.source_url,
    sourceUrlManual: r.source_url_manual,
    actionUrl: r.action_url,
    actionUrlType: r.action_url_type,
    manualTags: r.manual_typed_tags ?? [],
    aiTags: r.ai_typed_tags ?? [],
    notes: r.notes,
  }));
};

export const updateScreenshot = async (id: string, patch: ScreenshotPatch): Promise<void> => {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.from('screenshots').update(patch).eq('id', id);
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[screenshots] update failed', error);
  }
};

export const deleteScreenshot = async (id: string, storagePath?: string): Promise<void> => {
  if (!isSupabaseConfigured) return;
  if (storagePath) {
    await supabase.storage.from('screenshots').remove([storagePath]);
  }
  const { error } = await supabase.from('screenshots').delete().eq('id', id);
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[screenshots] delete failed', error);
  }
};

/** Bulk delete: remove rows + best-effort remove storage objects. */
export const deleteScreenshots = async (
  items: { id: string; storagePath?: string }[],
): Promise<void> => {
  if (!isSupabaseConfigured || items.length === 0) return;
  const paths = items.map((i) => i.storagePath).filter((p): p is string => Boolean(p));
  if (paths.length > 0) {
    await supabase.storage.from('screenshots').remove(paths);
  }
  const { error } = await supabase
    .from('screenshots')
    .delete()
    .in('id', items.map((i) => i.id));
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[screenshots] bulk delete failed', error);
  }
};

/** Bulk update — apply same patch to many screenshots. */
export const updateScreenshots = async (
  ids: string[],
  patch: ScreenshotPatch,
): Promise<void> => {
  if (!isSupabaseConfigured || ids.length === 0) return;
  const { error } = await supabase.from('screenshots').update(patch).in('id', ids);
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[screenshots] bulk update failed', error);
  }
};

export type TypedTag = { type?: string; value: string };

/** Fetch a single screenshot's manual tags + notes (not preloaded in list query). */
export const fetchScreenshotMeta = async (
  id: string,
): Promise<{
  manual_typed_tags: TypedTag[];
  ai_typed_tags: TypedTag[];
  ai_suggested_subjects: string[];
  notes: string | null;
} | null> => {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabase
    .from('screenshots')
    .select('manual_typed_tags, ai_typed_tags, ai_suggested_subjects, notes')
    .eq('id', id)
    .single();
  if (error || !data) return null;
  return {
    manual_typed_tags: (data.manual_typed_tags ?? []) as TypedTag[],
    ai_typed_tags: (data.ai_typed_tags ?? []) as TypedTag[],
    ai_suggested_subjects: (data.ai_suggested_subjects ?? []) as string[],
    notes: data.notes,
  };
};
