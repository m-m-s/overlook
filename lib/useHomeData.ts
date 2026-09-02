import { useCallback, useEffect, useMemo, useState } from 'react';
import { getQueuedIds } from './analysisQueue';
import { useSession } from './auth';
import { useBatchState } from './batchState';
import { useDemoMode } from './demoMode';
import { effectiveUrgencyKey } from './urgency';
import { listPinnedFilters } from './savedFilters';
import { fetchScreenshots } from './screenshots';
import type { SavedFilter } from './savedFilters';
import type { LocalScreenshot } from './uploads';

const URGENT_KEYS = new Set(['overdue', 'today', 'expires_soon', 'this_week']);

export const itemCategories = (it: LocalScreenshot): string[] =>
  it.categories && it.categories.length > 0
    ? it.categories
    : it.category
      ? [it.category]
      : [];

export const useHomeData = () => {
  const { session } = useSession();
  const [demoOn] = useDemoMode();
  const [items, setItems] = useState<LocalScreenshot[]>([]);
  const [queuedIds, setQueuedIds] = useState<Set<string>>(new Set());
  const [pinnedFilters, setPinnedFilters] = useState<SavedFilter[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [batchRefreshKey, setBatchRefreshKey] = useState(0);
  const batchState = useBatchState(batchRefreshKey);

  const loadItems = useCallback(async () => {
    if (!session) return;
    const [rows, pinned, queued] = await Promise.all([
      fetchScreenshots(),
      listPinnedFilters(),
      getQueuedIds(),
    ]);
    setItems(rows);
    setPinnedFilters(pinned);
    setQueuedIds(queued);
    setLoaded(true);
  }, [session]);

  useEffect(() => {
    void loadItems();
  }, [loadItems, demoOn]);

  useEffect(() => {
    const active = batchState && batchState.processed < batchState.total;
    if (!active) return;
    const id = setInterval(() => { void loadItems(); }, 4000);
    return () => clearInterval(id);
  }, [batchState, loadItems]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadItems();
      setBatchRefreshKey((k) => k + 1);
    } finally {
      setRefreshing(false);
    }
  };

  const urgent = useMemo(
    () => items.filter((it) => { const k = effectiveUrgencyKey(it); return !!k && URGENT_KEYS.has(k); }),
    [items],
  );
  const whatsNext = useMemo(
    () => items.filter((it) => { const k = effectiveUrgencyKey(it); return k === 'this_month' || k === 'this_season'; }),
    [items],
  );
  const recent = useMemo(() => items.slice(0, 24), [items]);
  const untagged = useMemo(
    () => items.filter((it) => itemCategories(it).length === 0),
    [items],
  );

  return {
    session, items, setItems, queuedIds, pinnedFilters, setPinnedFilters,
    refreshing, loaded, loadItems, onRefresh, batchState,
    urgent, whatsNext, recent, untagged,
  };
};
