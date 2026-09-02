import { useState } from 'react';
import { warnHaptic } from './haptics';
import type { LocalScreenshot } from './uploads';

type SetItems = React.Dispatch<React.SetStateAction<LocalScreenshot[]>>;

export const useMultiSelect = (
  items: LocalScreenshot[],
  setItems: SetItems,
  undoableRemoveMany: (targets: LocalScreenshot[]) => void,
) => {
  const [multiSelectIds, setMultiSelectIds] = useState<Set<string>>(new Set());
  const inSelectMode = multiSelectIds.size > 0;

  const toggleMultiSelect = (id: string) => {
    setMultiSelectIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const exitMultiSelect = () => setMultiSelectIds(new Set());

  const onBulkApplied = (patch: Partial<LocalScreenshot>) => {
    setItems((prev) =>
      prev.map((it) => (multiSelectIds.has(it.id) ? { ...it, ...patch } : it)),
    );
    exitMultiSelect();
  };

  const onBulkDelete = () => {
    const targets = items.filter((it) => multiSelectIds.has(it.id));
    if (targets.length === 0) return;
    void warnHaptic();
    undoableRemoveMany(targets);
    exitMultiSelect();
  };

  return { multiSelectIds, inSelectMode, toggleMultiSelect, exitMultiSelect, onBulkApplied, onBulkDelete };
};
