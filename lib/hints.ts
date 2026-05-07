import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * First-launch hint tracking. Each hint shows at most once per install (per
 * spec: "Each hint triggers exactly once, tracked in local storage").
 *
 * Reset all hints by clearing AsyncStorage or by exposing a "Show tips"
 * setting later.
 */

const KEY = 'overlook.hints_seen';

let cache: Record<string, true> | null = null;

const load = async (): Promise<Record<string, true>> => {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as Record<string, true>) : {};
  } catch {
    cache = {};
  }
  return cache;
};

const save = async (next: Record<string, true>): Promise<void> => {
  cache = next;
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // best effort
  }
};

export const wasHintSeen = async (name: string): Promise<boolean> => {
  const seen = await load();
  return Boolean(seen[name]);
};

export const markHintSeen = async (name: string): Promise<void> => {
  const seen = await load();
  if (seen[name]) return;
  await save({ ...seen, [name]: true });
};

export const resetAllHints = async (): Promise<void> => {
  await save({});
};
