import { demoScreenshots } from './demoData';
import { isDemoMode } from './demoMode';
import { resolveDeviceAsset } from './deviceUri';
import { isSupabaseConfigured, supabase } from './supabase';
import type { TypedTag } from './tags';
import type { ActionLink, ActionLinkType, LocalScreenshot } from './uploads';

const VALID_ACTION_TYPES = new Set<ActionLinkType>([
  'profile', 'pattern', 'stream', 'video', 'maps', 'listing',
  'tickets', 'directions', 'buy', 'recipe', 'watch', 'read', 'search',
]);

/** Parse the jsonb action_urls column into typed entries. Falls back to
 *  wrapping the legacy single action_url + action_url_type pair when the
 *  array is empty (covers rows from before the multi-url migration). */
const parseActionUrls = (
  raw: unknown,
  legacyUrl: string | null,
  legacyType: string | null,
): ActionLink[] => {
  if (Array.isArray(raw) && raw.length > 0) {
    const out: ActionLink[] = [];
    for (const entry of raw) {
      if (!entry || typeof entry !== 'object') continue;
      const e = entry as Record<string, unknown>;
      if (typeof e.url !== 'string' || typeof e.type !== 'string') continue;
      if (!VALID_ACTION_TYPES.has(e.type as ActionLinkType)) continue;
      out.push({
        url: e.url,
        type: e.type as ActionLinkType,
        label: typeof e.label === 'string' ? e.label : '',
        source: e.source === 'manual' ? 'manual' : 'ai',
      });
    }
    if (out.length > 0) return out;
  }
  if (legacyUrl) {
    const t = legacyType && VALID_ACTION_TYPES.has(legacyType as ActionLinkType)
      ? (legacyType as ActionLinkType)
      : 'search';
    return [{ url: legacyUrl, type: t, label: '', source: 'ai' }];
  }
  return [];
};

export type ScreenshotPatch = Partial<{
  category: string | null;
  categories: string[];
  action_urls: ActionLink[];
  subject: string | null;
  status: string | null;
  urgency: string | null;
  urgency_date: string | null;
  resonance: 1 | 2 | 3 | null;
  difficulty: 'beginner' | 'intermediate' | 'advanced' | null;
  time_to_complete: 'quick' | 'afternoon' | 'full_day' | 'multi_day' | 'long_term' | null;
  source_url_manual: string | null;
  notes: string | null;
  ai_reviewed: boolean;
  local_only: boolean;
  manual_typed_tags: { type?: string; value: string }[];
}>;

type Row = {
  id: string;
  storage_path: string;
  created_at: string;
  device_asset_id: string | null;
  category: string | null;
  categories: string[] | null;
  subject: string | null;
  status: string | null;
  urgency: string | null;
  urgency_date: string | null;
  resonance: number | null;
  difficulty: string | null;
  time_to_complete: string | null;
  source_url: string | null;
  source_url_manual: string | null;
  action_url: string | null;
  action_url_type: string | null;
  action_urls: unknown[] | null;
  manual_typed_tags: TypedTag[] | null;
  ai_typed_tags: TypedTag[] | null;
  notes: string | null;
  ai_reviewed: boolean | null;
  local_only: boolean | null;
};

/**
 * Fetch the current user's screenshots and resolve each storage_path to a
 * signed URL we can render. Returns [] when supabase isn't configured.
 *
 * Sprint v1: signed URLs are valid for 1 hour. Refetch on app open.
 */
export const fetchScreenshots = async (): Promise<LocalScreenshot[]> => {
  // Demo mode short-circuits: returns the in-memory sample set without
  // hitting Supabase. Cleared by toggling demo mode off in settings (or empty
  // state) — no real data is touched.
  if (await isDemoMode()) {
    return demoScreenshots;
  }
  if (!isSupabaseConfigured) return [];

  const { data, error } = await supabase
    .from('screenshots')
    .select(
      'id, storage_path, created_at, device_asset_id, category, categories, subject, status, urgency, urgency_date, resonance, difficulty, time_to_complete, source_url, source_url_manual, action_url, action_url_type, action_urls, manual_typed_tags, ai_typed_tags, notes, ai_reviewed, local_only',
    )
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
     
    console.warn('[screenshots] fetch failed', error);
    return [];
  }

  const rows = (data ?? []) as Row[];
  if (rows.length === 0) return [];

  // Device-only architecture: resolve URI per row from MediaLibrary asset id.
  // Legacy rows (storage_path set, device_asset_id null) fall back to a
  // signed URL so existing test data keeps rendering.
  const legacyRows = rows.filter((r) => !r.device_asset_id && r.storage_path);
  let legacySigned: { path: string; signedUrl: string }[] = [];
  if (legacyRows.length > 0) {
    const { data: signed } = await supabase.storage
      .from('screenshots')
      .createSignedUrls(
        legacyRows.map((r) => r.storage_path).filter((p): p is string => Boolean(p)),
        60 * 60,
      );
    legacySigned = (signed ?? [])
      .filter((s): s is typeof s & { signedUrl: string } => Boolean(s.signedUrl))
      .map((s) => ({ path: s.path ?? '', signedUrl: s.signedUrl }));
  }

  const out = await Promise.all(
    rows.map(async (r): Promise<LocalScreenshot> => {
      let uri = '';
      if (r.device_asset_id) {
        const resolved = await resolveDeviceAsset(r.device_asset_id);
        uri = resolved?.uri ?? '';
        if (!uri) {
           
          console.warn('[fetchScreenshots] failed to resolve device asset', r.device_asset_id);
        }
      } else if (r.storage_path) {
        uri = legacySigned.find((s) => s.path === r.storage_path)?.signedUrl ?? '';
      }
      // Categories: prefer the array column; fall back to wrapping the legacy
      // single category string for any rows not yet backfilled.
      const cats =
        r.categories && r.categories.length > 0
          ? r.categories
          : r.category
            ? [r.category]
            : [];
      return {
        id: r.id,
        uri,
        storagePath: r.storage_path ?? undefined,
        createdAt: r.created_at,
        deviceAssetId: r.device_asset_id,
        category: cats[0] ?? null,
        categories: cats,
        subject: r.subject,
        status: r.status,
        urgency: r.urgency,
        urgencyDate: r.urgency_date,
        resonance: (r.resonance === 1 || r.resonance === 2 || r.resonance === 3 ? r.resonance : null),
        difficulty: (r.difficulty as 'beginner' | 'intermediate' | 'advanced' | null) ?? null,
        timeToComplete: (r.time_to_complete as 'quick' | 'afternoon' | 'full_day' | 'multi_day' | 'long_term' | null) ?? null,
        sourceUrl: r.source_url,
        sourceUrlManual: r.source_url_manual,
        actionUrl: r.action_url,
        actionUrlType: r.action_url_type,
        actionUrls: parseActionUrls(r.action_urls, r.action_url, r.action_url_type),
        manualTags: r.manual_typed_tags ?? [],
        aiTags: r.ai_typed_tags ?? [],
        notes: r.notes,
        aiReviewed: r.ai_reviewed ?? false,
        localOnly: r.local_only ?? false,
      };
    }),
  );
  return out;
};

/**
 * Privacy gate: returns true if the row is marked local_only. Every code
 * path that's about to send the image to Claude must check this first to
 * honor user intent even if the flag was set after the original upload.
 */
export const isLocalOnly = async (id: string): Promise<boolean> => {
  if (!isSupabaseConfigured) return false;
  const { data, error } = await supabase
    .from('screenshots')
    .select('local_only')
    .eq('id', id)
    .single();
  if (error || !data) return false;
  return data.local_only === true;
};

export const updateScreenshot = async (
  id: string,
  patch: ScreenshotPatch,
): Promise<{ error: string | null }> => {
  if (!isSupabaseConfigured) return { error: null };
  const { error } = await supabase.from('screenshots').update(patch).eq('id', id);
  if (error) {
    console.warn('[screenshots] update failed', error);
    return { error: error.message };
  }
  return { error: null };
};

export const deleteScreenshot = async (
  id: string,
  storagePath?: string,
): Promise<{ error: string | null }> => {
  if (!isSupabaseConfigured) return { error: null };
  if (storagePath) {
    await supabase.storage.from('screenshots').remove([storagePath]);
  }
  const { error } = await supabase.from('screenshots').delete().eq('id', id);
  if (error) {
    console.warn('[screenshots] delete failed', error);
    return { error: error.message };
  }
  return { error: null };
};

/** Bulk delete: remove rows + best-effort remove storage objects. */
export const deleteScreenshots = async (
  items: { id: string; storagePath?: string }[],
): Promise<{ error: string | null }> => {
  if (!isSupabaseConfigured || items.length === 0) return { error: null };
  const paths = items.map((i) => i.storagePath).filter((p): p is string => Boolean(p));
  if (paths.length > 0) {
    await supabase.storage.from('screenshots').remove(paths);
  }
  const { error } = await supabase
    .from('screenshots')
    .delete()
    .in('id', items.map((i) => i.id));
  if (error) {
    console.warn('[screenshots] bulk delete failed', error);
    return { error: error.message };
  }
  return { error: null };
};

/** Bulk update — apply same patch to many screenshots. */
export const updateScreenshots = async (
  ids: string[],
  patch: ScreenshotPatch,
): Promise<{ error: string | null }> => {
  if (!isSupabaseConfigured || ids.length === 0) return { error: null };
  const { error } = await supabase.from('screenshots').update(patch).in('id', ids);
  if (error) {
    console.warn('[screenshots] bulk update failed', error);
    return { error: error.message };
  }
  return { error: null };
};

// Re-exported for convenience from the canonical declaration in lib/tags.ts.
export type { TypedTag } from './tags';

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
