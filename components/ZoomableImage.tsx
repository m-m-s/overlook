import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRef } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  uri: string;
  onClose: () => void;
};

/**
 * Pinch-to-zoom + pan lightbox for the screenshot detail. Uses gesture-
 * handler's Pan + Pinch composed simultaneously, driving an Animated.Value
 * with useNativeDriver: true. A short tap (no pan, no pinch) closes the
 * modal — that's tracked manually via a "moved" flag.
 *
 * Avoids reanimated worklets so this is safe to use anywhere — the
 * BottomSheet/reanimated worklet conflict that bit us elsewhere doesn't
 * apply here because we're not inside a sheet's gesture context.
 */
export const ZoomableImage = ({ uri, onClose }: Props) => {
  const insets = useSafeAreaInsets();
  const scale = useRef(new Animated.Value(1)).current;
  const tx = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(0)).current;

  // We accumulate a "saved" base value across gestures so each new gesture
  // continues from where the previous one ended (rather than resetting).
  const savedScale = useRef(1);
  const savedTx = useRef(0);
  const savedTy = useRef(0);
  const movedRef = useRef(false);

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      const next = savedScale.current * e.scale;
      // Clamp scale between 1 and 5 so the image can't shrink below natural
      // size or zoom further than ~5×.
      const clamped = Math.max(1, Math.min(5, next));
      scale.setValue(clamped);
      movedRef.current = true;
    })
    .onEnd(() => {
      // Read the latest internal value and persist it for the next gesture.
      const v = (scale as unknown as { _value: number })._value;
      savedScale.current = v;
      // If we're back at 1× after a pinch, snap pan to 0 too (animated
      // spring) so the image recenters cleanly.
      if (v <= 1.001) {
        Animated.spring(tx, { toValue: 0, useNativeDriver: true }).start();
        Animated.spring(ty, { toValue: 0, useNativeDriver: true }).start();
        savedTx.current = 0;
        savedTy.current = 0;
      }
    });

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      tx.setValue(savedTx.current + e.translationX);
      ty.setValue(savedTy.current + e.translationY);
      movedRef.current = true;
    })
    .onEnd(() => {
      // Persist current pan position for the next gesture. Pan-to-dismiss
      // was removed: invoking onClose() while a native-driven spring was
      // pending caused a crash inside a Modal on Android. Tap-to-close
      // and the X button cover dismissal.
      const txv = (tx as unknown as { _value: number })._value;
      const tyv = (ty as unknown as { _value: number })._value;
      const sv = (scale as unknown as { _value: number })._value;
      if (sv <= 1.05) {
        Animated.spring(tx, { toValue: 0, useNativeDriver: true }).start();
        Animated.spring(ty, { toValue: 0, useNativeDriver: true }).start();
        savedTx.current = 0;
        savedTy.current = 0;
        return;
      }
      savedTx.current = txv;
      savedTy.current = tyv;
    });

  const tap = Gesture.Tap()
    .maxDuration(250)
    .onEnd(() => {
      if (!movedRef.current) onClose();
      movedRef.current = false;
    });

  // Pan + Pinch run simultaneously so users can zoom with two fingers and
  // pan in the same gesture. Tap is exclusive — fires only when no
  // movement happened.
  const composed = Gesture.Race(tap, Gesture.Simultaneous(pinch, pan));

  return (
    <View style={styles.container}>
      <GestureDetector gesture={composed}>
        <Animated.View
          style={{
            width: '100%',
            height: '100%',
            transform: [{ translateX: tx }, { translateY: ty }, { scale }],
          }}
        >
          <Image source={{ uri }} style={styles.image} contentFit="contain" />
        </Animated.View>
      </GestureDetector>
      {/* Close button — explicit affordance on top of the gesture surface.
          Tapping the image area (not the X) still closes via the tap gesture. */}
      <Pressable
        onPress={onClose}
        hitSlop={12}
        style={[styles.closeBtn, { top: insets.top + 12 }]}
        accessibilityLabel="Close fullscreen image"
      >
        <Ionicons name="close" size={22} color="#fff" />
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: { width: '100%', height: '100%' },
  closeBtn: {
    position: 'absolute',
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

