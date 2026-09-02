import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * First-launch hint tracking. Each hint shows at most once per install (per
 * spec: "Each hint triggers exactly once, tracked in local storage").
 *
 * Hints are gated on the user's "show tips" preference. Toggling it off in
 * Settings prevents new hints from firing; toggling on (and tapping "reset
 * all tip hints") restarts the discovery flow.
 */

const KEY = 'overlook.hints_seen';
const SHOW_TIPS_KEY = 'overlook.settings.showTips';

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

const showTipsEnabled = async (): Promise<boolean> => {
  // Default-on (showTips defaults to true in settings.ts).
  const v = await AsyncStorage.getItem(SHOW_TIPS_KEY);
  if (v === null) return true;
  return v === '1';
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
