import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

const KEY = 'overlook.batch_state';

export type BatchState = {
  total: number;
  processed: number;
  startedAt: number; // epoch ms
};

/** Persist current batch progress so a banner can offer to resume. */
export const setBatchState = async (state: BatchState | null): Promise<void> => {
  if (!state) {
    await AsyncStorage.removeItem(KEY).catch(() => {});
    return;
  }
  await AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => {});
};

export const getBatchState = async (): Promise<BatchState | null> => {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BatchState;
    if (typeof parsed.total !== 'number' || typeof parsed.processed !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
};

/**
 * Hook returning the current batch state. Polls every 2s while a batch is
 * active so the home banner shows live progress when the user navigates
 * back from the processing screen.
 */
export const useBatchState = (refreshKey: number = 0): BatchState | null => {
  const [state, setState] = useState<BatchState | null>(null);
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      const next = await getBatchState();
      if (!cancelled) setState(next);
    };
    void tick();
    const id = setInterval(() => {
      void tick();
    }, 2000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [refreshKey]);
  return state;
};
