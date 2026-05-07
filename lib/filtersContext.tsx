import { createContext, useContext, useState, type ReactNode } from 'react';

import { emptyFilters, type Filters } from './filters';

type FilterContextValue = {
  filters: Filters;
  setFilters: (f: Filters) => void;
  /**
   * Replace filters wholesale (e.g., when applying a saved filter). Same as
   * setFilters but named for clarity at call sites.
   */
  applyFilters: (f: Filters) => void;
  clearFilters: () => void;
};

const FilterContext = createContext<FilterContextValue | null>(null);

export const FilterProvider = ({ children }: { children: ReactNode }) => {
  const [filters, setFilters] = useState<Filters>(emptyFilters());

  const value: FilterContextValue = {
    filters,
    setFilters,
    applyFilters: setFilters,
    clearFilters: () => setFilters(emptyFilters()),
  };

  return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>;
};

export const useFilters = (): FilterContextValue => {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error('useFilters must be used inside <FilterProvider>');
  return ctx;
};
