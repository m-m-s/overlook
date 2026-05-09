import { Image } from 'expo-image';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { FontSet, Palette } from '@/lib/colors';
import { findSimilar } from '@/lib/similar';
import { useColors, useFonts } from '@/lib/themeContext';
import type { LocalScreenshot } from '@/lib/uploads';

type Props = {
  item: LocalScreenshot;
  /** Full library to pick similar items from. When omitted, the row hides. */
  allItems?: LocalScreenshot[];
  onSelect: (id: string) => void;
};

/**
 * "More like this" row — tag-weighted similarity scoring (see lib/similar.ts).
 * Renders up to 8 thumbnails. Tapping one swaps the open item in the parent
 * sheet via onSelect, no navigation.
 *
 * Hides itself when allItems is missing or nothing scores above zero.
 */
export const SimilarRow = ({ item, allItems, onSelect }: Props) => {
  const c = useColors();
  const f = useFonts();
  const styles = useMemo(() => makeStyles(c, f), [c, f]);

  if (!allItems) return null;
  const similar = findSimilar(item, allItems, 8);
  if (similar.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>similar</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {similar.map((it) => (
          <Pressable
            key={it.id}
            onPress={() => onSelect(it.id)}
            style={styles.thumbWrap}
            accessibilityLabel="Open similar screenshot"
          >
            <Image source={{ uri: it.uri }} style={styles.thumb} contentFit="cover" />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
};

const makeStyles = (c: Palette, f: FontSet) =>
  StyleSheet.create({
    wrap: { marginTop: 24 },
    label: {
      fontSize: 11,
      letterSpacing: 1.8,
      textTransform: 'uppercase',
      color: c.inkMuted,
      marginBottom: 6,
      fontFamily: f.body,
    },
    row: { gap: 6, paddingTop: 8, paddingRight: 8 },
    thumbWrap: { width: 76, height: 76, backgroundColor: c.parchment },
    thumb: { width: '100%', height: '100%' },
  });
