import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useColors, useFonts } from '@/lib/themeContext';
import { makeStyles } from './UploadHelpers';

type Props = {
  doneCount: number;
  failCount: number;
  hasFailures: boolean;
  failedCount: number;
  hasMoreBatches: boolean;
  onRetryFailed: () => void;
  onNextBatch: () => void;
};

export const UploadDone = ({
  doneCount,
  failCount,
  hasFailures,
  failedCount,
  hasMoreBatches,
  onRetryFailed,
  onNextBatch,
}: Props) => {
  const c = useColors();
  const f = useFonts();
  const styles = useMemo(() => makeStyles(c, f), [c, f]);

  return (
    <View style={[styles.center, { flex: 1, padding: 32 }]}>
      <Text style={styles.h2}>imported {doneCount}</Text>
      {failCount > 0 && <Text style={styles.subtle}>{failCount} failed</Text>}
      {hasFailures && failedCount > 0 && (
        <Pressable onPress={onRetryFailed} style={[styles.btn, styles.btnSecondary, styles.doneBtn]}>
          <Text style={styles.btnSecondaryText}>retry {failedCount} failed</Text>
        </Pressable>
      )}
      <Pressable
        onPress={() => router.replace('/')}
        style={[styles.btn, styles.btnPrimary, styles.doneBtn]}
      >
        <Text style={styles.btnPrimaryText}>back to library</Text>
      </Pressable>
      {hasMoreBatches && (
        <Pressable onPress={onNextBatch} style={[styles.btn, styles.btnSecondary, styles.doneBtn]}>
          <Text style={styles.btnSecondaryText}>review next batch</Text>
        </Pressable>
      )}
    </View>
  );
};
