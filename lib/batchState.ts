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
 * Hook returning the current batch state. Re-checks on app foreground via
 * the caller (use AppState listener if needed).
 */
export const useBatchState = (refreshKey: number = 0): BatchState | null => {
  const [state, setState] = useState<BatchState | null>(null);
  useEffect(() => {
    void getBatchState().then(setState);
  }, [refreshKey]);
  return state;
};
