// Picker options for metadata fields, sourced from CLAUDE.md.

import type { Category } from '@/components/CategoryIcon';

export const CATEGORIES: Category[] = [
  'craft', 'fashion', 'film', 'tv', 'food', 'art', 'music', 'places',
  'meme', 'messages', 'shopping', 'reading', 'events', 'tech', 'documents',
];

export const STATUSES = [
  { key: 'ready', label: 'ready to do' },
  { key: 'supplies', label: 'need supplies' },
  { key: 'research', label: 'need to research' },
  { key: 'in_progress', label: 'in progress' },
  { key: 'done', label: 'done' },
] as const;

export const URGENCIES = [
  { key: 'today', label: 'today' },
  { key: 'this_week', label: 'this week' },
  { key: 'this_month', label: 'this month' },
  { key: 'this_season', label: 'this season' },
  { key: 'this_year', label: 'this year' },
  { key: 'someday', label: 'someday' },
  { key: 'expires_soon', label: 'expires soon' },
] as const;

export const DIFFICULTIES = [
  { key: 'beginner', label: 'beginner' },
  { key: 'intermediate', label: 'intermediate' },
  { key: 'advanced', label: 'advanced' },
] as const;

export const TIMES_TO_COMPLETE = [
  { key: 'quick', label: 'quick (under an hour)' },
  { key: 'afternoon', label: 'afternoon' },
  { key: 'full_day', label: 'full day' },
  { key: 'multi_day', label: 'multi-day' },
  { key: 'long_term', label: 'long-term' },
] as const;

export const ACTION_URL_TYPES = [
  'tickets', 'directions', 'buy', 'recipe', 'listen', 'watch', 'read', 'search',
] as const;

export const RESONANCE_LEVELS = [1, 2, 3] as const;

export const TAG_TYPES = [
  'item', 'genre', 'cuisine', 'technique', 'style', 'material', 'color',
  'season', 'occasion', 'mood', 'source', 'person', 'place',
] as const;
