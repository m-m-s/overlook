import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Chip } from '@/components/Chip';
import { Iris } from '@/components/Iris';
import { useToast } from '@/components/Toast';
import { animDuration, useReduceMotion } from '@/lib/a11y';
import { useSession } from '@/lib/auth';
import { colors, statusColors, urgencyColors } from '@/lib/colors';
import { CATEGORIES, RESONANCE_LEVELS, STATUSES, URGENCIES } from '@/lib/options';
import { fetchScreenshots, updateScreenshot } from '@/lib/screenshots';
import type { LocalScreenshot } from '@/lib/uploads';
import { useUndoableDelete } from '@/lib/useUndoableDelete';

type QueueKey = 'untagged' | 'incomplete' | 'ai-unreviewed';

const isUntagged = (it: LocalScreenshot): boolean => !it.category;
const isIncomplete = (it: LocalScreenshot): boolean =>
  Boolean(it.category) && (!it.resonance || !it.status || !it.urgency);
// AI-unreviewed: AI populated tags but user hasn't confirmed yet. We don't
// currently fetch ai_reviewed on the row, so use a heuristic: has AI tags
// AND no manual category override (user hasn't touched it).
const isAiUnreviewed = (it: LocalScreenshot): boolean =>
  ((it.aiTags?.length ?? 0) > 0) && !it.resonance;

export default function TriageScreen() {
  const { session } = useSession();
  const toast = useToast();
  const [items, setItems] = useState<LocalScreenshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeQueue, setActiveQueue] = useState<QueueKey | null>(null);
  const [cursor, setCursor] = useState(0);
  const { remove: undoableRemove } = useUndoableDelete(setItems);
  const reduceMotion = useReduceMotion();
  const cardOpacity = useRef(new Animated.Value(1)).current;
  const cardSlide = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!session) return;
    void fetchScreenshots().then((rows) => {
      setItems(rows);
      setLoading(false);
    });
  }, [session]);

  const counts = useMemo(
    () => ({
      untagged: items.filter(isUntagged).length,
      incomplete: items.filter(isIncomplete).length,
      'ai-unreviewed': items.filter(isAiUnreviewed).length,
    }),
    [items],
  );

  const queueItems = useMemo<LocalScreenshot[]>(() => {
    if (!activeQueue) return [];
    if (activeQueue === 'untagged') return items.filter(isUntagged);
    if (activeQueue === 'incomplete') return items.filter(isIncomplete);
    return items.filter(isAiUnreviewed);
  }, [activeQueue, items]);

  const current = queueItems[cursor];
  const total = queueItems.length;

  const enterQueue = (q: QueueKey) => {
    setActiveQueue(q);
    setCursor(0);
  };

  const exitQueue = () => {
    setActiveQueue(null);
    setCursor(0);
  };

  const advance = () => {
    // Slide-out + fade, then change cursor + slide-in + fade. Smoother than
    // an instant jump between cards.
    const dur = animDuration(160, reduceMotion);
    Animated.parallel([
      Animated.timing(cardOpacity, { toValue: 0, duration: dur, useNativeDriver: true }),
      Animated.timing(cardSlide, { toValue: -40, duration: dur, useNativeDriver: true }),
    ]).start(() => {
      if (cursor + 1 >= total) {
        toast.show(`done with ${activeQueue} ✓`);
        exitQueue();
        cardOpacity.setValue(1);
        cardSlide.setValue(0);
        return;
      }
      setCursor((c) => c + 1);
      cardSlide.setValue(40);
      Animated.parallel([
        Animated.timing(cardOpacity, { toValue: 1, duration: dur, useNativeDriver: true }),
        Animated.timing(cardSlide, { toValue: 0, duration: dur, useNativeDriver: true }),
      ]).start();
    });
  };

  const patchCurrent = (patch: Partial<LocalScreenshot>) => {
    if (!current) return;
    const id = current.id;
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
    // Map to DB column names
    const dbPatch: Record<string, unknown> = {};
    if ('category' in patch) dbPatch.category = patch.category;
    if ('urgency' in patch) dbPatch.urgency = patch.urgency;
    if ('status' in patch) dbPatch.status = patch.status;
    if ('resonance' in patch) dbPatch.resonance = patch.resonance;
    void updateScreenshot(id, dbPatch as Parameters<typeof updateScreenshot>[1]);
  };

  const onDelete = () => {
    if (!current) return;
    undoableRemove(current);
    advance();
  };

  // ---- RENDER ----

  if (!session) {
    return null;
  }

  if (loading) {
    return (
      <View style={[styles.center, { flex: 1 }]}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  // Entry screen — queue selection
  if (!activeQueue) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
            <Ionicons name="arrow-back" size={22} color={colors.ink} />
          </Pressable>
          <Text style={styles.title}>triage</Text>
        </View>

        <View style={{ paddingHorizontal: 20, marginTop: 20 }}>
          <QueueRow
            label="untagged"
            hint="needs everything"
            count={counts.untagged}
            disabled={counts.untagged === 0}
            onPress={() => enterQueue('untagged')}
          />
          <QueueRow
            label="incomplete"
            hint="missing resonance, urgency, or status"
            count={counts.incomplete}
            disabled={counts.incomplete === 0}
            onPress={() => enterQueue('incomplete')}
          />
          <QueueRow
            label="AI unreviewed"
            hint="AI tagged but you haven't confirmed"
            count={counts['ai-unreviewed']}
            disabled={counts['ai-unreviewed'] === 0}
            onPress={() => enterQueue('ai-unreviewed')}
          />
        </View>
      </View>
    );
  }

  // Per-item view
  if (!current) {
    return (
      <View style={[styles.center, { flex: 1 }]}>
        <Text style={styles.title}>nothing here</Text>
        <Pressable onPress={exitQueue} style={[styles.btn, styles.btnPrimary, { marginTop: 18 }]}>
          <Text style={styles.btnPrimaryText}>back to triage</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.swipeHeader}>
        <Pressable onPress={exitQueue} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="close" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.swipeProgress}>
          {cursor + 1} / {total}
        </Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        <Animated.View style={{ opacity: cardOpacity, transform: [{ translateX: cardSlide }] }}>
          <Image source={{ uri: current.uri }} style={styles.image} contentFit="contain" />

        {/* Show only the fields that need attention for this queue */}
        {activeQueue === 'untagged' && (
          <FieldRow label="category">
            {CATEGORIES.map((c) => (
              <Chip
                key={c}
                label={c}
                variant="meta"
                selected={current.category === c}
                color={current.category === c ? colors.ink : colors.inkMuted}
                onPress={() => patchCurrent({ category: c })}
              />
            ))}
          </FieldRow>
        )}

        {(activeQueue === 'incomplete' || activeQueue === 'ai-unreviewed') && !current.resonance && (
          <FieldRow label="resonance">
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {RESONANCE_LEVELS.map((r) => (
                <Pressable
                  key={r}
                  onPress={() => patchCurrent({ resonance: r })}
                  style={styles.irisBtn}
                >
                  <Iris level={r} size={22} color={colors.ink} />
                </Pressable>
              ))}
            </View>
          </FieldRow>
        )}

        {(activeQueue === 'incomplete' || activeQueue === 'ai-unreviewed') && !current.urgency && (
          <FieldRow label="urgency">
            {URGENCIES.map((u) => (
              <Chip
                key={u.key}
                label={u.label}
                variant="meta"
                color={urgencyColors[u.key] ?? colors.inkMuted}
                onPress={() => patchCurrent({ urgency: u.key })}
              />
            ))}
          </FieldRow>
        )}

        {activeQueue === 'incomplete' && !current.status && (
          <FieldRow label="status">
            {STATUSES.map((s) => (
              <Chip
                key={s.key}
                label={s.label}
                variant="meta"
                color={statusColors[s.key] ?? colors.inkMuted}
                onPress={() => patchCurrent({ status: s.key })}
              />
            ))}
          </FieldRow>
        )}
        </Animated.View>
      </ScrollView>

      {/* Action bar */}
      <View style={styles.actions}>
        <Pressable onPress={onDelete} style={[styles.actionBtn, styles.deleteBtn]}>
          <Ionicons name="trash-outline" size={18} color="#C0392B" />
          <Text style={[styles.actionText, { color: '#C0392B' }]}>delete</Text>
        </Pressable>
        <Pressable onPress={advance} style={[styles.actionBtn, styles.skipBtn]}>
          <Ionicons name="arrow-forward" size={18} color={colors.inkMuted} />
          <Text style={[styles.actionText, { color: colors.inkMuted }]}>skip</Text>
        </Pressable>
        <Pressable onPress={advance} style={[styles.actionBtn, styles.saveBtn]}>
          <Ionicons name="checkmark" size={18} color={colors.parchment} />
          <Text style={[styles.actionText, { color: colors.parchment }]}>save & next</Text>
        </Pressable>
      </View>
    </View>
  );
}

const QueueRow = ({
  label,
  hint,
  count,
  disabled,
  onPress,
}: {
  label: string;
  hint: string;
  count: number;
  disabled?: boolean;
  onPress: () => void;
}) => (
  <Pressable
    onPress={disabled ? undefined : onPress}
    style={[styles.queueRow, disabled && { opacity: 0.4 }]}
  >
    <View style={{ flex: 1 }}>
      <Text style={styles.queueLabel}>{label}</Text>
      <Text style={styles.queueHint}>{hint}</Text>
    </View>
    <Text style={styles.queueCount}>{count}</Text>
    <Ionicons name="chevron-forward" size={18} color={colors.inkMuted} />
  </Pressable>
);

const FieldRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <View style={styles.fieldRow}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {children}
    </ScrollView>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.parchment },
  center: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.parchment },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 12,
    gap: 12,
  },
  swipeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  swipeProgress: {
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.inkMuted,
  },
  backBtn: { padding: 4 },
  title: { fontFamily: 'Georgia', fontSize: 26, color: colors.ink, letterSpacing: -0.4 },
  queueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
    borderBottomWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.divider,
    gap: 12,
  },
  queueLabel: { fontFamily: 'Georgia', fontSize: 18, color: colors.ink },
  queueHint: { fontSize: 11, color: colors.inkMuted, marginTop: 4 },
  queueCount: { fontFamily: 'Georgia', fontSize: 28, color: colors.ink },
  image: {
    width: '100%',
    height: 380,
    backgroundColor: colors.divider,
    marginVertical: 12,
  },
  fieldRow: { paddingHorizontal: 20, paddingVertical: 10 },
  fieldLabel: {
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: colors.inkMuted,
    marginBottom: 8,
  },
  chips: { flexDirection: 'row', gap: 6 },
  irisBtn: {
    width: 44,
    height: 44,
    borderWidth: 1,
    borderColor: colors.ink,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.divider,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 4,
    gap: 6,
  },
  deleteBtn: { borderWidth: 1, borderColor: '#C0392B' },
  skipBtn: { borderWidth: 1, borderColor: colors.inkMuted },
  saveBtn: { backgroundColor: colors.ink },
  actionText: { fontSize: 12, letterSpacing: 1.4, textTransform: 'uppercase', fontWeight: '600' },
  btn: { paddingHorizontal: 24, paddingVertical: 14, borderRadius: 4 },
  btnPrimary: { backgroundColor: colors.ink },
  btnPrimaryText: {
    color: colors.parchment,
    fontSize: 13,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
});
