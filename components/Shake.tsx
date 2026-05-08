import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';

import { useReduceMotion } from '@/lib/a11y';

type Props = {
  /** When this flips from false → true, a single shake plays. */
  trigger: boolean;
  /** How loud — distance in px. Default 4. */
  amount?: number;
  children: React.ReactNode;
  style?: Animated.WithAnimatedValue<object>;
};

/**
 * Per CLAUDE.md "Edit mode visual": "chips do a subtle shake animation"
 * when a section enters edit mode (long-press). Plays a single
 * left-right-left wobble; respects reduce-motion (renders static).
 */
export const Shake = ({ trigger, amount = 4, children, style }: Props) => {
  const tx = useRef(new Animated.Value(0)).current;
  const reduceMotion = useReduceMotion();
  const prev = useRef(false);

  useEffect(() => {
    if (reduceMotion) return;
    // Only fire on rising edge (false → true) so toggling off doesn't shake.
    if (trigger && !prev.current) {
      Animated.sequence([
        Animated.timing(tx, { toValue: -amount, duration: 50, useNativeDriver: true }),
        Animated.timing(tx, { toValue: amount, duration: 60, useNativeDriver: true }),
        Animated.timing(tx, { toValue: -amount * 0.5, duration: 60, useNativeDriver: true }),
        Animated.timing(tx, { toValue: 0, duration: 60, useNativeDriver: true }),
      ]).start();
    }
    prev.current = trigger;
  }, [trigger, amount, tx, reduceMotion]);

  return (
    <Animated.View style={[style, { transform: [{ translateX: tx }] }]}>
      {children}
    </Animated.View>
  );
};
