import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { heavyHaptic } from '@/lib/haptics';
import type { FontSet, Palette } from '@/lib/colors';
import { useColors, useFonts } from '@/lib/themeContext';
import type { TypedTag } from '@/lib/screenshots';
import { TAG_TYPES } from '@/lib/options';

/** Long-press wrapper that toggles a section's edit mode. */
export const Section = ({
  onToggle,
  children,
}: {
  onToggle: () => void;
  children: React.ReactNode;
}) => (
  <Pressable
    onLongPress={() => {
      void heavyHaptic();
      onToggle();
    }}
    delayLongPress={350}
  >
    {children}
  </Pressable>
);

/** Section label row with optional "done editing" exit link. */
export const SectionHeader = ({
  label,
  editing,
  onExit,
}: {
  label: string;
  editing: boolean;
  onExit?: () => void;
}) => {
  const c = useColors();
  const f = useFonts();
  const styles = useMemo(() => makeStyles(c, f), [c, f]);
  return (
    <View style={styles.sectionHead}>
      <Text style={styles.sectionLabel}>{label}</Text>
      {editing && onExit && (
        <Pressable onPress={onExit} hitSlop={8} style={styles.sectionExit}>
          <Text style={styles.sectionExitText}>Done editing</Text>
        </Pressable>
      )}
    </View>
  );
};

export type DisplayTag =
  | { tag: TypedTag; source: 'manual'; manualIndex: number; aiIndex?: undefined }
  | { tag: TypedTag; source: 'ai'; aiIndex: number; manualIndex?: undefined };

/**
 * Merge manual + AI tags and order per CLAUDE.md:
 * typed tags first (type hierarchy order) → untyped last. Within same type, alphabetical.
 */
export const sortedDisplayTags = (manual: TypedTag[], ai: TypedTag[]): DisplayTag[] => {
  const all: DisplayTag[] = [
    ...manual.map((tag, manualIndex): DisplayTag => ({ tag, source: 'manual', manualIndex })),
    ...ai.map((tag, aiIndex): DisplayTag => ({ tag, source: 'ai', aiIndex })),
  ];
  const typeRank = (t?: string): number => {
    if (!t) return TAG_TYPES.length;
    const idx = (TAG_TYPES as readonly string[]).indexOf(t);
    return idx === -1 ? TAG_TYPES.length : idx;
  };
  return all.sort((a, b) => {
    const ra = typeRank(a.tag.type);
    const rb = typeRank(b.tag.type);
    if (ra !== rb) return ra - rb;
    return a.tag.value.localeCompare(b.tag.value);
  });
};

const makeStyles = (c: Palette, f: FontSet) =>
  StyleSheet.create({
    sectionLabel: {
      fontSize: 11,
      letterSpacing: 1.8,
      textTransform: 'uppercase',
      color: c.inkMuted,
      marginTop: 8,
      marginBottom: 4,
    },
    sectionHead: {
      marginTop: 6,
      marginBottom: 2,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    sectionExit: { paddingHorizontal: 4, paddingVertical: 2 },
    sectionExitText: {
      fontSize: 10,
      letterSpacing: 1.4,
      textTransform: 'uppercase',
      color: c.inkMuted,
      textDecorationLine: 'underline',
    },
  });
