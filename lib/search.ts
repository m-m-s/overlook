import Fuse, { type IFuseOptions } from 'fuse.js';

import type { LocalScreenshot } from './uploads';

/**
 * Fuzzy search across all metadata fields per spec ("Fuse.js fuzzy search").
 *
 * Searched fields, weighted in roughly that order of importance:
 *   - subject (most specific signal)
 *   - tag values (manual + AI mixed)
 *   - category, urgency, status (the dimensions)
 *   - notes
 *
 * Returns the items whose combined score crosses the threshold.
 */

type Searchable = LocalScreenshot & {
  /** Flattened tag values for Fuse to match against (computed on the fly). */
  _tagValues: string[];
};

const FUSE_OPTIONS: IFuseOptions<Searchable> = {
  threshold: 0.4, // 0 = strict, 1 = anything; 0.4 catches typos and partials
  ignoreLocation: true,
  includeScore: false,
  keys: [
    { name: 'subject', weight: 1.6 },
    { name: '_tagValues', weight: 1.4 },
    { name: 'category', weight: 1.0 },
    { name: 'urgency', weight: 0.6 },
    { name: 'status', weight: 0.6 },
    { name: 'notes', weight: 0.5 },
  ],
};

export const searchItems = (items: LocalScreenshot[], query: string): LocalScreenshot[] => {
  const q = query.trim();
  if (!q) return items;

  const enriched: Searchable[] = items.map((it) => ({
    ...it,
    _tagValues: [
      ...(it.manualTags ?? []).map((t) => t.value),
      ...(it.aiTags ?? []).map((t) => t.value),
    ],
  }));

  const fuse = new Fuse(enriched, FUSE_OPTIONS);
  return fuse.search(q).map((r) => r.item);
};
