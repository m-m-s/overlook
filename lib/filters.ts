/**
 * Filter state shared between sidebar (selector) and grid header (display).
 *
 * Sidebar = where filters are SET (chip pickers per dimension).
 * Grid header = where ACTIVE filters are shown as removable chips.
 */

type TypedTagLike = { type?: string; value: string };

export type Filters = {
  categories: Set<string>;
  urgencies: Set<string>;
  statuses: Set<string>;
  resonances: Set<1 | 2 | 3>;
  /** Free-form queries the user typed in the search bar and promoted with
   *  "+ add filter". Each query is matched the same way as the live search
   *  (fuzzy across subject, tag values, category, status, notes). Multiple
   *  queries AND together — every chip must match. */
  tagQueries: Set<string>;
};

export const emptyFilters = (): Filters => ({
  categories: new Set(),
  urgencies: new Set(),
  statuses: new Set(),
  resonances: new Set(),
  tagQueries: new Set(),
});

export const filtersActive = (f: Filters): number =>
  f.categories.size +
  f.urgencies.size +
  f.statuses.size +
  f.resonances.size +
  (f.tagQueries?.size ?? 0);

type FilterableItem = {
  category?: string | null;
  categories?: string[];
  urgency?: string | null;
  status?: string | null;
  resonance?: 1 | 2 | 3 | null;
  subject?: string | null;
  notes?: string | null;
  manualTags?: TypedTagLike[];
  aiTags?: TypedTagLike[];
};

/** Fuzzy substring match across the same fields the live search uses. */
const fuzzyMatchQuery = (item: FilterableItem, query: string): boolean => {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack: string[] = [];
  if (item.subject) haystack.push(item.subject);
  if (item.notes) haystack.push(item.notes);
  if (item.categories && item.categories.length > 0) {
    for (const c of item.categories) haystack.push(c);
  } else if (item.category) {
    haystack.push(item.category);
  }
  if (item.urgency) haystack.push(item.urgency);
  if (item.status) haystack.push(item.status);
  for (const t of item.manualTags ?? []) haystack.push(t.value);
  for (const t of item.aiTags ?? []) haystack.push(t.value);
  for (const s of haystack) {
    if (s.toLowerCase().includes(q)) return true;
  }
  return false;
};

export const applyFilters = <T extends FilterableItem>(items: T[], f: Filters): T[] => {
  if (filtersActive(f) === 0) return items;
  return items.filter((it) => {
    if (f.categories.size > 0) {
      const itemCats = it.categories && it.categories.length > 0 ? it.categories : it.category ? [it.category] : [];
      if (!itemCats.some((c) => f.categories.has(c))) return false;
    }
    if (f.urgencies.size > 0 && (!it.urgency || !f.urgencies.has(it.urgency))) return false;
    if (f.statuses.size > 0 && (!it.status || !f.statuses.has(it.status))) return false;
    if (f.resonances.size > 0 && (!it.resonance || !f.resonances.has(it.resonance))) return false;
    if (f.tagQueries && f.tagQueries.size > 0) {
      for (const q of f.tagQueries) {
        if (!fuzzyMatchQuery(it, q)) return false;
      }
    }
    return true;
  });
};
