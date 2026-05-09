import { isSupabaseConfigured, supabase } from './supabase';
import { emptyFilters, type Filters } from './filters';

export type SavedFilter = {
  id: string;
  name: string;
  filters: Filters;
  /** Free-text search query saved alongside the filters. */
  searchQuery?: string;
  /** Optional row icon. Either a category key (renders CategoryIcon) or
   *  any short string (typically a single emoji) rendered as text. */
  icon?: string;
  pinned: boolean;
  createdAt: string;
};

type SerializedFilters = {
  categories?: string[];
  urgencies?: string[];
  statuses?: string[];
  resonances?: number[];
  tagQueries?: string[];
  /** Optional free-text search saved alongside the structured filters. */
  searchQuery?: string;
  /** Optional row icon (category key or emoji). Stored in the existing
   *  `filters` jsonb column to avoid a schema migration. */
  icon?: string;
};

const serializeFilters = (
  f: Filters,
  searchQuery?: string,
  icon?: string,
): SerializedFilters => ({
  categories: Array.from(f.categories),
  urgencies: Array.from(f.urgencies),
  statuses: Array.from(f.statuses),
  resonances: Array.from(f.resonances),
  tagQueries: Array.from(f.tagQueries),
  searchQuery: searchQuery?.trim() || undefined,
  icon: icon?.trim() || undefined,
});

const deserializeFilters = (s: SerializedFilters | null | undefined): Filters => {
  const f = emptyFilters();
  if (!s) return f;
  for (const c of s.categories ?? []) f.categories.add(c);
  for (const u of s.urgencies ?? []) f.urgencies.add(u);
  for (const st of s.statuses ?? []) f.statuses.add(st);
  for (const r of s.resonances ?? []) {
    if (r === 1 || r === 2 || r === 3) f.resonances.add(r);
  }
  for (const q of s.tagQueries ?? []) f.tagQueries.add(q);
  return f;
};

type Row = {
  id: string;
  name: string;
  filters: SerializedFilters;
  pinned: boolean;
  created_at: string;
};

const rowToSaved = (r: Row): SavedFilter => ({
  id: r.id,
  name: r.name,
  filters: deserializeFilters(r.filters),
  searchQuery: r.filters?.searchQuery,
  icon: r.filters?.icon,
  pinned: r.pinned,
  createdAt: r.created_at,
});

/** Fetch all saved filters for the current user, newest pinned first. */
export const listSavedFilters = async (): Promise<SavedFilter[]> => {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('saved_filters')
    .select('id, name, filters, pinned, created_at')
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false });
  if (error || !data) {
    console.warn('[savedFilters] list failed', error);
    return [];
  }
  return (data as Row[]).map(rowToSaved);
};

/** Just the pinned ones — used by the home page to render rows. */
export const listPinnedFilters = async (): Promise<SavedFilter[]> => {
  if (!isSupabaseConfigured) return [];
  const { data, error } = await supabase
    .from('saved_filters')
    .select('id, name, filters, pinned, created_at')
    .eq('pinned', true)
    .order('created_at', { ascending: false });
  if (error || !data) {
    console.warn('[savedFilters] listPinned failed', error);
    return [];
  }
  return (data as Row[]).map(rowToSaved);
};

export const createSavedFilter = async (
  name: string,
  filters: Filters,
  pinned: boolean,
  searchQuery?: string,
  icon?: string,
): Promise<SavedFilter | null> => {
  if (!isSupabaseConfigured) return null;
  const { data: userRes } = await supabase.auth.getUser();
  const userId = userRes.user?.id;
  if (!userId) return null;
  const { data, error } = await supabase
    .from('saved_filters')
    .insert({
      user_id: userId,
      name: name.trim(),
      filters: serializeFilters(filters, searchQuery, icon),
      pinned,
    })
    .select('id, name, filters, pinned, created_at')
    .single();
  if (error || !data) {
    console.warn('[savedFilters] create failed', error);
    return null;
  }
  return rowToSaved(data as Row);
};

export const deleteSavedFilter = async (id: string): Promise<void> => {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.from('saved_filters').delete().eq('id', id);
  if (error) console.warn('[savedFilters] delete failed', error);
};

export const togglePinned = async (id: string, pinned: boolean): Promise<void> => {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase.from('saved_filters').update({ pinned }).eq('id', id);
  if (error) console.warn('[savedFilters] toggle pin failed', error);
};

export const renameSavedFilter = async (id: string, name: string): Promise<void> => {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase
    .from('saved_filters')
    .update({ name: name.trim() })
    .eq('id', id);
  if (error) console.warn('[savedFilters] rename failed', error);
};
