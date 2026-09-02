import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';

export const useSidebarAnimation = (open: boolean, sidebarWidth: number, reduceMotion: boolean) => {
  const translateX = useRef(new Animated.Value(-sidebarWidth)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  // Keep closed-position offset in sync when window width changes (rotation/foldable).
  useEffect(() => {
    if (!open) translateX.setValue(-sidebarWidth);
  }, [sidebarWidth, open, translateX]);

  useEffect(() => {
    if (reduceMotion) {
      translateX.setValue(open ? 0 : -sidebarWidth);
      backdropOpacity.setValue(open ? 0.45 : 0);
      return;
    }
    Animated.parallel([
      Animated.spring(translateX, {
        toValue: open ? 0 : -sidebarWidth,
        damping: 26, stiffness: 220,
        useNativeDriver: true, overshootClamping: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: open ? 0.45 : 0,
        duration: 200, useNativeDriver: true,
      }),
    ]).start();
  }, [open, translateX, backdropOpacity, reduceMotion, sidebarWidth]);

  return { translateX, backdropOpacity };
};
