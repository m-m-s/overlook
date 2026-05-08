import { Ionicons } from '@expo/vector-icons';
import * as MediaLibrary from 'expo-media-library';
import * as Notifications from 'expo-notifications';
import { useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Iris } from './Iris';
import type { FontSet, Palette } from '@/lib/colors';
import { successHaptic, tapHaptic } from '@/lib/haptics';
import { markOnboardingComplete } from '@/lib/settings';
import { useColors, useFonts } from '@/lib/themeContext';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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
 * Five paged screens (welcome → privacy → photos permission → notifications
 * → ready). Implemented as a horizontal paging ScrollView so the user can
 * swipe between pages, and the bottom dots actually correspond to a real
 * paged motion. The action row at the bottom drives `scrollTo` on Next/Back
 * for users who'd rather tap than swipe.
 */
export const Onboarding = ({ onComplete }: Props) => {
  const c = useColors();
  const f = useFonts();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(c, f), [c, f]);

  const [stepIdx, setStepIdx] = useState(0);
  const step = STEP_ORDER[stepIdx];
  const scrollRef = useRef<ScrollView>(null);

  const scrollTo = (idx: number) => {
    scrollRef.current?.scrollTo({ x: idx * SCREEN_WIDTH, animated: true });
  };

  const goNext = () => {
    tapHaptic();
    if (stepIdx >= STEP_ORDER.length - 1) {
      finish();
      return;
    }
    scrollTo(stepIdx + 1);
  };

  const goBack = () => {
    if (stepIdx === 0) return;
    tapHaptic();
    scrollTo(stepIdx - 1);
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

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const next = Math.round(x / SCREEN_WIDTH);
    if (next !== stepIdx) setStepIdx(next);
  };

  const pages: { key: Step; render: () => React.ReactNode }[] = [
    {
      key: 'welcome',
      render: () => (
        <>
          <Iris level={3} size={84} color={c.ink} />
          <Text style={styles.title}>A quiet second brain for screenshots.</Text>
          <Text style={styles.subtitle}>
            Tag, filter, and find the thousands of screenshots already on your phone.
          </Text>
        </>
      ),
    },
    {
      key: 'privacy',
      render: () => (
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
      ),
    },
    {
      key: 'photos',
      render: () => (
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
      ),
    },
    {
      key: 'notify',
      render: () => (
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
      ),
    },
    {
      key: 'ready',
      render: () => (
        <>
          <Iris level={3} size={84} color={c.ink} filled />
          <Text style={styles.title}>You're set.</Text>
          <Text style={styles.subtitle}>
            Start by importing your existing screenshots, or just take one and Overlook will catch it.
          </Text>
        </>
      ),
    },
  ];

  return (
    <View style={[styles.container, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.brandRow}>
        <Iris level={3} size={26} color={c.ink} />
        <Text style={styles.brand}>Overlook</Text>
      </View>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        style={styles.pager}
      >
        {pages.map((p) => (
          <View key={p.key} style={[styles.page, { width: SCREEN_WIDTH }]}>
            <View style={styles.body}>{p.render()}</View>
          </View>
        ))}
      </ScrollView>

      {/* Step dots — tappable to jump */}
      <View style={styles.dots}>
        {STEP_ORDER.map((_, i) => (
          <Pressable
            key={i}
            onPress={() => {
              tapHaptic();
              scrollTo(i);
            }}
            hitSlop={6}
          >
            <View
              style={[
                styles.dot,
                i === stepIdx && { backgroundColor: c.ink, width: 18 },
              ]}
            />
          </Pressable>
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
    },
    brandRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 12,
      paddingHorizontal: 32,
    },
    brand: {
      fontFamily: f.displayMedium,
      fontSize: 22,
      color: c.ink,
      letterSpacing: -0.4,
    },
    pager: { flex: 1 },
    page: {
      flex: 1,
      paddingHorizontal: 32,
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
      marginVertical: 16,
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
      paddingHorizontal: 32,
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
