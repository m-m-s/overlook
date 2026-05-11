import { router } from 'expo-router';
import { useMemo } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { isAnalyzeConfigured } from '@/lib/analyze';
import { useColors, useFonts } from '@/lib/themeContext';
import { BatchSlider, makeStyles, PageHeader } from './UploadHelpers';

type Props = {
  newCount: number;
  duplicateCount: number;
  totalCount: number;
  batchSize: number;
  setBatchSize: (n: number) => void;
  onReview: () => void;
  onProcessAll: () => void;
  onAddAllNoAI: () => void;
};

export const UploadPickBatch = ({
  newCount,
  duplicateCount,
  totalCount,
  batchSize,
  setBatchSize,
  onReview,
  onProcessAll,
  onAddAllNoAI,
}: Props) => {
  const c = useColors();
  const f = useFonts();
  const styles = useMemo(() => makeStyles(c, f), [c, f]);
  const effectiveBatch = Math.min(batchSize, newCount);

  return (
    <View style={{ flex: 1, backgroundColor: c.parchment }}>
      <PageHeader title="Bulk upload" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>new</Text>
          <Text style={styles.statValue}>{newCount}</Text>
        </View>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>already imported</Text>
          <Text style={styles.statValue}>{duplicateCount}</Text>
        </View>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>total in album</Text>
          <Text style={styles.statValue}>{totalCount}</Text>
        </View>

        <View style={styles.batchBox}>
          <Text style={styles.batchTitle}>batch size</Text>
          <Text style={styles.batchValue}>{effectiveBatch}</Text>
          <Text style={styles.batchSub}>screenshots per batch</Text>
          <BatchSlider value={batchSize} onChange={setBatchSize} />
        </View>

        <Text style={styles.batteryHint}>
          Larger batches = longer to process. Plug in for batches over 100.
        </Text>

        <View style={{ marginTop: 32, gap: 10 }}>
          <Pressable
            onPress={onReview}
            style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && { opacity: 0.85 }]}
            disabled={newCount === 0}
          >
            <Text style={styles.btnPrimaryText}>review batch</Text>
          </Pressable>
          <Pressable
            onPress={onProcessAll}
            style={({ pressed }) => [
              styles.btn,
              styles.btnSecondary,
              (!isAnalyzeConfigured || newCount === 0) && { opacity: 0.4 },
              pressed && { opacity: 0.85 },
            ]}
            disabled={!isAnalyzeConfigured || newCount === 0}
          >
            <Text style={styles.btnSecondaryText}>process all without review</Text>
          </Pressable>
          <Pressable
            onPress={onAddAllNoAI}
            style={({ pressed }) => [
              styles.btn,
              styles.btnGhost,
              newCount === 0 && { opacity: 0.4 },
              pressed && { opacity: 0.85 },
            ]}
            disabled={newCount === 0}
          >
            <Text style={styles.btnGhostText}>add all without AI</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
};
