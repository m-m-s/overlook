import Fuse, { type IFuseOptions } from 'fuse.js';

import type { LocalScreenshot } from './uploads';

type Searchable = LocalScreenshot & {
  _tagValues: string[];
  _sourceHost: string;
};

const FUSE_OPTIONS: IFuseOptions<Searchable> = {
  threshold: 0.4,
  ignoreLocation: true,
  minMatchCharLength: 2,
  includeScore: false,
  keys: [
    { name: 'subject', weight: 1.6 },
    { name: '_tagValues', weight: 1.4 },
    { name: 'category', weight: 1.0 },
    { name: '_sourceHost', weight: 0.7 },
    { name: 'urgency', weight: 0.6 },
    { name: 'status', weight: 0.6 },
    { name: 'notes', weight: 0.5 },
  ],
};

const extractHost = (url?: string | null): string => {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

const enrich = (it: LocalScreenshot): Searchable => ({
  ...it,
  _tagValues: [
    ...(it.manualTags ?? []).map((t) => t.value),
    ...(it.aiTags ?? []).map((t) => t.value),
  ],
  _sourceHost: extractHost(it.sourceUrl ?? it.sourceUrlManual),
});

export const buildSearchIndex = (items: LocalScreenshot[]): Fuse<Searchable> =>
  new Fuse(items.map(enrich), FUSE_OPTIONS);

export const runSearch = (index: Fuse<Searchable>, query: string): LocalScreenshot[] =>
  index.search(query.trim()).map((r) => r.item);
