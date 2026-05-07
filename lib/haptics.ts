import * as Haptics from 'expo-haptics';

import { isHapticsEnabled } from './settings';

/**
 * Haptic feedback wrappers. Per spec: toggleable in settings, off by default.
 * Three intensity levels per the UX section.
 */

export const tapHaptic = async () => {
  if (await isHapticsEnabled()) {
    void Haptics.selectionAsync();
  }
};

export const successHaptic = async () => {
  if (await isHapticsEnabled()) {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }
};

export const warnHaptic = async () => {
  if (await isHapticsEnabled()) {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  }
};

export const heavyHaptic = async () => {
  if (await isHapticsEnabled()) {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  }
};
