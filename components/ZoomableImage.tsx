import { Image } from 'expo-image';
import { useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

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
      const txv = (tx as unknown as { _value: number })._value;
      const tyv = (ty as unknown as { _value: number })._value;
      const sv = (scale as unknown as { _value: number })._value;
      // Swipe-down to dismiss when not zoomed in: if scale is ~1 and the
      // user dragged down >120px, close the lightbox.
      if (sv <= 1.05 && Math.abs(tyv) > 120) {
        onClose();
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
    <GestureDetector gesture={composed}>
      <View style={styles.container}>
        <Animated.View
          style={{
            width: '100%',
            height: '100%',
            transform: [{ translateX: tx }, { translateY: ty }, { scale }],
          }}
        >
          <Image
            source={{ uri }}
            style={styles.image}
            contentFit="contain"
          />
        </Animated.View>
      </View>
    </GestureDetector>
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
});

