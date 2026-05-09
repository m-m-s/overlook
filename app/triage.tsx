import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CategoryIcon } from '@/components/CategoryIcon';
import { Chip } from '@/components/Chip';
import { GhostHint } from '@/components/GhostHint';
import { Iris } from '@/components/Iris';
import { useToast } from '@/components/Toast';
import { TriageQueues } from '@/components/TriageQueues';
import { animDuration, useReduceMotion } from '@/lib/a11y';
import { markHintSeen, wasHintSeen } from '@/lib/hints';
import { analyzeAndPersist, isAnalyzeConfigured } from '@/lib/analyze';
import { useSession } from '@/lib/auth';
import { statusColors, urgencyColors, type FontSet, type Palette } from '@/lib/colors';
import { useColors, useFonts } from '@/lib/themeContext';
import { successHaptic, tapHaptic, warnHaptic } from '@/lib/haptics';
import { capitalize, CATEGORIES, RESONANCE_LEVELS, STATUSES, URGENCIES } from '@/lib/options';
import { fetchScreenshots, updateScreenshot } from '@/lib/screenshots';
import { buildTagFromValue } from '@/lib/tagDictionary';
import type { LocalScreenshot } from '@/lib/uploads';
import { useUndoableDelete } from '@/lib/useUndoableDelete';

type QueueKey =
  | 'untagged'
  | 'incomplete'
  | 'incomplete-resonance'
  | 'incomplete-urgency'
  | 'incomplete-status'
  | 'ai-unreviewed';

const isUntagged = (it: LocalScreenshot): boolean => !it.category;
const isIncomplete = (it: LocalScreenshot): boolean =>
  Boolean(it.category) && (!it.resonance || !it.status || !it.urgency);
const isMissingResonance = (it: LocalScreenshot): boolean =>
  Boolean(it.category) && !it.resonance;
const isMissingUrgency = (it: LocalScreenshot): boolean =>
  Boolean(it.category) && !it.urgency;
const isMissingStatus = (it: LocalScreenshot): boolean =>
  Boolean(it.category) && !it.status;
// AI-unreviewed: AI populated tags but user hasn't viewed/confirmed yet.
// Now uses the schema's ai_reviewed flag (toggled true when user opens detail).
const isAiUnreviewed = (it: LocalScreenshot): boolean =>
  ((it.aiTags?.length ?? 0) > 0) && it.aiReviewed === false;

export default function TriageScreen() {
  const { session } = useSession();
  const toast = useToast();
  const [items, setItems] = useState<LocalScreenshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeQueue, setActiveQueue] = useState<QueueKey | null>(null);
  const [cursor, setCursor] = useState(0);
  const [queueIds, setQueueIds] = useState<string[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [showActionsHint, setShowActionsHint] = useState(false);
  const { remove: undoableRemove } = useUndoableDelete(setItems);
  const reduceMotion = useReduceMotion();
  const insets = useSafeAreaInsets();
  const cardOpacity = useRef(new Animated.Value(1)).current;
  const cardSlide = useRef(new Animated.Value(0)).current;
  const c = useColors();
  const f = useFonts();
  const styles = useMemo(() => makeStyles(c, f), [c, f]);

  useEffect(() => {
    if (!session) return;
    void fetchScreenshots().then((rows) => {
      setItems(rows);
      setLoading(false);
    });
  }, [session]);

  // Hardware back inside a queue should exit the queue back to the entry
  // screen — not pop the navigator (which would lose progress).
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (activeQueue) {
        setActiveQueue(null);
        setCursor(0);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [activeQueue]);

  const counts = useMemo(
    () => ({
      untagged: items.filter(isUntagged).length,
      incomplete: items.filter(isIncomplete).length,
      'incomplete-resonance': items.filter(isMissingResonance).length,
      'incomplete-urgency': items.filter(isMissingUrgency).length,
      'incomplete-status': items.filter(isMissingStatus).length,
      'ai-unreviewed': items.filter(isAiUnreviewed).length,
    }),
    [items],
  );

  // queueItems is derived from the FROZEN queueIds set (snapshotted on entry).
  // We do NOT re-filter live as the user tags fields — otherwise the current
  // card can disappear out from under them mid-tagging when a single-field
  // change makes them no longer match the queue's predicate.
  const queueItems = useMemo<LocalScreenshot[]>(() => {
    if (!activeQueue) return [];
    const byId = new Map(items.map((it) => [it.id, it]));
    return queueIds.map((id) => byId.get(id)).filter(Boolean) as LocalScreenshot[];
  }, [activeQueue, items, queueIds]);

  const current = queueItems[cursor];
  const total = queueItems.length;

  const enterQueue = (q: QueueKey) => {
    let snapshot: LocalScreenshot[] = [];
    if (q === 'untagged') snapshot = items.filter(isUntagged);
    else if (q === 'incomplete') snapshot = items.filter(isIncomplete);
    else if (q === 'incomplete-resonance') snapshot = items.filter(isMissingResonance);
    else if (q === 'incomplete-urgency') snapshot = items.filter(isMissingUrgency);
    else if (q === 'incomplete-status') snapshot = items.filter(isMissingStatus);
    else if (q === 'ai-unreviewed') snapshot = items.filter(isAiUnreviewed);
    setQueueIds(snapshot.map((it) => it.id));
    setActiveQueue(q);
    setCursor(0);
    // First-card hint: telegraph the action bar with three labeled arrows.
    void (async () => {
      if (!(await wasHintSeen('triage-first-card'))) {
        setShowActionsHint(true);
        await markHintSeen('triage-first-card');
      }
    })();
  };

  const exitQueue = () => {
    setActiveQueue(null);
    setQueueIds([]);
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
        toast.show(`Done with ${activeQueue} ✓`);
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

  const patchCurrent = async (patch: Partial<LocalScreenshot>) => {
    if (!current) return;
    const id = current.id;
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
    const dbPatch: Record<string, unknown> = {};
    if ('category' in patch) dbPatch.category = patch.category;
    if ('categories' in patch) {
      dbPatch.categories = patch.categories;
      // Keep singular `category` in sync with categories[0] for legacy display
      // (corner icon uses single category) until that's fully migrated.
      dbPatch.category = patch.categories?.[0] ?? null;
    }
    if ('urgency' in patch) dbPatch.urgency = patch.urgency;
    if ('status' in patch) dbPatch.status = patch.status;
    if ('resonance' in patch) dbPatch.resonance = patch.resonance;
    const { error } = await updateScreenshot(
      id,
      dbPatch as Parameters<typeof updateScreenshot>[1],
    );
    if (error) toast.error(`Save failed: ${error.slice(0, 80)}`);
  };

  const toggleCategory = (cat: string) => {
    if (!current) return;
    const existing = current.categories && current.categories.length > 0
      ? current.categories
      : current.category ? [current.category] : [];
    const next = existing.includes(cat)
      ? existing.filter((x) => x !== cat)
      : [...existing, cat];
    void patchCurrent({ categories: next, category: next[0] ?? null });
  };

  const onDelete = () => {
    if (!current) return;
    warnHaptic();
    const deletedId = current.id;
    undoableRemove(current);
    setQueueIds((ids) => ids.filter((id) => id !== deletedId));
    advance();
  };

  const onSave = () => {
    successHaptic();
    advance();
  };

  const onSkip = () => {
    tapHaptic();
    advance();
  };

  // Swipe gestures on the card image per spec:
  //   swipe right → save and next
  //   swipe left  → skip and next
  //   swipe up    → delete
  //
  // Stable refs to avoid the temporal-dead-zone bug we hit with empty-deps
  // useMemo: if the gesture is created before the const handlers are
  // initialized, the closure captures unbound names. Using refs that we
  // update in the effect below decouples gesture creation from handler
  // declaration order entirely.
  const onSaveRef = useRef(onSave);
  const onSkipRef = useRef(onSkip);
  const onDeleteRef = useRef(onDelete);
  onSaveRef.current = onSave;
  onSkipRef.current = onSkip;
  onDeleteRef.current = onDelete;

  const cardSwipe = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-20, 20])
        .activeOffsetY([-20, 20])
        .runOnJS(true)
        .onEnd((e) => {
          const tx = e.translationX;
          const ty = e.translationY;
          const horizontal = Math.abs(tx) > Math.abs(ty);
          if (horizontal) {
            if (tx > 80) onSaveRef.current();
            else if (tx < -80) onSkipRef.current();
          } else {
            if (ty < -80) onDeleteRef.current();
          }
        }),
    [],
  );

  const onAnalyze = async () => {
    if (!current || analyzing) return;
    tapHaptic();
    setAnalyzing(true);
    try {
      const patch = await analyzeAndPersist(current.uri, current.id, current.deviceAssetId ?? undefined);
      if (patch) {
        setItems((prev) => prev.map((it) => (it.id === current.id ? { ...it, ...patch } : it)));
        successHaptic();
        toast.show('Analyzed ✓');
      } else {
        toast.error('AI analyze failed — try again later.');
      }
    } finally {
      setAnalyzing(false);
    }
  };

  const onCommitTag = async () => {
    const v = tagInput.trim();
    if (!current || !v) return;
    tapHaptic();
    const tag = await buildTagFromValue(v);
    const t = 'ambiguous' in tag ? { value: tag.value } : tag;
    const existing = current.manualTags ?? [];
    const updated = [...existing, t];
    setItems((prev) => prev.map((it) => (it.id === current.id ? { ...it, manualTags: updated } : it)));
    setTagInput('');
    const { error } = await updateScreenshot(current.id, { manual_typed_tags: updated });
    if (error) toast.error(`Save failed: ${error.slice(0, 80)}`);
  };

  // ---- RENDER ----

  if (!session) {
    return null;
  }

  if (loading) {
    return (
      <View style={[styles.center, { flex: 1 }]}>
        <Iris level={3} size={36} color={c.ink} spinning />
      </View>
    );
  }

  if (!activeQueue) {
    return (
      <TriageQueues
        counts={counts}
        totalItems={items.length}
        onEnterQueue={enterQueue}
        onBack={() => router.back()}
      />
    );
  }

  // Per-item view
  if (!current) {
    return (
      <View style={[styles.center, { flex: 1 }]}>
        <Text style={styles.title}>Nothing here</Text>
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
          <Ionicons name="close" size={22} color={c.ink} />
        </Pressable>
        <Text style={styles.swipeProgress}>
          {cursor + 1} / {total}
        </Text>
        <Pressable
          onPress={() => setShowActionsHint(true)}
          hitSlop={12}
          style={styles.backBtn}
          accessibilityLabel="Show triage hints"
        >
          <Ionicons name="help-circle-outline" size={22} color={c.inkMuted} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View style={{ opacity: cardOpacity, transform: [{ translateX: cardSlide }] }}>
          {/* Image is the swipe surface — right=save, left=skip, up=delete.
              Buttons below still work as a discoverable fallback. */}
          <GestureDetector gesture={cardSwipe}>
            <Image source={{ uri: current.uri }} style={styles.image} contentFit="contain" />
          </GestureDetector>

          {/* Analyze with AI — only for cards that haven't been analyzed yet
              and aren't local-only. Lets the user retry an upload that
              succeeded but skipped/failed AI analysis. */}
          {(current.aiTags?.length ?? 0) === 0 && !current.localOnly && isAnalyzeConfigured && (
            <View style={styles.fieldRow}>
              <Pressable
                onPress={onAnalyze}
                disabled={analyzing}
                style={[styles.analyzeBtn, analyzing && { opacity: 0.5 }]}
              >
                <Ionicons name="sparkles" size={14} color={c.parchment} />
                <Text style={styles.analyzeBtnText}>
                  {analyzing ? 'Analyzing…' : 'Analyze with AI'}
                </Text>
              </Pressable>
            </View>
          )}

        {/* Show only the fields that need attention for this queue */}
        {activeQueue === 'untagged' && (
          <FieldRow label="category">
            {CATEGORIES.map((cat) => {
              const cats = current.categories && current.categories.length > 0
                ? current.categories
                : current.category ? [current.category] : [];
              const active = cats.includes(cat);
              return (
                <Chip
                  key={cat}
                  label={capitalize(cat)}
                  variant="meta"
                  selected={active}
                  color={active ? c.ink : c.inkMuted}
                  onPress={() => toggleCategory(cat)}
                  leading={
                    <CategoryIcon
                      category={cat}
                      size={14}
                      color={active ? c.parchment : c.inkMuted}
                    />
                  }
                />
              );
            })}
          </FieldRow>
        )}

          {/* Manual tag input — slotted directly under category since
              "tag this thing" reads as a follow-on to picking the
              category. Auto-types via dictionary per spec. */}
          {activeQueue === 'untagged' && (
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>add tag</Text>
              <View style={styles.tagInputRow}>
                <TextInput
                  value={tagInput}
                  onChangeText={setTagInput}
                  onSubmitEditing={onCommitTag}
                  placeholder="e.g. Anton, gift idea"
                  placeholderTextColor={c.inkMuted}
                  autoCapitalize="none"
                  returnKeyType="done"
                  style={styles.tagInput}
                />
                <Pressable
                  onPress={onCommitTag}
                  disabled={!tagInput.trim()}
                  style={[styles.tagAddBtn, !tagInput.trim() && { opacity: 0.4 }]}
                >
                  <Text style={styles.tagAddBtnText}>add</Text>
                </Pressable>
              </View>
              {(current.manualTags?.length ?? 0) > 0 && (
                <View style={[styles.chips, { marginTop: 8 }]}>
                  {current.manualTags!.map((t, i) => (
                    <Chip
                      key={`${t.value}-${i}`}
                      label={t.value}
                      variant="manual"
                      selected
                      color={c.ink}
                    />
                  ))}
                </View>
              )}
            </View>
          )}

        {(activeQueue === 'untagged' ||
          activeQueue === 'incomplete' ||
          activeQueue === 'incomplete-resonance' ||
          activeQueue === 'ai-unreviewed') && (
          <FieldRow label="resonance">
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {RESONANCE_LEVELS.map((r) => {
                const active = current.resonance === r;
                return (
                  <Pressable
                    key={r}
                    onPress={() => {
                      tapHaptic();
                      patchCurrent({ resonance: active ? null : r });
                    }}
                    style={[styles.irisBtn, active && styles.irisBtnActive]}
                  >
                    <Iris level={r} size={22} color={c.ink} filled={active} />
                  </Pressable>
                );
              })}
            </View>
          </FieldRow>
        )}

        {(activeQueue === 'untagged' ||
          activeQueue === 'incomplete' ||
          activeQueue === 'incomplete-urgency' ||
          activeQueue === 'ai-unreviewed') && (
          <FieldRow label="urgency">
            {URGENCIES.map((u) => {
              const active = current.urgency === u.key;
              return (
                <Chip
                  key={u.key}
                  label={u.label}
                  variant="meta"
                  selected={active}
                  color={active ? (urgencyColors[u.key] ?? c.ink) : c.inkMuted}
                  onPress={() => patchCurrent({ urgency: active ? null : u.key })}
                />
              );
            })}
          </FieldRow>
        )}

        {(activeQueue === 'untagged' ||
          activeQueue === 'incomplete' ||
          activeQueue === 'incomplete-status') && (
          <FieldRow label="status">
            {STATUSES.map((s) => {
              const active = current.status === s.key;
              return (
                <Chip
                  key={s.key}
                  label={s.label}
                  variant="meta"
                  selected={active}
                  color={active ? (statusColors[s.key] ?? c.ink) : c.inkMuted}
                  onPress={() => patchCurrent({ status: active ? null : s.key })}
                />
              );
            })}
          </FieldRow>
        )}
        </Animated.View>
      </ScrollView>

      {/* Action bar */}
      <View style={[styles.actions, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable onPress={onDelete} style={[styles.actionBtn, styles.deleteBtn]}>
          <Ionicons name="trash-outline" size={18} color="#C0392B" />
          <Text style={[styles.actionText, { color: '#C0392B' }]}>Delete</Text>
        </Pressable>
        <Pressable onPress={onSkip} style={[styles.actionBtn, styles.skipBtn]}>
          <Ionicons name="arrow-forward" size={18} color={c.inkMuted} />
          <Text style={[styles.actionText, { color: c.inkMuted }]}>Skip</Text>
        </Pressable>
        <Pressable onPress={onSave} style={[styles.actionBtn, styles.saveBtn]}>
          <Ionicons name="checkmark" size={18} color={c.parchment} />
          <Text style={[styles.actionText, { color: c.parchment }]}>Save</Text>
        </Pressable>
      </View>

      <GhostHint
        visible={showActionsHint}
        variant="triage-actions"
        label="Tap Save · Skip · Delete"
        topOffset="35%"
        onDismiss={() => setShowActionsHint(false)}
      />
    </View>
  );
}

const FieldRow = ({ label, children }: { label: string; children: React.ReactNode }) => {
  const c = useColors();
  const f = useFonts();
  const styles = useMemo(() => makeStyles(c, f), [c, f]);
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {children}
      </ScrollView>
    </View>
  );
};

const makeStyles = (c: Palette, f: FontSet) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.parchment },
    center: { alignItems: 'center', justifyContent: 'center', backgroundColor: c.parchment },
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
      color: c.inkMuted,
    },
    backBtn: { padding: 4 },
    title: { fontFamily: f.displayMedium, fontSize: 26, color: c.ink, letterSpacing: -0.4 },
    image: {
      width: '100%',
      height: 380,
      backgroundColor: c.divider,
      marginVertical: 12,
    },
    fieldRow: { paddingHorizontal: 20, paddingVertical: 10 },
    fieldLabel: {
      fontSize: 11,
      letterSpacing: 1.6,
      textTransform: 'uppercase',
      color: c.inkMuted,
      marginBottom: 8,
    },
    chips: { flexDirection: 'row', gap: 6 },
    irisBtn: {
      width: 44,
      height: 44,
      borderWidth: 1,
      borderColor: c.ink,
      borderRadius: 4,
      alignItems: 'center',
      justifyContent: 'center',
    },
    irisBtnActive: { borderWidth: 2 },
    analyzeBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'flex-start',
      gap: 6,
      paddingVertical: 10,
      paddingHorizontal: 14,
      backgroundColor: c.ink,
      borderRadius: 4,
    },
    analyzeBtnText: {
      color: c.parchment,
      fontSize: 13,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      fontWeight: '600',
    },
    tagInputRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    tagInput: {
      flex: 1,
      fontSize: 14,
      color: c.ink,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: c.inkMuted,
      borderRadius: 4,
    },
    tagAddBtn: {
      paddingVertical: 10,
      paddingHorizontal: 14,
      backgroundColor: c.ink,
      borderRadius: 4,
    },
    tagAddBtnText: {
      color: c.parchment,
      fontSize: 12,
      letterSpacing: 1.0,
      textTransform: 'uppercase',
      fontWeight: '600',
    },
    actions: {
      flexDirection: 'row',
      gap: 8,
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 24,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: c.divider,
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
    skipBtn: { borderWidth: 1, borderColor: c.inkMuted },
    saveBtn: { backgroundColor: c.ink },
    actionText: { fontSize: 12, letterSpacing: 1.4, textTransform: 'uppercase', fontWeight: '600' },
    btn: { paddingHorizontal: 24, paddingVertical: 14, borderRadius: 4 },
    btnPrimary: { backgroundColor: c.ink },
    btnPrimaryText: {
      color: c.parchment,
      fontSize: 13,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      fontWeight: '600',
    },
  });
