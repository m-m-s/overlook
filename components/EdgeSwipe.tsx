import { Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { colors } from '@/lib/colors';

type Props = {
  /** Called when the user taps the visible hint bar OR swipes right past the threshold. */
  onOpen: () => void;
};

/**
 * Left-edge "open sidebar" affordance per spec:
 *  - Persistent 4px hint bar at 40% height, low opacity
 *  - Wider invisible strip (20px) catches taps and right-swipes
 *  - Pan rightward >50px triggers onOpen
 */
export const EdgeSwipe = ({ onOpen }: Props) => {
  const pan = Gesture.Pan()
    .activeOffsetX([0, 1000])
    .runOnJS(true)
    .onEnd((e) => {
      if (e.translationX > 50) onOpen();
    });

  return (
    <GestureDetector gesture={pan}>
      <View style={styles.strip} pointerEvents="box-only">
        <Pressable
          onPress={onOpen}
          accessibilityLabel="Open menu"
          style={styles.bar}
          hitSlop={{ left: 0, right: 8, top: 0, bottom: 0 }}
        />
      </View>
    </GestureDetector>
  );
};

const styles = StyleSheet.create({
  strip: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 20,
    zIndex: 5,
  },
  bar: {
    position: 'absolute',
    left: 0,
    top: '40%',
    width: 4,
    height: 60,
    backgroundColor: colors.inkMuted,
    opacity: 0.55,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
  },
});
