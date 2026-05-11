import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { Iris } from '@/components/Iris';
import { makeStyles, PageHeader } from './UploadHelpers';
import { useColors, useFonts } from '@/lib/themeContext';

export const UploadScanning = ({ scanProgress }: { scanProgress: number }) => {
  const c = useColors();
  const f = useFonts();
  const styles = useMemo(() => makeStyles(c, f), [c, f]);
  return (
    <View style={[styles.center, { flex: 1, padding: 32 }]}>
      <PageHeader title="" onBack={() => router.replace('/')} />
      <View style={{ marginBottom: 16 }}>
        <Iris level={3} size={56} color={c.ink} spinning />
      </View>
      <Text style={styles.h1}>scanning library</Text>
      <View style={styles.statRow}>
        <Text style={styles.statLabel}>found</Text>
        <Text style={styles.statValue}>{scanProgress}</Text>
      </View>
      <Text style={styles.batteryHint}>
        Large libraries can take a minute. Plug in if you have thousands of screenshots.
      </Text>
      <Pressable onPress={() => router.replace('/')} hitSlop={8} style={{ marginTop: 32 }}>
        <Text style={styles.cancelLink}>cancel scan</Text>
      </Pressable>
    </View>
  );
};
