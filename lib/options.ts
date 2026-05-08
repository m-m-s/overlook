// Picker options for metadata fields, sourced from CLAUDE.md.

import type { Category } from '@/components/CategoryIcon';

// Note: `film` was merged into `tv` (which now covers all moving-image
// content — movies, shows, YouTube, kdrama, etc.). The format tag type
// distinguishes feature-film vs tv-show vs vlog etc.
export const CATEGORIES: Category[] = [
  'craft', 'fashion', 'tv', 'food', 'art', 'music', 'places',
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

/** Acronyms / brand-cased tokens used inside tag values that should
 *  render uppercased. Keys are lowercase, values are the canonical
 *  display form. Add to this map when a new shorthand appears. */
const TOKEN_OVERRIDES: Record<string, string> = {
  tv: 'TV',
  ep: 'EP',
  dj: 'DJ',
  ny: 'NY',
  nyc: 'NYC',
  la: 'LA',
  uk: 'UK',
  us: 'US',
  ai: 'AI',
  api: 'API',
  ux: 'UX',
  ui: 'UI',
};

/** Format a kebab-cased value (e.g. "feature-film", "tv-show", "kdrama")
 *  into a human-readable label ("Feature Film", "TV Show", "K-Drama").
 *  Splits on '-', title-cases each token, and applies acronym overrides
 *  from TOKEN_OVERRIDES. Special-cases "kdrama" / "jdrama" prefixes. */
export const formatTagValue = (raw: string): string => {
  if (!raw) return raw;
  // Special-case region-prefixed drama shorthand: kdrama → K-Drama, jdrama → J-Drama, cdrama → C-Drama.
  const m = raw.match(/^([kjc])drama$/i);
  if (m) return `${m[1].toUpperCase()}-Drama`;

  return raw
    .split('-')
    .map((token) => {
      const lower = token.toLowerCase();
      if (TOKEN_OVERRIDES[lower]) return TOKEN_OVERRIDES[lower];
      if (!token) return token;
      return token[0].toUpperCase() + token.slice(1);
    })
    .join(' ');
};

export const TAG_TYPES = [
  // Display order — general → specific, used for the tag-row sort in
  // ScreenshotDetail. New types added by the vision prompt should slot
  // into the position that matches their semantic generality.
  'item', 'activity', 'format', 'genre', 'cuisine', 'subject', 'theme',
  'technique', 'style', 'material', 'color', 'season', 'occasion', 'mood',
  'source', 'person', 'place',
] as const;
