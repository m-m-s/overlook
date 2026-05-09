import type { LocalScreenshot } from './uploads';
import type { TypedTag } from './tags';

/**
 * Score how similar two screenshots are based on shared tags + categories.
 *
 * The score is the Jaccard-style overlap of their normalized tag sets,
 * weighted so that:
 *   - shared CATEGORIES count heavily (top-level kinship)
 *   - shared "specific" tag types (subject, dish, source, author, person,
 *     place, brand) weight more than generic ones
 *   - shared genre/style/mood/season carry medium weight
 *   - shared urgency/status are low signal — skipped
 *
 * Returns the top N items sorted by score, excluding the seed item.
 */

const HIGH_SIGNAL_TYPES = new Set([
  'subject', 'dish', 'source', 'author', 'person', 'place', 'brand',
  'item', 'platform', 'place_type', 'pattern', 'cuisine',
]);

const MED_SIGNAL_TYPES = new Set([
  'genre', 'style', 'mood', 'season', 'theme', 'technique', 'material',
  'occasion', 'format', 'screenshot_type', 'activity', 'language',
]);

const tagKey = (t: TypedTag): string => `${t.type ?? ''}:${t.value.trim().toLowerCase()}`;
const tagWeight = (t: TypedTag): number => {
  if (!t.type) return 0.5; // untyped — weak signal
  if (HIGH_SIGNAL_TYPES.has(t.type)) return 2.0;
  if (MED_SIGNAL_TYPES.has(t.type)) return 1.0;
  return 0.5;
};

const itemTagsAsMap = (it: LocalScreenshot): Map<string, number> => {
  const map = new Map<string, number>();
  const all: TypedTag[] = [...(it.manualTags ?? []), ...(it.aiTags ?? [])];
  for (const t of all) {
    const k = tagKey(t);
    if (!k) continue;
    const w = tagWeight(t);
    map.set(k, Math.max(map.get(k) ?? 0, w));
  }
  return map;
};

const score = (seed: LocalScreenshot, candidate: LocalScreenshot): number => {
  if (seed.id === candidate.id) return -Infinity;

  const seedTags = itemTagsAsMap(seed);
  const candTags = itemTagsAsMap(candidate);

  let shared = 0;
  for (const [k, w] of seedTags) {
    if (candTags.has(k)) shared += Math.min(w, candTags.get(k) ?? 0);
  }

  // Category overlap — strong kinship signal.
  const seedCats = seed.categories?.length ? seed.categories : seed.category ? [seed.category] : [];
  const candCats = candidate.categories?.length ? candidate.categories : candidate.category ? [candidate.category] : [];
  const sharedCats = seedCats.filter((c) => candCats.includes(c)).length;

  // Subject string match (loose) — same product / show / restaurant
  let subjectBonus = 0;
  if (seed.subject && candidate.subject) {
    const a = seed.subject.toLowerCase();
    const b = candidate.subject.toLowerCase();
    if (a === b) subjectBonus = 4;
    else if (a.includes(b) || b.includes(a)) subjectBonus = 2;
  }

  return shared + sharedCats * 3 + subjectBonus;
};

/**
 * Find up to `limit` screenshots that look most like `seed`. Returns them
 * in descending order of similarity, omitting the seed itself and any
 * candidates with no shared tags or category at all.
 */
export const findSimilar = (
  seed: LocalScreenshot,
  pool: LocalScreenshot[],
  limit = 12,
): LocalScreenshot[] => {
  const scored = pool
    .map((it) => ({ it, s: score(seed, it) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit);
  return scored.map((x) => x.it);
};
