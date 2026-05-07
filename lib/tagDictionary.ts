import AsyncStorage from '@react-native-async-storage/async-storage';

import type { TypedTag } from './screenshots';

/**
 * Tag-type auto-detection per CLAUDE.md tagging system.
 *
 * Lookup order:
 *   1. Learned dictionary  (user's past type assignments — AsyncStorage)
 *   2. Built-in dictionary (this file — ships with the app)
 * If found in exactly one type → auto-type.
 * If found in multiple types   → caller prompts user with the candidates.
 * Otherwise                    → leave untyped.
 *
 * When the user manually assigns a type, save it to the learned dictionary so
 * future entries with the same value auto-type.
 */

// ----- Built-in dictionary --------------------------------------------------

/**
 * Map of normalized value -> list of plausible types. Multi-type entries are
 * deliberately conservative; the goal is to *help* without being annoying.
 */
const BUILT_IN: Record<string, string[]> = {};

const add = (type: string, values: string[]) => {
  for (const v of values) {
    const key = v.trim().toLowerCase();
    if (!key) continue;
    if (!BUILT_IN[key]) BUILT_IN[key] = [];
    if (!BUILT_IN[key].includes(type)) BUILT_IN[key].push(type);
  }
};

add('color', [
  'red', 'orange', 'yellow', 'green', 'blue', 'navy', 'teal', 'purple', 'pink',
  'black', 'white', 'grey', 'gray', 'brown', 'tan', 'beige', 'cream', 'ivory',
  'gold', 'silver', 'bronze', 'copper', 'rose', 'maroon', 'olive', 'mint',
  'pastel', 'monochrome', 'earth tones', 'jewel tones', 'neon',
]);

add('season', ['spring', 'summer', 'fall', 'autumn', 'winter']);

add('cuisine', [
  'italian', 'japanese', 'mexican', 'chinese', 'thai', 'indian', 'french',
  'korean', 'vietnamese', 'american', 'mediterranean', 'middle eastern',
  'ethiopian', 'brazilian', 'spanish', 'greek', 'turkish', 'lebanese',
  'moroccan', 'peruvian', 'caribbean', 'cajun', 'german', 'british',
]);

add('mood', [
  'cozy', 'bold', 'moody', 'bright', 'minimal', 'minimalist', 'playful',
  'serene', 'dramatic', 'soft', 'edgy', 'romantic', 'rustic', 'industrial',
  'modern', 'vintage', 'classic', 'retro',
]);

add('occasion', [
  'casual', 'formal', 'date night', 'birthday', 'wedding', 'party',
  'holiday', 'work', 'weekend', 'travel', 'everyday',
]);

add('genre', [
  'horror', 'comedy', 'drama', 'sci-fi', 'fantasy', 'thriller', 'romance',
  'documentary', 'action', 'animation', 'mystery', 'lo-fi', 'indie', 'pop',
  'rock', 'jazz', 'classical', 'electronic', 'ambient', 'folk', 'rap', 'hip-hop',
]);

add('material', [
  'wool', 'cotton', 'linen', 'silk', 'leather', 'suede', 'denim', 'wood',
  'ceramic', 'porcelain', 'glass', 'metal', 'brass', 'steel', 'iron',
  'concrete', 'plaster', 'cashmere', 'velvet', 'felt',
]);

add('technique', [
  'cable stitch', 'crochet', 'knitting', 'embroidery', 'weaving', 'watercolor',
  'oil paint', 'acrylic', 'sourdough', 'fermenting', 'pickling', 'roasting',
  'braising', 'sous vide',
]);

add('item', [
  'recipe', 'pattern', 'dress', 'sweater', 'shirt', 'pants', 'skirt', 'jacket',
  'coat', 'hat', 'scarf', 'shoes', 'boots', 'bag', 'beanie', 'poster',
  'painting', 'sculpture', 'book', 'article', 'tutorial', 'video', 'episode',
  'movie', 'film', 'show', 'song', 'album', 'playlist', 'restaurant', 'cafe',
  'bar', 'apartment', 'house', 'gift',
]);

// ----- Learned dictionary ---------------------------------------------------

const LEARNED_KEY = 'overlook.learned_tag_types';

let cache: Record<string, string> | null = null;

const loadLearned = async (): Promise<Record<string, string>> => {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(LEARNED_KEY);
    cache = raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    cache = {};
  }
  return cache;
};

const saveLearned = async (next: Record<string, string>): Promise<void> => {
  cache = next;
  try {
    await AsyncStorage.setItem(LEARNED_KEY, JSON.stringify(next));
  } catch {
    // best effort
  }
};

/**
 * Record that `value` was assigned `type`. Future lookups will auto-type.
 * Called when the user manually picks (or confirms) a type for a tag.
 */
export const rememberTagType = async (value: string, type: string): Promise<void> => {
  const key = value.trim().toLowerCase();
  if (!key) return;
  const learned = await loadLearned();
  if (learned[key] === type) return;
  await saveLearned({ ...learned, [key]: type });
};

// ----- Lookup ---------------------------------------------------------------

export type LookupResult =
  | { kind: 'unknown' }                                          // not in any dict
  | { kind: 'auto'; type: string }                               // single match
  | { kind: 'ambiguous'; candidates: string[] };                 // multiple types

/**
 * Look up the type(s) for a tag value. Learned dict wins over built-in.
 */
export const lookupTagType = async (value: string): Promise<LookupResult> => {
  const key = value.trim().toLowerCase();
  if (!key) return { kind: 'unknown' };

  const learned = await loadLearned();
  if (learned[key]) return { kind: 'auto', type: learned[key] };

  const candidates = BUILT_IN[key];
  if (!candidates || candidates.length === 0) return { kind: 'unknown' };
  if (candidates.length === 1) return { kind: 'auto', type: candidates[0] };
  return { kind: 'ambiguous', candidates };
};

/**
 * Wrap a string in a TypedTag. If the value is in the dictionary, the type is
 * auto-assigned. Caller should still handle the ambiguous case in UI.
 */
export const buildTagFromValue = async (value: string): Promise<TypedTag | { ambiguous: true; value: string; candidates: string[] }> => {
  const r = await lookupTagType(value);
  if (r.kind === 'auto') return { type: r.type, value };
  if (r.kind === 'ambiguous') return { ambiguous: true, value, candidates: r.candidates };
  return { value };
};
