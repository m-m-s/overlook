/**
 * Filter state shared between sidebar (selector) and grid header (display).
 *
 * Sidebar = where filters are SET (chip pickers per dimension).
 * Grid header = where ACTIVE filters are shown as removable chips.
 */

export type Filters = {
  categories: Set<string>;
  urgencies: Set<string>;
  statuses: Set<string>;
  resonances: Set<1 | 2 | 3>;
};

export const emptyFilters = (): Filters => ({
  categories: new Set(),
  urgencies: new Set(),
  statuses: new Set(),
  resonances: new Set(),
});

export const filtersActive = (f: Filters): number =>
  f.categories.size + f.urgencies.size + f.statuses.size + f.resonances.size;

export const applyFilters = <
  T extends {
    category?: string | null;
    urgency?: string | null;
    status?: string | null;
    resonance?: 1 | 2 | 3 | null;
  },
>(
  items: T[],
  f: Filters,
): T[] => {
  if (filtersActive(f) === 0) return items;
  return items.filter((it) => {
    if (f.categories.size > 0 && (!it.category || !f.categories.has(it.category))) return false;
    if (f.urgencies.size > 0 && (!it.urgency || !f.urgencies.has(it.urgency))) return false;
    if (f.statuses.size > 0 && (!it.status || !f.statuses.has(it.status))) return false;
    if (f.resonances.size > 0 && (!it.resonance || !f.resonances.has(it.resonance))) return false;
    return true;
  });
};
