import { useMemo, useState } from 'react';
import { LayoutAnimation } from 'react-native';
import { applyFilters } from './filters';
import { mergeWithDefaults, useHiddenRows, usePinOrder, useRowOrder } from './rowOrder';
import { togglePinned, type SavedFilter } from './savedFilters';
import type { LocalScreenshot } from './uploads';
import { itemCategories } from './useHomeData';

const reorderAnim = {
  duration: 260,
  create: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
  update: { type: LayoutAnimation.Types.easeInEaseOut },
  delete: { type: LayoutAnimation.Types.easeInEaseOut, property: LayoutAnimation.Properties.opacity },
};

export type ReorderItem =
  | { kind: 'cat'; id: string; row: { category: string; items: LocalScreenshot[] } }
  | { kind: 'pin'; id: string; pf: SavedFilter };

export const useHomeReorder = (
  items: LocalScreenshot[],
  pinnedFilters: SavedFilter[],
  setPinnedFilters: React.Dispatch<React.SetStateAction<SavedFilter[]>>,
) => {
  const [reorderMode, setReorderMode] = useState(false);
  const { order: rowOrder, replace: replaceRowOrder } = useRowOrder();
  const { order: pinOrder, replace: replacePinOrder } = usePinOrder();
  const { hidden: hiddenRows, hide: hideRow, clear: clearHidden } = useHiddenRows();

  const enterReorder = () => { LayoutAnimation.configureNext(reorderAnim); setReorderMode(true); };
  const exitReorder = () => { LayoutAnimation.configureNext(reorderAnim); setReorderMode(false); };

  const categoryRows = useMemo(() => {
    const counts = new Map<string, number>();
    for (const it of items) {
      for (const cat of itemCategories(it)) {
        counts.set(cat, (counts.get(cat) ?? 0) + 1);
      }
    }
    const hiddenSet = new Set(hiddenRows);
    const top5 = Array.from(counts.entries())
      .filter(([cat]) => !hiddenSet.has(cat))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([cat]) => cat);
    const ordered = mergeWithDefaults(rowOrder, top5).filter((cat) => !hiddenSet.has(cat));
    return ordered.map((cat) => ({
      category: cat,
      items: items.filter((it) => itemCategories(it).includes(cat)),
    }));
  }, [items, rowOrder, hiddenRows]);

  const orderedPinnedFilters = useMemo(() => {
    const ids = pinnedFilters.map((p) => p.id);
    const order = mergeWithDefaults(pinOrder, ids);
    const byId = new Map(pinnedFilters.map((p) => [p.id, p]));
    return order.map((id) => byId.get(id)).filter((p): p is SavedFilter => Boolean(p));
  }, [pinnedFilters, pinOrder]);

  const mergedReorderItems = useMemo<ReorderItem[]>(
    () => [
      ...categoryRows.map((row): ReorderItem => ({ kind: 'cat', id: row.category, row })),
      ...orderedPinnedFilters.map((pf): ReorderItem => ({ kind: 'pin', id: pf.id, pf })),
    ],
    [categoryRows, orderedPinnedFilters],
  );

  const onMergedReorderEnd = (data: ReorderItem[]) => {
    replaceRowOrder(data.filter((i) => i.kind === 'cat').map((i) => i.id));
    replacePinOrder(data.filter((i) => i.kind === 'pin').map((i) => i.id));
  };

  const hideCategory = (cat: string) => hideRow(cat);

  const unpinFilter = async (id: string) => {
    await togglePinned(id, false);
    setPinnedFilters((prev) => prev.filter((p) => p.id !== id));
  };

  return {
    reorderMode, enterReorder, exitReorder,
    rowOrder, pinOrder, hiddenRows, hideCategory, clearHidden,
    categoryRows, orderedPinnedFilters, mergedReorderItems,
    onMergedReorderEnd, applyFilters,
    unpinFilter,
  };
};
