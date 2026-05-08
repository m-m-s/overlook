import { Ionicons } from '@expo/vector-icons';
import * as MediaLibrary from 'expo-media-library';
import * as Notifications from 'expo-notifications';
import { useMemo, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Iris } from './Iris';
import type { FontSet, Palette } from '@/lib/colors';
import { successHaptic, tapHaptic } from '@/lib/haptics';
import { markOnboardingComplete } from '@/lib/settings';
import { useColors, useFonts } from '@/lib/themeContext';

type Step =
  | 'welcome'
  | 'privacy'
  | 'photos'
  | 'notify'
  | 'ready';

const STEP_ORDER: Step[] = ['welcome', 'privacy', 'photos', 'notify', 'ready'];

type Props = {
  /** Called when the user finishes (or skips through) the flow. */
  onComplete: () => void;
};

/**
 * First-launch onboarding flow.
 *
 * Five short steps — welcome → privacy explainer → photos permission
 * → notifications permission (optional) → ready CTA. Each step renders
 * a single-screen editorial card with the iris wordmark up top, a
 * Playfair heading, body copy, and a primary action.
 *
 * The user can Skip to bypass permissions; we still mark onboarding
 * complete because the spec says "must be opened once + battery
 * optimization disabled — handle in onboarding". The actual permission
 * checks happen at use-site (the watcher / upload flow gates on real
 * runtime permissions, not on onboarding state).
 */
export const Onboarding = ({ onComplete }: Props) => {
  const c = useColors();
  const f = useFonts();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(c, f), [c, f]);

  const [stepIdx, setStepIdx] = useState(0);
  const step = STEP_ORDER[stepIdx];
  const fade = useMemo(() => new Animated.Value(1), []);

  const goNext = () => {
    tapHaptic();
    if (stepIdx >= STEP_ORDER.length - 1) {
      finish();
      return;
    }
    Animated.sequence([
      Animated.timing(fade, { toValue: 0, duration: 140, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
    setTimeout(() => setStepIdx((i) => i + 1), 140);
  };

  const goBack = () => {
    if (stepIdx === 0) return;
    tapHaptic();
    Animated.sequence([
      Animated.timing(fade, { toValue: 0, duration: 140, useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }),
    ]).start();
    setTimeout(() => setStepIdx((i) => i - 1), 140);
  };

  const finish = () => {
    successHaptic();
    void markOnboardingComplete();
    onComplete();
  };

  const requestPhotos = async () => {
    tapHaptic();
    try {
      await MediaLibrary.requestPermissionsAsync();
    } catch {
      // best-effort — even if it fails the user can grant later from
      // system settings; we don't block forward progress.
    }
    goNext();
  };

  const requestNotify = async () => {
    tapHaptic();
    try {
      await Notifications.requestPermissionsAsync();
    } catch {
      // ditto.
    }
    goNext();
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.brandRow}>
        <Iris level={3} size={26} color={c.ink} />
        <Text style={styles.brand}>Overlook</Text>
      </View>

      <Animated.View style={[styles.body, { opacity: fade }]}>
        {step === 'welcome' && (
          <>
            <Iris level={3} size={84} color={c.ink} />
            <Text style={styles.title}>A quiet second brain for screenshots.</Text>
            <Text style={styles.subtitle}>
              Tag, filter, and find the thousands of screenshots already on your phone.
            </Text>
          </>
        )}

        {step === 'privacy' && (
          <>
            <Ionicons name="lock-closed-outline" size={56} color={c.ink} />
            <Text style={styles.title}>Local-first by default.</Text>
            <Text style={styles.body_text}>
              Your screenshots stay on your phone. We only store text metadata — tags, urgencies, notes — never the images themselves.
            </Text>
            <Text style={styles.body_text}>
              When you tap <Text style={{ fontFamily: f.displayMedium }}>Analyze</Text>, the image is sent once to Claude to be tagged, then discarded. Documents and messages stay local-only by default.
            </Text>
          </>
        )}

        {step === 'photos' && (
          <>
            <Ionicons name="image-outline" size={56} color={c.ink} />
            <Text style={styles.title}>Access to your screenshots.</Text>
            <Text style={styles.body_text}>
              We need read access to your Photos so Overlook can import the screenshots you've already saved and detect new ones as they appear.
            </Text>
            <Text style={styles.body_text}>
              You can grant full access or select specific images.
            </Text>
          </>
        )}

        {step === 'notify' && (
          <>
            <Ionicons name="notifications-outline" size={56} color={c.ink} />
            <Text style={styles.title}>Catch screenshots as you take them.</Text>
            <Text style={styles.body_text}>
              When you take a screenshot in any app, Overlook can ping you so you can tag it while it's fresh in your mind.
            </Text>
            <Text style={styles.body_text}>
              Optional — you can change this in Settings any time.
            </Text>
          </>
        )}

        {step === 'ready' && (
          <>
            <Iris level={3} size={84} color={c.ink} filled />
            <Text style={styles.title}>You're set.</Text>
            <Text style={styles.subtitle}>
              Start by importing your existing screenshots, or just take one and Overlook will catch it.
            </Text>
          </>
        )}
      </Animated.View>

      {/* Step dots */}
      <View style={styles.dots}>
        {STEP_ORDER.map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i === stepIdx && { backgroundColor: c.ink, width: 18 },
            ]}
          />
        ))}
      </View>

      {/* Action row */}
      <View style={styles.actions}>
        {stepIdx > 0 ? (
          <Pressable onPress={goBack} hitSlop={8} style={styles.linkBtn}>
            <Text style={styles.linkText}>Back</Text>
          </Pressable>
        ) : (
          <View style={{ flex: 1 }} />
        )}
        <View style={{ flex: 1 }} />
        {step === 'photos' ? (
          <Pressable onPress={requestPhotos} style={styles.primaryBtn}>
            <Text style={styles.primaryText}>Allow access</Text>
          </Pressable>
        ) : step === 'notify' ? (
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <Pressable onPress={goNext} hitSlop={8} style={styles.linkBtn}>
              <Text style={styles.linkText}>Skip</Text>
            </Pressable>
            <Pressable onPress={requestNotify} style={styles.primaryBtn}>
              <Text style={styles.primaryText}>Turn on</Text>
            </Pressable>
          </View>
        ) : step === 'ready' ? (
          <Pressable onPress={finish} style={styles.primaryBtn}>
            <Text style={styles.primaryText}>Open Overlook</Text>
          </Pressable>
        ) : (
          <Pressable onPress={goNext} style={styles.primaryBtn}>
            <Text style={styles.primaryText}>{step === 'welcome' ? 'Begin' : 'Next'}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
};

const makeStyles = (c: Palette, f: FontSet) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: c.parchment,
      paddingHorizontal: 32,
    },
    brandRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 12,
    },
    brand: {
      fontFamily: f.displayMedium,
      fontSize: 22,
      color: c.ink,
      letterSpacing: -0.4,
    },
    body: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 18,
    },
    title: {
      fontFamily: f.displayMedium,
      fontSize: 32,
      lineHeight: 38,
      color: c.ink,
      textAlign: 'center',
      letterSpacing: -0.5,
      marginTop: 12,
    },
    subtitle: {
      fontFamily: f.italic,
      fontSize: 16,
      lineHeight: 24,
      color: c.inkSoft,
      textAlign: 'center',
    },
    body_text: {
      fontFamily: f.body,
      fontSize: 15,
      lineHeight: 22,
      color: c.inkSoft,
      textAlign: 'center',
    },
    dots: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: 6,
      marginBottom: 16,
    },
    dot: {
      width: 6,
      height: 6,
      borderRadius: 3,
      backgroundColor: c.divider,
    },
    actions: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    linkBtn: {
      paddingVertical: 12,
      paddingHorizontal: 4,
    },
    linkText: {
      fontSize: 13,
      letterSpacing: 1.4,
      textTransform: 'uppercase',
      color: c.inkMuted,
    },
    primaryBtn: {
      backgroundColor: c.ink,
      paddingVertical: 14,
      paddingHorizontal: 22,
      borderRadius: 4,
    },
    primaryText: {
      color: c.parchment,
      fontSize: 13,
      letterSpacing: 1.3,
      textTransform: 'uppercase',
      fontWeight: '600',
    },
  });
