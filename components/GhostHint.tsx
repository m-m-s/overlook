import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/lib/colors';
import { useReduceMotion } from '@/lib/a11y';

type Variant =
  | 'swipe-right' // home: ghost hand glides right from left edge
  | 'drag-up' //   bottom sheet: upward chevron pulses at the handle
  | 'triage-actions' // triage: three arrows (save right, skip left, delete up)
  | 'pinch-in' // grid: two ghost dots converge
  | 'tap'; //    upload review etc.

type Props = {
  visible: boolean;
  variant: Variant;
  /** Caption shown below / next to the gesture. Set null to hide. */
  label?: string | null;
  /** Called when the hint finishes its loop OR the user taps to dismiss. */
  onDismiss: () => void;
  /** Optional vertical offset (number = px, string = % of parent). */
  topOffset?: number | `${number}%`;
};

const HAND_SIZE = 32;

/**
 * Per CLAUDE.md "Discoverability & onboarding hints":
 *  - Translucent circle with motion trail (no realistic hand — abstract)
 *  - Small-caps caption matching the editorial label style
 *  - 1.5–2s total
 *  - Plays once per install, tracked via lib/hints
 *  - Respects reduce-motion (renders static caption)
 *
 * The component handles its own fade-in / play / fade-out cycle. Parent
 * tracks "seen" via lib/hints and toggles `visible`.
 */
export const GhostHint = ({ visible, variant, label, onDismiss, topOffset }: Props) => {
  const reduceMotion = useReduceMotion();
  const fade = useRef(new Animated.Value(0)).current;
  const tx = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const txB = useRef(new Animated.Value(0)).current;
  const tyB = useRef(new Animated.Value(0)).current;
  const txC = useRef(new Animated.Value(0)).current;
  const tyC = useRef(new Animated.Value(0)).current;

  // Track auto-dismiss so we don't pile up timers.
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!visible || dismissed) return;

    // Reduce-motion: just show the caption for a beat, then dismiss.
    if (reduceMotion) {
      Animated.timing(fade, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      const t = setTimeout(() => {
        setDismissed(true);
        onDismiss();
      }, 2200);
      return () => clearTimeout(t);
    }

    // Fade in, then play the variant-specific motion.
    Animated.timing(fade, { toValue: 1, duration: 240, useNativeDriver: true }).start();

    let stopped = false;
    const after = (delayMs: number, fn: () => void) => {
      const t = setTimeout(() => {
        if (!stopped) fn();
      }, delayMs);
      return t;
    };

    const finish = () => {
      Animated.timing(fade, { toValue: 0, duration: 240, useNativeDriver: true }).start(() => {
        setDismissed(true);
        onDismiss();
      });
    };

    let timers: ReturnType<typeof setTimeout>[] = [];

    if (variant === 'swipe-right') {
      // Home: glide rightward 110px to telegraph the sidebar reveal.
      Animated.sequence([
        Animated.delay(280),
        Animated.timing(tx, {
          toValue: 110,
          duration: 900,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.delay(400),
        Animated.timing(tx, {
          toValue: 0,
          duration: 280,
          useNativeDriver: true,
        }),
      ]).start();
      timers.push(after(2100, finish));
    } else if (variant === 'drag-up') {
      // Pulse upward twice near the handle.
      Animated.sequence([
        Animated.delay(200),
        Animated.timing(ty, { toValue: -18, duration: 280, useNativeDriver: true }),
        Animated.timing(ty, { toValue: 0, duration: 240, useNativeDriver: true }),
        Animated.timing(ty, { toValue: -18, duration: 280, useNativeDriver: true }),
        Animated.timing(ty, { toValue: 0, duration: 240, useNativeDriver: true }),
      ]).start();
      timers.push(after(2200, finish));
    } else if (variant === 'pinch-in') {
      // Two dots converge from outer points to center.
      txB.setValue(60);
      tyB.setValue(-30);
      txC.setValue(-60);
      tyC.setValue(30);
      Animated.parallel([
        Animated.timing(txB, { toValue: 0, duration: 900, useNativeDriver: true }),
        Animated.timing(tyB, { toValue: 0, duration: 900, useNativeDriver: true }),
        Animated.timing(txC, { toValue: 0, duration: 900, useNativeDriver: true }),
        Animated.timing(tyC, { toValue: 0, duration: 900, useNativeDriver: true }),
      ]).start();
      timers.push(after(2000, finish));
    } else if (variant === 'tap') {
      // Subtle scale pulse where the hand lands.
      Animated.sequence([
        Animated.delay(200),
        Animated.timing(scale, { toValue: 0.7, duration: 160, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1, duration: 240, useNativeDriver: true }),
      ]).start();
      timers.push(after(1700, finish));
    } else if (variant === 'triage-actions') {
      // Triage hint stays put until the user taps to dismiss — it's a lot
      // of info to land in 2s. The Pressable wrapping the overlay handles
      // the tap, so no auto-finish timer.
    }

    return () => {
      stopped = true;
      timers.forEach(clearTimeout);
    };
  }, [visible, variant, reduceMotion, fade, tx, ty, scale, txB, tyB, txC, tyC, dismissed, onDismiss]);

  if (!visible || dismissed) return null;

  const top = topOffset ?? '40%';

  return (
    <Pressable
      style={[StyleSheet.absoluteFill, { zIndex: 90, elevation: 90 }]}
      onPress={() => {
        setDismissed(true);
        onDismiss();
      }}
      pointerEvents="auto"
    >
      <Animated.View
        pointerEvents="none"
        style={[
          styles.layer,
          { top, opacity: fade },
        ]}
      >
        {variant === 'swipe-right' && (
          <View style={styles.swipeRow}>
            <Animated.View
              style={[styles.hand, { transform: [{ translateX: tx }] }]}
            />
            {label && <Text style={styles.label}>{label}</Text>}
          </View>
        )}
        {variant === 'drag-up' && (
          <View style={styles.center}>
            <Animated.View style={[styles.hand, { transform: [{ translateY: ty }] }]} />
            {label && <Text style={styles.labelCenter}>{label}</Text>}
          </View>
        )}
        {variant === 'pinch-in' && (
          <View style={styles.centerBig}>
            <View style={styles.pinchAnchor}>
              <Animated.View style={[styles.dot, { transform: [{ translateX: txB }, { translateY: tyB }] }]} />
              <Animated.View style={[styles.dot, { transform: [{ translateX: txC }, { translateY: tyC }] }]} />
            </View>
            {label && <Text style={styles.labelCenter}>{label}</Text>}
          </View>
        )}
        {variant === 'tap' && (
          <View style={styles.center}>
            <Animated.View style={[styles.hand, { transform: [{ scale }] }]} />
            {label && <Text style={styles.labelCenter}>{label}</Text>}
          </View>
        )}
        {variant === 'triage-actions' && (
          <View style={styles.triageWrap}>
            <Text style={styles.arrowLeft}>← skip</Text>
            <Text style={styles.arrowUp}>↑ delete</Text>
            <Text style={styles.arrowRight}>save →</Text>
            {label && <Text style={[styles.labelCenter, { marginTop: 18 }]}>{label}</Text>}
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  layer: { position: 'absolute', left: 0, right: 0 },
  swipeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    gap: 14,
  },
  center: { alignItems: 'center', gap: 12 },
  centerBig: { alignItems: 'center', gap: 18 },
  triageWrap: { alignItems: 'center', gap: 14 },
  pinchAnchor: { width: 80, height: 80, alignItems: 'center', justifyContent: 'center' },
  hand: {
    width: HAND_SIZE,
    height: HAND_SIZE,
    borderRadius: HAND_SIZE / 2,
    backgroundColor: colors.ink,
    opacity: 0.32,
  },
  dot: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.ink,
    opacity: 0.36,
  },
  label: {
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.ink,
    backgroundColor: colors.parchment,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  labelCenter: {
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.ink,
    backgroundColor: colors.parchment,
    paddingHorizontal: 10,
    paddingVertical: 4,
    textAlign: 'center',
  },
  arrowLeft: {
    fontSize: 12,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.ink,
    backgroundColor: colors.parchment,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  arrowRight: {
    fontSize: 12,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.ink,
    backgroundColor: colors.parchment,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-end',
  },
  arrowUp: {
    fontSize: 12,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.ink,
    backgroundColor: colors.parchment,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
});
