import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { Iris } from '@/components/Iris';
import { useColors, useFonts } from '@/lib/themeContext';
import { makeStyles } from './UploadHelpers';

type Props = {
  totalToProcess: number;
  doneCount: number;
  failCount: number;
  paused: boolean;
  analyzeWithAI: boolean;
  onTogglePause: () => void;
  onStop: () => void;
};

export const UploadProcessing = ({
  totalToProcess,
  doneCount,
  failCount,
  paused,
  analyzeWithAI,
  onTogglePause,
  onStop,
}: Props) => {
  const c = useColors();
  const f = useFonts();
  const styles = useMemo(() => makeStyles(c, f), [c, f]);

  const remaining = Math.max(0, totalToProcess - doneCount - failCount);
  const pct = totalToProcess > 0 ? ((doneCount + failCount) / totalToProcess) * 100 : 0;

  return (
    <View style={[styles.center, { flex: 1, padding: 32 }]}>
      <Pressable
        onPress={() => router.replace('/')}
        hitSlop={12}
        style={{ position: 'absolute', top: 56, left: 20, padding: 4 }}
        accessibilityLabel="Back to home"
      >
        <Ionicons name="arrow-back" size={22} color={c.ink} />
      </Pressable>

      <View style={{ marginBottom: 16, opacity: paused ? 0.4 : 1 }}>
        <Iris level={3} size={56} color={c.ink} spinning={!paused} />
      </View>
      <Text style={styles.h2}>{paused ? 'paused' : 'processing'}</Text>
      <Text style={styles.subtle}>{analyzeWithAI ? 'with AI tagging' : 'no AI tagging'}</Text>

      <View style={styles.statRow}>
        <Text style={styles.statLabel}>total</Text>
        <Text style={styles.statValue}>{totalToProcess}</Text>
      </View>
      <View style={styles.statRow}>
        <Text style={styles.statLabel}>processed</Text>
        <Text style={styles.statValue}>{doneCount}</Text>
      </View>
      <View style={styles.statRow}>
        <Text style={styles.statLabel}>remaining</Text>
        <Text style={styles.statValue}>{remaining}</Text>
      </View>
      {failCount > 0 && (
        <View style={styles.statRow}>
          <Text style={[styles.statLabel, { color: '#C0392B' }]}>failed</Text>
          <Text style={[styles.statValue, { color: '#C0392B' }]}>{failCount}</Text>
        </View>
      )}

      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${pct}%` }]} />
      </View>

      <Pressable
        onPress={onTogglePause}
        style={({ pressed }) => [styles.pauseBtn, paused && styles.pauseBtnResume, pressed && { opacity: 0.85 }]}
        accessibilityLabel={paused ? 'Resume processing' : 'Pause processing'}
      >
        <Ionicons
          name={paused ? 'play' : 'pause'}
          size={22}
          color={paused ? c.parchment : c.ink}
          style={{ marginRight: 8 }}
        />
        <Text style={[styles.pauseBtnText, paused && styles.pauseBtnTextOn]}>
          {paused ? 'resume' : 'pause'}
        </Text>
      </Pressable>

      {paused && (
        <Pressable
          onPress={() =>
            Alert.alert(
              'Stop processing?',
              `${remaining} screenshot${remaining === 1 ? '' : 's'} won't be processed. You can re-scan later to pick up where you left off.`,
              [
                { text: 'Keep paused', style: 'cancel' },
                { text: 'Stop', style: 'destructive', onPress: onStop },
              ],
            )
          }
          hitSlop={8}
          style={{ marginTop: 14 }}
        >
          <Text style={styles.stopLink}>stop and exit</Text>
        </Pressable>
      )}

      {!paused && (
        <Text style={styles.subtleSmall}>You can leave this screen — it&apos;ll keep going</Text>
      )}
    </View>
  );
};
