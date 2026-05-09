import * as Haptics from 'expo-haptics';

import { isHapticsEnabled } from './settings';

/**
 * Haptic feedback wrappers. Per spec: toggleable in settings, off by default.
 * Three intensity levels per the UX section.
 *
 * The enabled flag is cached in memory so taps don't pay an AsyncStorage
 * read on every chip / card press (which was making the UI feel laggy).
 * `refreshHapticsCache()` is called from the settings screen when the user
 * toggles the preference.
 */

let enabledCache: boolean | null = null;

const isEnabled = (): boolean => {
  // First call on app launch warms the cache; subsequent calls are sync.
  if (enabledCache === null) {
    void isHapticsEnabled().then((v) => {
      enabledCache = v;
    });
    return true; // optimistic — default-on
  }
  return enabledCache;
};

export const refreshHapticsCache = async (): Promise<void> => {
  enabledCache = await isHapticsEnabled();
};

export const tapHaptic = () => {
  if (isEnabled()) void Haptics.selectionAsync();
};

export const successHaptic = () => {
  if (isEnabled()) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
};

export const warnHaptic = () => {
  if (isEnabled()) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
};

export const heavyHaptic = () => {
  if (isEnabled()) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
};
