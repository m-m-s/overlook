import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useMemo } from 'react';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColors, useFonts } from '@/lib/themeContext';
import type { ReviewState } from '@/lib/useUploadFlow';
import type { ScannedAsset } from '@/lib/mediaLibrary';
import { makeStyles, PageHeader } from './UploadHelpers';

type Props = {
  reviewBatch: ScannedAsset[];
  stateMap: Map<string, ReviewState>;
  includedCount: number;
  onCycleState: (id: string) => void;
  onSetAllState: (state: ReviewState) => void;
  onProcess: (withAI: boolean) => void;
  onBack: () => void;
};

export const UploadReview = ({
  reviewBatch,
  stateMap,
  includedCount,
  onCycleState,
  onSetAllState,
  onProcess,
  onBack,
}: Props) => {
  const c = useColors();
  const f = useFonts();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(c, f), [c, f]);

  const aiCount = reviewBatch.filter((a) => (stateMap.get(a.id) ?? 'include') === 'include').length;
  const noAiCount = reviewBatch.filter((a) => stateMap.get(a.id) === 'no-ai').length;
  const total = aiCount + noAiCount;
  const summary =
    total === 0
      ? 'tap a card to cycle: include → no AI → exclude'
      : noAiCount === 0
        ? `${aiCount} with AI`
        : aiCount === 0
          ? `${noAiCount} without AI`
          : `${aiCount} with AI · ${noAiCount} without`;

  return (
    <View style={{ flex: 1, backgroundColor: c.parchment }}>
      <PageHeader
        title="Review batch"
        subtitle={
          includedCount > 0
            ? `${includedCount} ready · ${reviewBatch.length - includedCount} excluded`
            : 'pick what to import'
        }
        onBack={onBack}
      />

      <FlatList
        style={{ flex: 1 }}
        data={reviewBatch}
        keyExtractor={(a) => a.id}
        numColumns={4}
        columnWrapperStyle={{ gap: 2 }}
        ItemSeparatorComponent={() => <View style={{ height: 2 }} />}
        renderItem={({ item }) => {
          const state = stateMap.get(item.id) ?? 'include';
          return (
            <Pressable onPress={() => onCycleState(item.id)} style={styles.reviewCell}>
              <Image source={{ uri: item.uri }} style={styles.reviewImg} contentFit="cover" />
              {state === 'no-ai' && (
                <View style={[styles.reviewOverlay, { backgroundColor: 'rgba(0,0,0,0.35)' }]}>
                  <Ionicons name="pricetag-outline" size={26} color={c.parchment} />
                </View>
              )}
              {state === 'exclude' && (
                <View style={styles.reviewOverlay}>
                  <Ionicons name="close" size={28} color={c.parchment} />
                </View>
              )}
            </Pressable>
          );
        }}
        ListFooterComponent={<View style={{ height: 200 }} />}
      />

      <View style={[styles.reviewFooter, { paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.selectAllRow}>
          <Pressable onPress={() => onSetAllState('include')} hitSlop={6}>
            <Text style={styles.selectAllLink}>select all</Text>
          </Pressable>
          <Text style={styles.selectAllSep}>·</Text>
          <Pressable onPress={() => onSetAllState('exclude')} hitSlop={6}>
            <Text style={styles.selectAllLink}>deselect all</Text>
          </Pressable>
          <Text style={styles.selectAllSep}>·</Text>
          <Pressable onPress={() => onSetAllState('no-ai')} hitSlop={6}>
            <Text style={styles.selectAllLink}>all → no AI</Text>
          </Pressable>
        </View>
        <Text style={styles.footerCount}>{summary}</Text>
        <View style={styles.footerBtnRow}>
          <Pressable
            onPress={() => onProcess(true)}
            style={({ pressed }) => [
              styles.btn,
              styles.btnPrimary,
              total === 0 && { opacity: 0.4 },
              pressed && { opacity: 0.85 },
            ]}
            disabled={total === 0}
          >
            <Text style={styles.btnPrimaryText}>process {total > 0 ? total : ''}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
};
