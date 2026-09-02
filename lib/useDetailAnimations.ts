import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Animated, Dimensions } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

const SCREEN_WIDTH = Dimensions.get('window').width;

export const useDetailAnimations = (
  itemId: string,
  imageMaxHeight: number,
  onNext: (() => void) | undefined,
  onPrev: (() => void) | undefined,
  onPinchStart?: () => void,
) => {
  // Parallax scroll — runs on the JS thread via Animated (not Reanimated)
  // so it can drive the native Image directly without a worklet bridge.
  const scrollY = useRef(new Animated.Value(0)).current;
  const imageTranslateY = scrollY.interpolate({
    inputRange: [0, imageMaxHeight || 1],
    outputRange: [0, -imageMaxHeight],
    extrapolate: 'clamp',
  });
  const imageScale = scrollY.interpolate({
    inputRange: [0, imageMaxHeight || 1],
    outputRange: [1, 0.92],
    extrapolate: 'clamp',
  });
  const imageOpacity = scrollY.interpolate({
    inputRange: [0, imageMaxHeight * 0.7 || 1, imageMaxHeight || 1],
    outputRange: [1, 1, 0.6],
    extrapolate: 'clamp',
  });
  const onScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    { useNativeDriver: false },
  );

  // Card-wide swipe — translateX on Reanimated shared value for 60fps off-thread.
  const translateX = useSharedValue(0);
  const mountOpacity = useSharedValue(0);

  const cardTranslateStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: mountOpacity.value,
  }));

  useEffect(() => {
    translateX.value = 0;
    mountOpacity.value = withTiming(1, { duration: 280 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  const navigateNext = useCallback(() => onNext?.(), [onNext]);
  const navigatePrev = useCallback(() => onPrev?.(), [onPrev]);

  const cardSwipeGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-20, 20])
        .failOffsetY([-10, 10])
        .onUpdate((e) => { translateX.value = e.translationX; })
        .onEnd((e) => {
          const flick = Math.abs(e.velocityX) > 500;
          const goNext = (e.translationX < -40 || (flick && e.translationX < -15)) && onNext != null;
          const goPrev = (e.translationX > 40 || (flick && e.translationX > 15)) && onPrev != null;
          if (goNext) {
            translateX.value = withTiming(-SCREEN_WIDTH, { duration: 200 }, () => { runOnJS(navigateNext)(); });
          } else if (goPrev) {
            translateX.value = withTiming(SCREEN_WIDTH, { duration: 200 }, () => { runOnJS(navigatePrev)(); });
          } else {
            translateX.value = withSpring(0, { damping: 20, stiffness: 200 });
          }
        }),
    [onNext, onPrev, navigateNext, navigatePrev, translateX],
  );

  const pinchToZoomGesture = useMemo(
    () => Gesture.Pinch().runOnJS(true).onStart(() => onPinchStart?.()),
    [onPinchStart],
  );

  return {
    scrollY, imageTranslateY, imageScale, imageOpacity, onScroll,
    cardTranslateStyle, cardSwipeGesture, pinchToZoomGesture,
  };
};
