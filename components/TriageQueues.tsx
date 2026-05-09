import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Iris } from './Iris';
import type { FontSet, Palette } from '@/lib/colors';
import { useColors, useFonts } from '@/lib/themeContext';

export type QueueKey =
  | 'untagged'
  | 'incomplete'
  | 'incomplete-resonance'
  | 'incomplete-urgency'
  | 'incomplete-status'
  | 'ai-unreviewed';

export type QueueCounts = Record<QueueKey, number>;

type Props = {
  counts: QueueCounts;
  /** Total count of all screenshots — drives the "all caught up" view
   *  (only show when items exist but all queues are zero). */
  totalItems: number;
  onEnterQueue: (q: QueueKey) => void;
  onBack: () => void;
};

/**
 * Triage entry view — three queues (untagged, incomplete, ai-unreviewed).
 * Tapping incomplete expands to three sub-queues (no resonance / no
 * urgency / no status). Tapping a top-level queue or a sub-queue starts
 * the swipe flow via onEnterQueue(key).
 */
export const TriageQueues = ({ counts, totalItems, onEnterQueue, onBack }: Props) => {
  const c = useColors();
  const f = useFonts();
  const styles = useMemo(() => makeStyles(c, f), [c, f]);
  const [incompleteExpanded, setIncompleteExpanded] = useState(false);

  const allCaughtUp =
    counts.untagged === 0 && counts.incomplete === 0 && counts['ai-unreviewed'] === 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onBack} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={c.ink} />
        </Pressable>
        <Text style={styles.title}>Triage</Text>
      </View>

      {allCaughtUp && totalItems > 0 && (
        <View style={styles.caughtUp}>
          <Iris level={3} size={36} color={c.ink} />
          <Text style={styles.caughtUpTitle}>All caught up</Text>
          <Text style={styles.caughtUpSub}>Nothing to triage right now</Text>
        </View>
      )}

      <View style={{ paddingHorizontal: 20, marginTop: 20 }}>
        <QueueRow
          label="untagged"
          hint="needs everything"
          count={counts.untagged}
          disabled={counts.untagged === 0}
          onPress={() => onEnterQueue('untagged')}
        />
        <QueueRow
          label="incomplete"
          hint={
            incompleteExpanded
              ? 'pick a sub-queue'
              : 'missing resonance, urgency, or status'
          }
          count={counts.incomplete}
          disabled={counts.incomplete === 0}
          chevron={incompleteExpanded ? 'chevron-down' : 'chevron-forward'}
          onPress={() => setIncompleteExpanded((v) => !v)}
        />
        {incompleteExpanded && (
          <View style={styles.subQueues}>
            <QueueRow
              label="no resonance"
              hint="iris not set"
              count={counts['incomplete-resonance']}
              disabled={counts['incomplete-resonance'] === 0}
              onPress={() => onEnterQueue('incomplete-resonance')}
              indent
            />
            <QueueRow
              label="no urgency"
              hint="when-to-act not set"
              count={counts['incomplete-urgency']}
              disabled={counts['incomplete-urgency'] === 0}
              onPress={() => onEnterQueue('incomplete-urgency')}
              indent
            />
            <QueueRow
              label="no status"
              hint="ready / supplies / done not set"
              count={counts['incomplete-status']}
              disabled={counts['incomplete-status'] === 0}
              onPress={() => onEnterQueue('incomplete-status')}
              indent
            />
          </View>
        )}
        <QueueRow
          label="AI unreviewed"
          hint="AI tagged but you haven't confirmed"
          count={counts['ai-unreviewed']}
          disabled={counts['ai-unreviewed'] === 0}
          onPress={() => onEnterQueue('ai-unreviewed')}
        />
      </View>
    </View>
  );
};

const QueueRow = ({
  label,
  hint,
  count,
  disabled,
  onPress,
  indent,
  chevron = 'chevron-forward',
}: {
  label: string;
  hint: string;
  count: number;
  disabled?: boolean;
  onPress: () => void;
  indent?: boolean;
  chevron?: React.ComponentProps<typeof Ionicons>['name'];
}) => {
  const c = useColors();
  const f = useFonts();
  const styles = useMemo(() => makeStyles(c, f), [c, f]);
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={[
        styles.queueRow,
        indent && styles.queueRowIndent,
        disabled && { opacity: 0.4 },
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.queueLabel, indent && styles.queueLabelIndent]}>{label}</Text>
        <Text style={styles.queueHint}>{hint}</Text>
      </View>
      <Text style={[styles.queueCount, indent && { fontSize: 22 }]}>{count}</Text>
      <Ionicons name={chevron} size={18} color={c.inkMuted} />
    </Pressable>
  );
};

const makeStyles = (c: Palette, f: FontSet) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.parchment },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingTop: 56,
      paddingHorizontal: 20,
      paddingBottom: 12,
      gap: 12,
    },
    backBtn: { padding: 4 },
    title: { fontFamily: f.displayMedium, fontSize: 26, color: c.ink, letterSpacing: -0.4 },
    caughtUp: {
      alignItems: 'center',
      paddingTop: 60,
      paddingBottom: 24,
      gap: 8,
    },
    caughtUpTitle: {
      fontFamily: f.displayMedium,
      fontSize: 26,
      color: c.ink,
      marginTop: 18,
      letterSpacing: -0.4,
    },
    caughtUpSub: {
      fontFamily: f.italic,
      fontSize: 14,
      color: c.inkSoft,
      textAlign: 'center',
      marginTop: 4,
    },
    queueRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 18,
      borderBottomWidth: 2,
      borderStyle: 'dashed',
      borderColor: c.divider,
      gap: 12,
    },
    queueRowIndent: { paddingLeft: 16, paddingVertical: 12 },
    queueLabelIndent: { fontSize: 16 },
    subQueues: { marginLeft: 4 },
    queueLabel: { fontFamily: f.displayMedium, fontSize: 18, color: c.ink },
    queueHint: { fontSize: 11, color: c.inkMuted, marginTop: 4 },
    queueCount: { fontFamily: f.displayMedium, fontSize: 28, color: c.ink },
  });
