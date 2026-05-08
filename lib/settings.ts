import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

/**
 * Settings persisted to AsyncStorage. Each setting has its own key for
 * flexibility (so reading one doesn't deserialize the whole bag).
 */

const KEYS = {
  hapticsEnabled: 'overlook.settings.haptics',
  showTips: 'overlook.settings.showTips',
  theme: 'overlook.settings.theme',
  screenshotNotify: 'overlook.settings.screenshotNotify',
  onboardingComplete: 'overlook.settings.onboardingComplete',
} as const;

/** First-launch onboarding flag. Marked true after the user completes the
 *  onboarding flow once. Settings has a "reset onboarding" link that
 *  flips this back so the flow plays again. */
export const useOnboardingComplete = () => useBoolSetting(KEYS.onboardingComplete, false);
export const isOnboardingComplete = async (): Promise<boolean> => {
  const v = await AsyncStorage.getItem(KEYS.onboardingComplete);
  return v === '1';
};
export const markOnboardingComplete = async (): Promise<void> => {
  await AsyncStorage.setItem(KEYS.onboardingComplete, '1');
};
export const resetOnboarding = async (): Promise<void> => {
  await AsyncStorage.removeItem(KEYS.onboardingComplete);
};

// Theme keys = full visual presets (palette + font set + status/urgency
// hue set). Adding a new theme just means a new key here + an entry in
// lib/themeContext. Accessible variants override the warm status/urgency
// palette with a colour-blind safe one (Wong, Nature 2011).
export type ThemeChoice =
  | 'editorial-light'
  | 'editorial-dark'
  | 'modern-light'
  | 'modern-dark'
  | 'mono-light'
  | 'accessible-light'
  | 'accessible-dark'
  | 'system';

const VALID_THEMES: ThemeChoice[] = [
  'editorial-light',
  'editorial-dark',
  'modern-light',
  'modern-dark',
  'mono-light',
  'accessible-light',
  'accessible-dark',
  'system',
];

export const useThemeChoice = () => {
  const [theme, setTheme] = useState<ThemeChoice>('editorial-light');
  useEffect(() => {
    AsyncStorage.getItem(KEYS.theme).then((v) => {
      if (v && (VALID_THEMES as string[]).includes(v)) setTheme(v as ThemeChoice);
    });
  }, []);
  const update = (next: ThemeChoice) => {
    setTheme(next);
    AsyncStorage.setItem(KEYS.theme, next).catch(() => {});
  };
  return [theme, update] as const;
};

export const useBoolSetting = (key: string, defaultValue: boolean) => {
  const [value, setValue] = useState<boolean>(defaultValue);

  useEffect(() => {
    AsyncStorage.getItem(key).then((v) => {
      if (v !== null) setValue(v === '1');
    });
  }, [key]);

  const update = (next: boolean) => {
    setValue(next);
    AsyncStorage.setItem(key, next ? '1' : '0').catch(() => {});
  };

  return [value, update] as const;
};

// Haptics ON by default — long-press is a primary gesture in the app
// (multi-select, edit-mode, reorder), and the vibration is the main signal
// that something happened. User can toggle off in settings.
export const useHapticsEnabled = () => useBoolSetting(KEYS.hapticsEnabled, true);
export const useShowTips = () => useBoolSetting(KEYS.showTips, true);
export const useScreenshotNotify = () => useBoolSetting(KEYS.screenshotNotify, true);

export const isScreenshotNotifyEnabled = async (): Promise<boolean> => {
  const v = await AsyncStorage.getItem(KEYS.screenshotNotify);
  if (v === null) return true;
  return v === '1';
};

// One-shot getters (non-hook). For places that don't have hook access.
// Default true — only return false when the user has explicitly disabled.
export const isHapticsEnabled = async (): Promise<boolean> => {
  const v = await AsyncStorage.getItem(KEYS.hapticsEnabled);
  if (v === null) return true;
  return v === '1';
};
