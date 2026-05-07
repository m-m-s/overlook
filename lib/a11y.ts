import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Hook returning whether the OS reduce-motion setting is enabled. Used to
 * skip / shorten animations per spec ("Respects Android reduce motion
 * accessibility setting").
 */
export const useReduceMotion = (): boolean => {
  const [reduce, setReduce] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (mounted) setReduce(v);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => {
      if (mounted) setReduce(v);
    });
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  return reduce;
};

/** Default animation duration; 0 when reduce-motion is enabled. */
export const animDuration = (defaultMs: number, reduceMotion: boolean): number =>
  reduceMotion ? 0 : defaultMs;
