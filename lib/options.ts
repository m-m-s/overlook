// Picker options for metadata fields, sourced from CLAUDE.md.

import type { Category } from '@/components/CategoryIcon';

export const CATEGORIES: Category[] = [
  'craft', 'fashion', 'film', 'tv', 'food', 'art', 'music', 'places',
  'meme', 'messages', 'shopping', 'reading', 'events', 'tech', 'documents',
];

export const STATUSES = [
  { key: 'ready', label: 'Ready to do' },
  { key: 'supplies', label: 'Need supplies' },
  { key: 'research', label: 'Need to research' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'done', label: 'Done' },
] as const;

export const URGENCIES = [
  { key: 'today', label: 'Today' },
  { key: 'this_week', label: 'This week' },
  { key: 'this_month', label: 'This month' },
  { key: 'this_season', label: 'This season' },
  { key: 'this_year', label: 'This year' },
  { key: 'someday', label: 'Someday' },
  { key: 'expires_soon', label: 'Expires soon' },
] as const;

export const DIFFICULTIES = [
  { key: 'beginner', label: 'Beginner' },
  { key: 'intermediate', label: 'Intermediate' },
  { key: 'advanced', label: 'Advanced' },
] as const;

export const TIMES_TO_COMPLETE = [
  { key: 'quick', label: 'Quick (under an hour)' },
  { key: 'afternoon', label: 'Afternoon' },
  { key: 'full_day', label: 'Full day' },
  { key: 'multi_day', label: 'Multi-day' },
  { key: 'long_term', label: 'Long-term' },
] as const;

export const ACTION_URL_TYPES = [
  'tickets', 'directions', 'buy', 'recipe', 'listen', 'watch', 'read', 'search',
] as const;

export const RESONANCE_LEVELS = [1, 2, 3] as const;

// Acronyms / brand-cased category keys that should render in all caps
// instead of sentence case. Add to this map when a new short label is added.
const CAPS_OVERRIDES: Record<string, string> = {
  tv: 'TV',
};

/** Display helper: turn a lowercase key like "craft" into "Craft". Used for
 *  categories (whose keys we keep lowercase to match the DB column) so the
 *  user-facing text is always sentence-case. Acronyms in CAPS_OVERRIDES
 *  render uppercased instead. */
export const capitalize = (s: string): string => {
  if (!s) return s;
  if (CAPS_OVERRIDES[s]) return CAPS_OVERRIDES[s];
  return s[0].toUpperCase() + s.slice(1);
};

export const TAG_TYPES = [
  // Display order — general → specific, used for the tag-row sort in
  // ScreenshotDetail. New types added by the vision prompt should slot
  // into the position that matches their semantic generality.
  'item', 'activity', 'format', 'genre', 'cuisine', 'subject', 'theme',
  'technique', 'style', 'material', 'color', 'season', 'occasion', 'mood',
  'source', 'person', 'place',
] as const;
