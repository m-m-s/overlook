import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { FontSet, Palette } from '@/lib/colors';
import { statusColors, urgencyColors } from '@/lib/colors';
import { findSimilar } from '@/lib/similar';
import { effectiveUrgencyKey } from '@/lib/urgency';
import { useColors, useFonts } from '@/lib/themeContext';
import type { LocalScreenshot } from '@/lib/uploads';

const THUMB = 96;

type Props = {
  item: LocalScreenshot;
  /** Full library to pick similar items from. When omitted, the row hides. */
  allItems?: LocalScreenshot[];
  onSelect: (id: string) => void;
  /** "See all →" navigates to a filtered view of the same category. */
  onSeeAll?: () => void;
};

/**
 * "More like this" row — tag-weighted similarity scoring (see lib/similar.ts).
 * Renders up to 8 thumbnails with edge gradient. Tapping swaps the open item
 * in the parent sheet. "See all →" jumps to the filtered grid.
 */
export const SimilarRow = ({ item, allItems, onSelect, onSeeAll }: Props) => {
  const c = useColors();
  const f = useFonts();
  const styles = useMemo(() => makeStyles(c, f), [c, f]);

  if (!allItems) return null;
  const similar = findSimilar(item, allItems, 8);
  if (similar.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Text style={styles.label}>similar</Text>
        {onSeeAll && (
          <Pressable onPress={onSeeAll} hitSlop={12} style={({ pressed }) => pressed && { opacity: 0.75 }}>
            <Text style={styles.seeAll}>see all →</Text>
          </Pressable>
        )}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {similar.map((it) => {
          const statusColor = it.status ? statusColors[it.status as keyof typeof statusColors] : undefined;
          const urgencyColor = it.urgency ? urgencyColors[effectiveUrgencyKey(it) as keyof typeof urgencyColors] : undefined;
          const showEdge = (Boolean(statusColor) && statusColor !== 'transparent') || Boolean(urgencyColor);
          const edgeColors: [string, string, string, string] = [
            statusColor && statusColor !== 'transparent' ? statusColor : 'rgba(0,0,0,0)',
            statusColor && statusColor !== 'transparent' ? statusColor : 'rgba(0,0,0,0)',
            urgencyColor ?? 'rgba(0,0,0,0)',
            urgencyColor ?? 'rgba(0,0,0,0)',
          ];
          return (
            <Pressable
              key={it.id}
              onPress={() => onSelect(it.id)}
              style={({ pressed }) => [styles.thumbWrap, pressed && { opacity: 0.8 }]}
              accessibilityLabel="Open similar screenshot"
            >
              <Image source={{ uri: it.uri }} style={styles.thumb} contentFit="cover" />
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
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
};

const makeStyles = (c: Palette, f: FontSet) =>
  StyleSheet.create({
    wrap: { marginTop: 24 },
    header: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    label: {
      flex: 1,
      fontSize: 11,
      letterSpacing: 1.8,
      textTransform: 'uppercase',
      color: c.inkMuted,
      fontFamily: f.body,
    },
    seeAll: {
      fontSize: 11,
      letterSpacing: 1.4,
      textTransform: 'uppercase',
      color: c.inkMuted,
      textDecorationLine: 'underline',
      textDecorationStyle: 'dashed',
    },
    row: { gap: 6, paddingRight: 8 },
    thumbWrap: { width: THUMB, height: THUMB, backgroundColor: c.parchment, overflow: 'hidden' },
    thumb: { width: '100%', height: '100%' },
    edgeBand: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: 5,
    },
  });
