import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

const KEY = 'overlook.demo_mode';

/**
 * Tiny in-memory event bus so components flip into demo mode together
 * without a context provider. Each subscriber gets called when the flag changes.
 */
const listeners = new Set<(on: boolean) => void>();

export const isDemoMode = async (): Promise<boolean> => {
  try {
    const v = await AsyncStorage.getItem(KEY);
    return v === '1';
  } catch {
    return false;
  }
};

export const setDemoMode = async (on: boolean): Promise<void> => {
  try {
    if (on) await AsyncStorage.setItem(KEY, '1');
    else await AsyncStorage.removeItem(KEY);
  } catch {
    // best-effort
  }
  for (const l of listeners) l(on);
};

/** Hook returning the current demo flag + a setter. Reactive across screens. */
export const useDemoMode = (): [boolean, (on: boolean) => Promise<void>] => {
  const [on, setOn] = useState(false);

  useEffect(() => {
    void isDemoMode().then(setOn);
    const fn = (next: boolean) => setOn(next);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);

  return [on, setDemoMode];
};
