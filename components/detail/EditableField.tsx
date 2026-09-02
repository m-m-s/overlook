import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useMemo, type ReactNode } from 'react';
import Reanimated, { FadeIn, FadeOut } from 'react-native-reanimated';

import { Shake } from '../Shake';
import type { FontSet, Palette } from '@/lib/colors';
import { useColors, useFonts } from '@/lib/themeContext';

type Props = {
  /** Accepted but unused — retained for call-site compatibility. */
  sectionKey?: string;
  /** Section header label (lowercase per editorial style). */
  label: string;
  /** Whether this section is currently in edit mode. */
  editing: boolean;
  /** Tap target — toggles edit mode. */
  onToggle: () => void;
  /** Called when "done editing" is tapped — saves and closes. Defaults to onToggle. */
  onDone?: () => void;
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
  onDone,
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
        onPress={onToggle}
        hitSlop={8}
        style={({ pressed }) => [styles.head, pressed && { opacity: 0.75 }]}
      >
        <Text style={styles.label}>
          {label}
          {!editing && !hasValue && <Text style={styles.labelAdd}>  +</Text>}
        </Text>
        {editing && (
          <Pressable onPress={onDone ?? onToggle} hitSlop={8} style={styles.exit}>
            <Text style={styles.exitText}>done editing</Text>
          </Pressable>
        )}
      </Pressable>
      {editing ? (
        <Reanimated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(110)}>
          <Shake trigger={editing}>{edit}</Shake>
        </Reanimated.View>
      ) : hasValue ? (
        <Reanimated.View entering={FadeIn.duration(160)} exiting={FadeOut.duration(110)}>
          {read}
        </Reanimated.View>
      ) : null}
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
    labelAdd: {
      fontSize: 11,
      letterSpacing: 0,
      color: c.inkMuted,
      fontWeight: '300',
    },
    exitText: {
      fontSize: 10,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      color: c.inkMuted,
      textDecorationLine: 'underline',
      textDecorationStyle: 'dashed',
    },
  });
