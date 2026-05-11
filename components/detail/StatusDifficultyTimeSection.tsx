import { useMemo } from 'react';
import { LayoutAnimation, Pressable, StyleSheet, Text, View } from 'react-native';

import { Chip } from '../Chip';
import { capitalize, DIFFICULTIES, STATUSES, TIMES_TO_COMPLETE } from '@/lib/options';
import { statusColors } from '@/lib/colors';
import type { FontSet, Palette } from '@/lib/colors';
import { useColors, useFonts } from '@/lib/themeContext';
import { heavyHaptic } from '@/lib/haptics';

type Props = {
  status: string | null | undefined;
  difficulty: string | null | undefined;
  timeToComplete: string | null | undefined;
  editingSections: Set<string>;
  setEditingSections: React.Dispatch<React.SetStateAction<Set<string>>>;
  onSetStatus: (s: string | null) => void;
  onSetDifficulty: (d: 'beginner' | 'intermediate' | 'advanced' | null) => void;
  onSetTimeToComplete: (t: 'quick' | 'afternoon' | 'full_day' | 'multi_day' | 'long_term' | null) => void;
};

export const StatusDifficultyTimeSection = ({
  status,
  difficulty,
  timeToComplete,
  editingSections,
  setEditingSections,
  onSetStatus,
  onSetDifficulty,
  onSetTimeToComplete,
}: Props) => {
  const c = useColors();
  const f = useFonts();
  const styles = useMemo(() => makeStyles(c, f), [c, f]);

  const editing = editingSections.has('status') || editingSections.has('difficulty') || editingSections.has('time');

  const toggle = () => {
    void heavyHaptic();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setEditingSections((prev) => {
      const next = new Set(prev);
      const was = next.has('status') || next.has('difficulty') || next.has('time');
      if (was) {
        next.delete('status');
        next.delete('difficulty');
        next.delete('time');
      } else {
        next.add('status');
        next.add('difficulty');
        next.add('time');
      }
      return next;
    });
  };

  return (
    <View>
      <Pressable onLongPress={toggle} delayLongPress={350} style={styles.head}>
        <Text style={styles.label}>
          status · difficulty · time
          {editing && <Text style={styles.labelEditing}>  · editing</Text>}
        </Text>
      </Pressable>

      {editing ? (
        <View style={{ gap: 12 }}>
          <View>
            <Text style={styles.subLabel}>status</Text>
            <View style={styles.chipRow}>
              {STATUSES.map((s) => {
                const active = status === s.key;
                return (
                  <Chip
                    key={s.key}
                    label={s.label}
                    variant="meta"
                    selected={active}
                    color={active ? statusColors[s.key] : c.inkMuted}
                    onPress={() => onSetStatus(active ? null : s.key)}
                  />
                );
              })}
            </View>
          </View>
          <View>
            <Text style={styles.subLabel}>difficulty</Text>
            <View style={styles.chipRow}>
              {DIFFICULTIES.map((d) => {
                const active = difficulty === d.key;
                return (
                  <Chip
                    key={d.key}
                    label={d.label}
                    variant="meta"
                    selected={active}
                    color={active ? c.ink : c.inkMuted}
                    onPress={() =>
                      onSetDifficulty(active ? null : (d.key as 'beginner' | 'intermediate' | 'advanced'))
                    }
                  />
                );
              })}
            </View>
          </View>
          <View>
            <Text style={styles.subLabel}>time to complete</Text>
            <View style={styles.chipRow}>
              {TIMES_TO_COMPLETE.map((t) => {
                const active = timeToComplete === t.key;
                return (
                  <Chip
                    key={t.key}
                    label={t.label}
                    variant="meta"
                    selected={active}
                    color={active ? c.ink : c.inkMuted}
                    onPress={() =>
                      onSetTimeToComplete(
                        active ? null : (t.key as 'quick' | 'afternoon' | 'full_day' | 'multi_day' | 'long_term'),
                      )
                    }
                  />
                );
              })}
            </View>
          </View>
        </View>
      ) : status || difficulty || timeToComplete ? (
        <View style={styles.chipRow}>
          {status && (
            <Chip
              label={STATUSES.find((s) => s.key === status)?.label ?? status}
              variant="meta"
              selected
              color={statusColors[status] ?? c.ink}
            />
          )}
          {difficulty && (
            <Chip label={capitalize(difficulty)} variant="meta" selected color={c.ink} />
          )}
          {timeToComplete && (
            <Chip
              label={TIMES_TO_COMPLETE.find((t) => t.key === timeToComplete)?.label ?? timeToComplete}
              variant="meta"
              selected
              color={c.ink}
            />
          )}
        </View>
      ) : (
        <Text style={styles.emptyHint}>not set</Text>
      )}
    </View>
  );
};

const makeStyles = (c: Palette, f: FontSet) =>
  StyleSheet.create({
    head: { marginTop: 6, marginBottom: 2 },
    label: {
      fontSize: 11,
      letterSpacing: 1.8,
      textTransform: 'uppercase',
      color: c.inkMuted,
      marginTop: 8,
      marginBottom: 4,
    },
    labelEditing: { color: c.ink, fontWeight: '700' },
    subLabel: {
      fontSize: 10,
      letterSpacing: 1.4,
      textTransform: 'uppercase',
      color: c.inkMuted,
      marginBottom: 6,
    },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, rowGap: 8 },
    emptyHint: { fontSize: 12, color: c.inkMuted, fontStyle: 'italic' },
  });
