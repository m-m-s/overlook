import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

const KEY = 'overlook.row_order';
const PIN_KEY = 'overlook.pinned_order';
const HIDDEN_KEY = 'overlook.row_hidden';

/**
 * User-set order of auto-surfaced category rows on home. Categories not in
 * this array fall back to count-sort behind the user's order.
 */
export const useRowOrder = () => useOrderHook(KEY);

/** Same pattern but for the user's pinned saved-filter rows. */
export const usePinOrder = () => useOrderHook(PIN_KEY);

const useOrderHook = (storageKey: string) => {
  const [order, setOrder] = useState<string[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(storageKey).then((v) => {
      if (v) {
        try {
          const parsed = JSON.parse(v) as string[];
          if (Array.isArray(parsed)) setOrder(parsed);
        } catch {
          // noop
        }
      }
    });
  }, [storageKey]);

  const persist = (next: string[]) => {
    setOrder(next);
    AsyncStorage.setItem(storageKey, JSON.stringify(next)).catch(() => {});
  };

  /** Replace the entire order — used by drag-and-drop reorder. */
  const replace = (next: string[]) => {
    persist(next);
  };

  return { order, replace };
};

/**
 * Hidden category rows on home. User taps an X in reorder mode to remove a
 * category row from the homepage (it no longer auto-surfaces). Tapping
 * "show hidden" restores any/all of them.
 */
export const useHiddenRows = () => {
  const [hidden, setHidden] = useState<string[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(HIDDEN_KEY).then((v) => {
      if (!v) return;
      try {
        const parsed = JSON.parse(v) as string[];
        if (Array.isArray(parsed)) setHidden(parsed);
      } catch {
        // noop
      }
    });
  }, []);

  const persist = (next: string[]) => {
    setHidden(next);
    AsyncStorage.setItem(HIDDEN_KEY, JSON.stringify(next)).catch(() => {});
  };

  const hide = (name: string) => {
    if (hidden.includes(name)) return;
    persist([...hidden, name]);
  };
  const clear = () => persist([]);

  return { hidden, hide, clear };
};

/** Merge user order with currently-known names. Anything in `allKnown` but
 *  missing from `userOrder` is appended in its incoming sort. Anything in
 *  `userOrder` not in `allKnown` is dropped (the row is gone). */
export const mergeWithDefaults = (userOrder: string[], allKnown: string[]): string[] => {
  const known = new Set(allKnown);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of userOrder) {
    if (known.has(name) && !seen.has(name)) {
      out.push(name);
      seen.add(name);
    }
  }
  for (const name of allKnown) {
    if (!seen.has(name)) {
      out.push(name);
      seen.add(name);
    }
  }
  return out;
};
