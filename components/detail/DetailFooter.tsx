import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { FontSet, Palette } from '@/lib/colors';
import { useColors, useFonts } from '@/lib/themeContext';

type Props = {
  onShare: () => void;
  onDelete: () => void;
};

/**
 * Sticky footer for the screenshot detail sheet. Rendered via gorhom's
 * BottomSheetFooter so the sheet reserves layout space for it — the
 * scroll content's max-scroll automatically excludes the footer area,
 * meaning we don't need fragile manual paddingBottom math.
 *
 * Owns its own safe-area padding so the buttons sit comfortably above
 * the gesture nav while the parchment background fills the inset zone.
 */
export const DetailFooter = ({ onShare, onDelete }: Props) => {
  const c = useColors();
  const f = useFonts();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(c, f), [c, f]);
  return (
    <View
      style={[
        styles.footer,
        { paddingBottom: insets.bottom + 12, backgroundColor: c.parchment },
      ]}
    >
      <Pressable onPress={onShare} style={styles.btn} accessibilityLabel="Share screenshot">
        <Ionicons name="share-outline" size={18} color={c.ink} />
        <Text style={styles.btnText}>share</Text>
      </Pressable>
      <View style={styles.divider} />
      <Pressable onPress={onDelete} style={styles.btn} accessibilityLabel="Delete screenshot">
        <Ionicons name="trash-outline" size={18} color="#C0392B" />
        <Text style={[styles.btnText, { color: '#C0392B' }]}>delete</Text>
      </Pressable>
    </View>
  );
};

const makeStyles = (c: Palette, f: FontSet) =>
  StyleSheet.create({
    footer: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      paddingTop: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.ink,
      borderStyle: 'dashed',
    },
    btn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 12,
      paddingHorizontal: 16,
      minHeight: 44,
    },
    btnText: {
      color: c.ink,
      fontSize: 12,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      fontFamily: f.body,
    },
    divider: {
      width: StyleSheet.hairlineWidth,
      alignSelf: 'stretch',
      backgroundColor: c.divider,
      marginVertical: 4,
    },
  });
