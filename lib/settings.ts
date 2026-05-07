import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

/**
 * Settings persisted to AsyncStorage. Each setting has its own key for
 * flexibility (so reading one doesn't deserialize the whole bag).
 */

const KEYS = {
  hapticsEnabled: 'overlook.settings.haptics',
  showTips: 'overlook.settings.showTips',
} as const;

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

export const useHapticsEnabled = () => useBoolSetting(KEYS.hapticsEnabled, false);
export const useShowTips = () => useBoolSetting(KEYS.showTips, true);

// One-shot getters (non-hook). For places that don't have hook access.
export const isHapticsEnabled = async (): Promise<boolean> => {
  const v = await AsyncStorage.getItem(KEYS.hapticsEnabled);
  return v === '1';
};
