import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useMemo, type ReactNode } from 'react';

import { Shake } from '../Shake';
import { heavyHaptic } from '@/lib/haptics';
import type { FontSet, Palette } from '@/lib/colors';
import { useColors, useFonts } from '@/lib/themeContext';

type Props = {
  /** Stable key used by the parent's editingSections set. */
  sectionKey: string;
  /** Section header label (lowercase per editorial style). */
  label: string;
  /** Whether this section is currently in edit mode. */
  editing: boolean;
  /** Toggle this section's edit-mode flag (long-press anywhere or "done editing" tap). */
  onToggle: () => void;
  /** When true, the read slot renders. When false (and not editing), an
   *  italicized 'not set' hint shows. */
  hasValue: boolean;
  /** Read-mode UI: chips, text, icons. */
  read: ReactNode;
  /** Edit-mode UI: pickable chips. Wrapped in a Shake animation. */
  edit: ReactNode;
};

/**
 * Reusable wrapper for the metadata sections in ScreenshotDetail
 * (resonance, urgency, status, category, subject, notes, etc.) that all
 * share the same long-press → edit → exit pattern with the dashed
 * "done editing" affordance.
 *
 * Replaces ~30 lines of Section + SectionHeader + isEditing conditional
 * boilerplate per section. Edit-mode body gets the shake animation
 * automatically.
 */
export const EditableField = ({
  label,
  editing,
  onToggle,
  hasValue,
  read,
  edit,
}: Props) => {
  const c = useColors();
  const f = useFonts();
  const styles = useMemo(() => makeStyles(c, f), [c, f]);
  return (
    <View>
      <Pressable
        onLongPress={() => { void heavyHaptic(); onToggle(); }}
        delayLongPress={350}
        style={styles.head}
      >
        <Text style={styles.label}>{label}</Text>
        {editing && (
          <Pressable onPress={onToggle} hitSlop={8} style={styles.exit}>
            <Text style={styles.exitText}>done editing</Text>
          </Pressable>
        )}
      </Pressable>
      {editing ? (
        <Shake trigger={editing}>{edit}</Shake>
      ) : hasValue ? (
        read
      ) : (
        <Text style={styles.empty}>not set</Text>
      )}
    </View>
  );
};

const makeStyles = (c: Palette, f: FontSet) =>
  StyleSheet.create({
    head: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 18,
      marginBottom: 6,
      gap: 8,
    },
    label: {
      fontSize: 11,
      letterSpacing: 1.8,
      textTransform: 'uppercase',
      color: c.inkMuted,
      fontFamily: f.body,
    },
    exit: {
      paddingVertical: 2,
      paddingHorizontal: 4,
    },
    exitText: {
      fontSize: 10,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      color: c.inkMuted,
      textDecorationLine: 'underline',
      textDecorationStyle: 'dashed',
    },
    empty: {
      fontFamily: f.italic,
      fontSize: 13,
      color: c.inkMuted,
      paddingVertical: 4,
    },
  });
