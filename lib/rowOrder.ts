import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

const KEY = 'overlook.row_order';

/**
 * User-set order of auto-surfaced category rows on home. Categories not in
 * this array fall back to count-sort behind the user's order.
 */
export const useRowOrder = () => {
  const [order, setOrder] = useState<string[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => {
      if (v) {
        try {
          const parsed = JSON.parse(v) as string[];
          if (Array.isArray(parsed)) setOrder(parsed);
        } catch {
          // noop
        }
      }
    });
  }, []);

  const persist = (next: string[]) => {
    setOrder(next);
    AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
  };

  /** Move the named entry up by one, persisting the new order. */
  const moveUp = (name: string, allKnown: string[]) => {
    const merged = mergeWithDefaults(order, allKnown);
    const idx = merged.indexOf(name);
    if (idx <= 0) return;
    const next = [...merged];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    persist(next);
  };

  const moveDown = (name: string, allKnown: string[]) => {
    const merged = mergeWithDefaults(order, allKnown);
    const idx = merged.indexOf(name);
    if (idx === -1 || idx >= merged.length - 1) return;
    const next = [...merged];
    [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
    persist(next);
  };

  return { order, moveUp, moveDown };
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
