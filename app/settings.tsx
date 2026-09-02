import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useToast } from '@/components/Toast';
import { signOut, useSession } from '@/lib/auth';
import type { FontSet, Palette } from '@/lib/colors';
import { getQueuedIds } from '@/lib/analysisQueue';
import { useDemoMode } from '@/lib/demoMode';
import { refreshHapticsCache } from '@/lib/haptics';
import { resetAllHints } from '@/lib/hints';
import { useHiddenRows } from '@/lib/rowOrder';
import { fetchScreenshots } from '@/lib/screenshots';
import { resetOnboarding, useHapticsEnabled, useScreenshotNotify, useShowTips, type ThemeChoice } from '@/lib/settings';
import { useColors, useFonts, useThemeMode } from '@/lib/themeContext';

export default function SettingsScreen() {
  const toast = useToast();
  const { session } = useSession();
  const [haptics, setHaptics] = useHapticsEnabled();
  const [showTips, setShowTips] = useShowTips();
  const [screenshotNotify, setScreenshotNotify] = useScreenshotNotify();
  const [demoOn, setDemoOn] = useDemoMode();
  const insets = useSafeAreaInsets();
  const { choice: theme, setChoice: setTheme } = useThemeMode();
  const { hidden: hiddenRows, clear: clearHidden } = useHiddenRows();
  const c = useColors();
  const f = useFonts();
  const styles = useMemo(() => makeStyles(c, f), [c, f]);
  const track = { false: c.divider, true: c.ink };

  const [counts, setCounts] = useState<{ total: number; queued: number } | null>(null);
  useEffect(() => {
    let alive = true;
    void Promise.all([fetchScreenshots(), getQueuedIds()]).then(([rows, queued]) => {
      if (!alive) return;
      setCounts({ total: rows.length, queued: queued.size });
    });
    return () => {
      alive = false;
    };
  }, []);

  const onResetTips = async () => {
    await resetAllHints();
    toast.show('Tip hints reset — they\'ll show again next time you see each screen.');
  };

  const buildVersion =
    (Constants.expoConfig?.version ?? '0.1.0') +
    (Constants.expoConfig?.android?.versionCode
      ? ` · build ${Constants.expoConfig.android.versionCode}`
      : '');

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.75 }]}>
          <Ionicons name="arrow-back" size={22} color={c.ink} />
        </Pressable>
        <Text style={styles.title}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 60 + insets.bottom }}>
        <SectionHeading>appearance</SectionHeading>
        <ThemePicker value={theme} onChange={setTheme} />

        <SectionHeading>display</SectionHeading>

        <Row
          label="Show tips"
          hint="Show one-time tooltips for new screens."
          control={<Switch value={showTips} onValueChange={setShowTips} trackColor={track} thumbColor={c.parchment} />}
        />

        <Pressable onPress={onResetTips} style={styles.linkRow}>
          <Text style={styles.linkText}>Reset all tip hints</Text>
          <Ionicons name="refresh" size={16} color={c.inkMuted} />
        </Pressable>

        <Pressable
          onPress={async () => {
            await resetOnboarding();
            toast.show('Onboarding will replay next launch.');
          }}
          style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.75 }]}
        >
          <Text style={styles.linkText}>Replay welcome flow</Text>
          <Ionicons name="play-back-outline" size={16} color={c.inkMuted} />
        </Pressable>

        {hiddenRows.length > 0 && (
          <Pressable
            onPress={() => {
              clearHidden();
              toast.show('Restored hidden category rows.');
            }}
            style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.75 }]}
          >
            <Text style={styles.linkText}>
              Restore {hiddenRows.length} hidden home {hiddenRows.length === 1 ? 'row' : 'rows'}
            </Text>
            <Ionicons name="refresh" size={16} color={c.inkMuted} />
          </Pressable>
        )}

        <SectionHeading>feedback</SectionHeading>

        <Row
          label="Haptic feedback"
          hint="Vibration on taps and saves."
          control={
            <Switch
              value={haptics}
              onValueChange={(v) => {
                setHaptics(v);
                void refreshHapticsCache();
              }}
              trackColor={track}
              thumbColor={c.parchment}
            />
          }
        />

        <Row
          label="Screenshot notifications"
          hint="Push when a new screenshot is captured."
          control={
            <Switch
              value={screenshotNotify}
              onValueChange={setScreenshotNotify}
              trackColor={track}
              thumbColor={c.parchment}
            />
          }
        />

        <SectionHeading>privacy</SectionHeading>

        <View style={styles.privacyBlock}>
          <Text style={styles.privacyHeading}>Local-only by default</Text>
          <Text style={styles.privacyBody}>
            {`Screenshots tagged with categories like Documents or Messages stay on your phone — they're never sent to AI for analysis. Toggle the local-only flag on any card to control it manually.`}
          </Text>
        </View>

        <SectionHeading>storage</SectionHeading>

        <Row
          label="Screenshots"
          hint={counts ? `${counts.total} on device · metadata only on server` : 'Counting…'}
          control={<View />}
        />
        <Row
          label="Queued for AI"
          hint={
            counts
              ? counts.queued === 0
                ? 'No items waiting for analysis'
                : `${counts.queued} ${counts.queued === 1 ? 'item' : 'items'} will retry when online`
              : ''
          }
          control={<View />}
        />

        <SectionHeading>dev</SectionHeading>

        <Row
          label="Demo data"
          hint="Show 14 sample screenshots so the UI isn't empty."
          control={
            <Switch
              value={demoOn}
              onValueChange={(v) => void setDemoOn(v)}
              trackColor={track}
              thumbColor={c.parchment}
            />
          }
        />

        <SectionHeading>account</SectionHeading>

        <Row
          label="Signed in"
          hint={session?.user.email ?? 'Local-only mode'}
          control={<View />}
        />

        <Pressable
          onPress={async () => {
            await signOut();
            router.replace('/');
          }}
          style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.75 }]}
        >
          <Text style={styles.linkText}>Sign out</Text>
          <Ionicons name="log-out-outline" size={16} color={c.inkMuted} />
        </Pressable>

        <SectionHeading>about</SectionHeading>

        <Row label="Version" hint={buildVersion} control={<View />} />

        <View style={styles.colophon}>
          <Text style={styles.colophonText}>
            Overlook · A home for the inspo, references, and visual notes scattered across your phone.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const SectionHeading = ({ children }: { children: string }) => {
  const c = useColors();
  const f = useFonts();
  const styles = useMemo(() => makeStyles(c, f), [c, f]);
  return <Text style={styles.heading}>{children}</Text>;
};

const Row = ({
  label,
  hint,
  control,
}: {
  label: string;
  hint: string;
  control: React.ReactNode;
}) => {
  const c = useColors();
  const f = useFonts();
  const styles = useMemo(() => makeStyles(c, f), [c, f]);
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>{label}</Text>
        {!!hint && <Text style={styles.hint}>{hint}</Text>}
      </View>
      {control}
    </View>
  );
};

const ThemePicker = ({
  value,
  onChange,
}: {
  value: ThemeChoice;
  onChange: (v: ThemeChoice) => void;
}) => {
  const c = useColors();
  const f = useFonts();
  const styles = useMemo(() => makeStyles(c, f), [c, f]);
  const options: { key: ThemeChoice; label: string; hint: string }[] = [
    { key: 'editorial-light', label: 'Editorial', hint: 'Parchment + Playfair' },
    { key: 'editorial-dark', label: 'Editorial Dark', hint: 'Ink + Playfair' },
    { key: 'modern-light', label: 'Modern', hint: 'Parchment + sans' },
    { key: 'modern-dark', label: 'Modern Dark', hint: 'Ink + sans' },
    { key: 'mono-light', label: 'Mono', hint: 'Parchment + monospace' },
    { key: 'accessible-light', label: 'Accessible', hint: 'Color-blind safe hues' },
    { key: 'accessible-dark', label: 'Accessible Dark', hint: 'Color-blind safe hues' },
    { key: 'system', label: 'Auto', hint: 'Match device theme' },
  ];
  return (
    <View style={styles.themeGrid}>
      {options.map((opt) => {
        const active = value === opt.key;
        return (
          <Pressable
            key={opt.key}
            onPress={() => onChange(opt.key)}
            style={({ pressed }) => [styles.themeOpt, active && styles.themeOptActive, pressed && { opacity: 0.75 }]}
          >
            <Text style={[styles.themeOptLabel, active && styles.themeOptLabelActive]}>
              {opt.label}
            </Text>
            <Text style={[styles.themeOptHint, active && styles.themeOptHintActive]}>
              {opt.hint}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};

const makeStyles = (c: Palette, f: FontSet) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.parchment },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingTop: 56,
      paddingHorizontal: 20,
      paddingBottom: 16,
      gap: 12,
    },
    backBtn: { padding: 4 },
    title: { fontFamily: f.displayMedium, fontSize: 26, color: c.ink, letterSpacing: -0.4 },
    heading: {
      fontSize: 11,
      letterSpacing: 1.6,
      textTransform: 'uppercase',
      color: c.inkMuted,
      marginTop: 24,
      marginBottom: 8,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderColor: c.divider,
      gap: 12,
    },
    label: { fontFamily: f.body, fontSize: 14, color: c.ink, marginBottom: 2 },
    hint: { fontFamily: f.body, fontSize: 11, color: c.inkMuted },
    linkRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderColor: c.divider,
      gap: 8,
    },
    linkText: { flex: 1, fontFamily: f.body, fontSize: 14, color: c.ink },
    themeGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: 4,
    },
    themeOpt: {
      flexBasis: '48%',
      flexGrow: 1,
      borderWidth: 1,
      borderColor: c.divider,
      borderRadius: 4,
      paddingVertical: 12,
      paddingHorizontal: 10,
      alignItems: 'flex-start',
      backgroundColor: c.parchment,
    },
    themeOptActive: {
      borderColor: c.ink,
      backgroundColor: c.ink,
    },
    themeOptLabel: {
      fontFamily: f.displayMedium,
      fontSize: 16,
      color: c.ink,
    },
    themeOptLabelActive: { color: c.parchment },
    themeOptHint: {
      fontSize: 10,
      color: c.inkMuted,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      marginTop: 2,
    },
    themeOptHintActive: { color: c.parchment, opacity: 0.7 },
    privacyBlock: {
      paddingVertical: 12,
      paddingHorizontal: 14,
      backgroundColor: c.parchmentSoft,
      borderRadius: 4,
    },
    privacyHeading: {
      fontFamily: f.displayMedium,
      fontSize: 15,
      color: c.ink,
      marginBottom: 4,
    },
    privacyBody: {
      fontFamily: f.body,
      fontSize: 13,
      lineHeight: 19,
      color: c.inkSoft,
    },
    colophon: { paddingVertical: 18 },
    colophonText: {
      fontFamily: f.italic,
      fontSize: 13,
      color: c.inkMuted,
      textAlign: 'center',
    },
  });
