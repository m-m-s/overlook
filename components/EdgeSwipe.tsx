import { useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

type Props = {
  /** Called on swipe right past the threshold from the left edge. */
  onOpen: () => void;
};

/**
 * Left-edge "open sidebar" affordance — swipe-only.
 *
 * Two race-conditions handled here:
 * 1) Tap leak from back-arrows in pushed screens — fixed by removing the
 *    Pressable; gesture-only.
 * 2) Android gesture-nav back (left-edge swipe). The system steals the
 *    gesture for navigation, but a trailing onEnd can still fire on home's
 *    Pan once the home re-focuses. We require a matching `onStart` to have
 *    fired on this gesture before honoring `onEnd` — that filters out the
 *    "phantom end" that arrives without a real start on this screen.
 */
export const EdgeSwipe = ({ onOpen }: Props) => {
  const startedRef = useRef(false);

  const pan = Gesture.Pan()
    .activeOffsetX(12)
    .failOffsetY([-15, 15])
    .runOnJS(true)
    .onStart(() => {
      startedRef.current = true;
    })
    .onEnd((e) => {
      const started = startedRef.current;
      startedRef.current = false;
      if (!started) return;
      if (e.translationX > 50) onOpen();
    });

  return (
    <GestureDetector gesture={pan}>
      <View style={styles.strip} />
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  strip: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 24,
    zIndex: 50,
    elevation: 50,
  },
});
