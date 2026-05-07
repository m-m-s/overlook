import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { useToast } from '@/components/Toast';
import { signOut } from '@/lib/auth';
import { colors } from '@/lib/colors';
import { resetAllHints } from '@/lib/hints';
import { useHapticsEnabled, useShowTips } from '@/lib/settings';

export default function SettingsScreen() {
  const toast = useToast();
  const [haptics, setHaptics] = useHapticsEnabled();
  const [showTips, setShowTips] = useShowTips();

  const onResetTips = async () => {
    await resetAllHints();
    toast.show('tip hints reset — they\'ll show again next time you see each screen');
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.title}>settings</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 60 }}>
        <SectionHeading>display</SectionHeading>

        <Row
          label="show tips"
          hint="show one-time tooltips for new screens"
          control={<Switch value={showTips} onValueChange={setShowTips} trackColor={track} thumbColor={colors.parchment} />}
        />

        <Pressable onPress={onResetTips} style={styles.linkRow}>
          <Text style={styles.linkText}>reset all tip hints</Text>
          <Ionicons name="refresh" size={16} color={colors.inkMuted} />
        </Pressable>

        <SectionHeading>feedback</SectionHeading>

        <Row
          label="haptic feedback"
          hint="vibration on taps and saves"
          control={<Switch value={haptics} onValueChange={setHaptics} trackColor={track} thumbColor={colors.parchment} />}
        />

        <SectionHeading>account</SectionHeading>

        <Pressable
          onPress={async () => {
            await signOut();
            router.replace('/');
          }}
          style={styles.linkRow}
        >
          <Text style={styles.linkText}>sign out</Text>
          <Ionicons name="log-out-outline" size={16} color={colors.inkMuted} />
        </Pressable>

        <SectionHeading>about</SectionHeading>

        <Row label="version" hint={Constants.expoConfig?.version ?? '0.1.0'} control={<View />} />
      </ScrollView>
    </View>
  );
}

const track = { false: colors.divider, true: colors.ink };

const SectionHeading = ({ children }: { children: string }) => (
  <Text style={styles.heading}>{children}</Text>
);

const Row = ({
  label,
  hint,
  control,
}: {
  label: string;
  hint: string;
  control: React.ReactNode;
}) => (
  <View style={styles.row}>
    <View style={{ flex: 1 }}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.hint}>{hint}</Text>
    </View>
    {control}
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.parchment },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 12,
  },
  backBtn: { padding: 4 },
  title: { fontFamily: 'Georgia', fontSize: 26, color: colors.ink, letterSpacing: -0.4 },
  heading: {
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: colors.inkMuted,
    marginTop: 28,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: colors.divider,
    gap: 12,
  },
  label: { fontSize: 14, color: colors.ink, marginBottom: 2 },
  hint: { fontSize: 11, color: colors.inkMuted },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: colors.divider,
    gap: 8,
  },
  linkText: { flex: 1, fontSize: 14, color: colors.ink },
});
