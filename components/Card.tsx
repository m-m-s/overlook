import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CategoryIcon } from './CategoryIcon';
import { Iris } from './Iris';
import { statusColors, urgencyColors, type Palette } from '@/lib/colors';
import { useColors } from '@/lib/themeContext';

export type Resonance = 1 | 2 | 3;

export type CardData = {
  id: string;
  uri: string;
  category?: string | null;
  status?: keyof typeof statusColors | null;
  urgency?: keyof typeof urgencyColors | null;
  resonance?: Resonance | null;
};

type Props = {
  data: CardData;
  analyzing?: boolean;
  /** Whether the grid is in multi-select mode. Affects visual treatment. */
  inSelectMode?: boolean;
  /** Whether this card is currently part of the selection. */
  selected?: boolean;
  /** Whether this card is queued for retry analysis (offline queue). */
  queued?: boolean;
  /**
   * Layout mode. 'grid' = square 1:1 (default for 2/3/4-column grid).
   * 'intent' = portrait 9:16 (single-column intent feed per spec).
   */
  mode?: 'grid' | 'intent';
  /** Top tags to overlay at bottom of image in intent mode. */
  tagPills?: string[];
  onPress?: () => void;
  onLongPress?: () => void;
};

/**
 * Library grid card per spec:
 * - Full-bleed square thumbnail (sharp corners)
 * - Top edge: connected gradient (status -> urgency), transparent when absent
 * - Bottom-left: category silhouette icon with drop shadow
 * - Bottom-right: resonance iris icon with drop shadow
 *
 * Sprint note: vertical fade on the gradient band is omitted for v1 — it's a
 * sharp horizontal band ~22% of card height. Soften pass deferred (NOTES.md).
 */
const labelFor = (data: CardData): string => {
  const parts = ['Screenshot'];
  if (data.category) parts.push(`${data.category} category`);
  if (data.resonance) parts.push(`resonance level ${data.resonance}`);
  if (data.urgency) parts.push(`urgency ${data.urgency}`);
  if (data.status) parts.push(`status ${data.status}`);
  return parts.join(', ');
};

const CardImpl = ({ data, analyzing, inSelectMode, selected, queued, mode = 'grid', tagPills, onPress, onLongPress }: Props) => {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const statusColor = data.status ? statusColors[data.status] : undefined;
  const urgencyColor = data.urgency ? urgencyColors[data.urgency] : undefined;
  const showEdge = Boolean(statusColor && statusColor !== 'transparent') || Boolean(urgencyColor);

  const edgeColors: [string, string, string, string] = [
    statusColor && statusColor !== 'transparent' ? statusColor : 'rgba(0,0,0,0)',
    statusColor && statusColor !== 'transparent' ? statusColor : 'rgba(0,0,0,0)',
    urgencyColor ?? 'rgba(0,0,0,0)',
    urgencyColor ?? 'rgba(0,0,0,0)',
  ];

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={350}
      accessibilityLabel={labelFor(data)}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.card,
        mode === 'intent' && styles.cardIntent,
        pressed && { opacity: 0.92 },
      ]}
    >
      <Image source={{ uri: data.uri }} style={styles.image} contentFit="cover" />

      {showEdge && (
        <LinearGradient
          colors={edgeColors}
          locations={[0, 0.35, 0.65, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.edgeBand}
          pointerEvents="none"
        />
      )}

      <View style={styles.bottomLeft} pointerEvents="none">
        <CategoryIcon category={data.category} shadow />
      </View>

      {data.resonance ? (
        <View style={styles.bottomRight} pointerEvents="none">
          <Iris level={data.resonance} />
        </View>
      ) : null}

      {analyzing && (
        <View style={styles.analyzingPill} pointerEvents="none">
          <View style={styles.analyzingDot} />
          <View style={styles.analyzingDot} />
          <View style={styles.analyzingDot} />
        </View>
      )}

      {/* Queued for offline retry — small badge with hourglass-style indicator */}
      {queued && !analyzing && (
        <View style={styles.queuedPill} pointerEvents="none">
          <Ionicons name="cloud-offline-outline" size={10} color={c.parchment} />
        </View>
      )}

      {/* Intent-mode tag pills overlaid at bottom of image (per spec) */}
      {mode === 'intent' && tagPills && tagPills.length > 0 && (
        <View style={styles.tagPills} pointerEvents="none">
          {tagPills.slice(0, 3).map((t, i) => (
            <View key={`${t}-${i}`} style={styles.tagPill}>
              <Text style={styles.tagPillText} numberOfLines={1}>{t}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Intent-mode "open detail" affordance — tall portrait images make
          the tap-anywhere-to-detail behavior easy to miss, so we show a
          small expand glyph in the top-right corner. Tap anywhere on the
          card still opens the sheet. */}
      {mode === 'intent' && !inSelectMode && (
        <View style={styles.intentExpandHint} pointerEvents="none">
          <Ionicons name="chevron-up-outline" size={14} color={c.parchment} />
        </View>
      )}

      {inSelectMode && (
        <View style={[styles.selectMask, !selected && styles.selectMaskDim]} pointerEvents="none">
          <View style={[styles.selectCheck, selected && styles.selectCheckOn]}>
            {selected && <Ionicons name="checkmark" size={18} color={c.parchment} />}
          </View>
        </View>
      )}
    </Pressable>
  );
};

/** Memoized — props are mostly primitives + stable refs, so the default
 *  shallow comparison is fine. Big perf win in lists where the parent
 *  re-renders frequently (filter changes, batch polling) but most cards
 *  are unaffected. */
export const Card = memo(CardImpl);

const ICON_SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.85,
  shadowRadius: 6,
  elevation: 8,
};

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    card: {
      flex: 1,
      aspectRatio: 1,
      // Parchment instead of divider grey so the side bars/letterbox you get
      // when an image's aspect doesn't fill a square card blend into the page
      // background instead of looking like a visible frame.
      backgroundColor: c.parchment,
      overflow: 'hidden',
    },
    cardIntent: {
      aspectRatio: undefined,
    },
    image: { width: '100%', height: '100%' },
    edgeBand: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 6,
    },
    bottomLeft: { position: 'absolute', left: 8, bottom: 8, ...ICON_SHADOW },
    bottomRight: { position: 'absolute', right: 8, bottom: 8, ...ICON_SHADOW },
    analyzingPill: {
      position: 'absolute',
      top: 8,
      right: 8,
      flexDirection: 'row',
      gap: 3,
      backgroundColor: 'rgba(0,0,0,0.55)',
      paddingHorizontal: 6,
      paddingVertical: 4,
      borderRadius: 10,
      alignItems: 'center',
    },
    analyzingDot: {
      width: 4,
      height: 4,
      borderRadius: 2,
      backgroundColor: c.parchment,
    },
    selectMask: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: 'flex-end',
      padding: 8,
    },
    selectMaskDim: {
      backgroundColor: 'rgba(31,30,27,0.45)',
    },
    selectCheck: {
      width: 26,
      height: 26,
      borderRadius: 13,
      borderWidth: 2,
      borderColor: c.parchment,
      backgroundColor: 'rgba(0,0,0,0.25)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    selectCheckOn: {
      backgroundColor: c.ink,
    },
    queuedPill: {
      position: 'absolute',
      top: 8,
      right: 8,
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: 'rgba(0,0,0,0.55)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    tagPills: {
      position: 'absolute',
      bottom: 38,
      left: 8,
      right: 8,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 4,
    },
    intentExpandHint: {
      position: 'absolute',
      top: 12,
      right: 12,
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: 'rgba(0,0,0,0.45)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    tagPill: {
      backgroundColor: 'rgba(0,0,0,0.55)',
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 3,
      maxWidth: '60%',
    },
    tagPillText: {
      color: c.parchment,
      fontSize: 10,
      letterSpacing: 0.3,
    },
  });
