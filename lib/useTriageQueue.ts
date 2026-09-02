import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated } from 'react-native';
import { Gesture } from 'react-native-gesture-handler';
import { analyzeAndPersist, isAnalyzeConfigured } from './analyze';
import { useSession } from './auth';
import { computeUrgencyDate, effectiveUrgencyKey } from './urgency';
import { successHaptic, tapHaptic, warnHaptic } from './haptics';
import { markHintSeen, wasHintSeen } from './hints';
import { fetchScreenshots, updateScreenshot } from './screenshots';
import { buildTagFromValue } from './tagDictionary';
import { animDuration, useReduceMotion } from './a11y';
import { useToast } from '@/components/Toast';
import { useUndoableDelete } from './useUndoableDelete';
import type { LocalScreenshot } from './uploads';

export type QueueKey =
  | 'overdue'
  | 'untagged'
  | 'incomplete'
  | 'incomplete-resonance'
  | 'incomplete-urgency'
  | 'incomplete-status'
  | 'ai-unreviewed';

const isOverdue = (it: LocalScreenshot) => effectiveUrgencyKey(it) === 'overdue';
const isUntagged = (it: LocalScreenshot) => !it.category;
const isIncomplete = (it: LocalScreenshot) =>
  Boolean(it.category) && (!it.resonance || !it.status || !it.urgency);
const isMissingResonance = (it: LocalScreenshot) => Boolean(it.category) && !it.resonance;
const isMissingUrgency = (it: LocalScreenshot) => Boolean(it.category) && !it.urgency;
const isMissingStatus = (it: LocalScreenshot) => Boolean(it.category) && !it.status;
const isAiUnreviewed = (it: LocalScreenshot) =>
  ((it.aiTags?.length ?? 0) > 0) && it.aiReviewed === false;

export const useTriageQueue = () => {
  const { session } = useSession();
  const toast = useToast();
  const reduceMotion = useReduceMotion();

  const [items, setItems] = useState<LocalScreenshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeQueue, setActiveQueue] = useState<QueueKey | null>(null);
  const [cursor, setCursor] = useState(0);
  const [queueIds, setQueueIds] = useState<string[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [showActionsHint, setShowActionsHint] = useState(false);

  const cardOpacity = useRef(new Animated.Value(1)).current;
  const cardSlide = useRef(new Animated.Value(0)).current;

  const { remove: removeItem } = useUndoableDelete(setItems);

  useEffect(() => {
    if (!session) return;
    void fetchScreenshots().then((rows) => {
      setItems(rows);
      setLoading(false);
    });
  }, [session]);

  const counts = useMemo(
    () => ({
      overdue: items.filter(isOverdue).length,
      untagged: items.filter(isUntagged).length,
      incomplete: items.filter(isIncomplete).length,
      'incomplete-resonance': items.filter(isMissingResonance).length,
      'incomplete-urgency': items.filter(isMissingUrgency).length,
      'incomplete-status': items.filter(isMissingStatus).length,
      'ai-unreviewed': items.filter(isAiUnreviewed).length,
    }),
    [items],
  );

  const queueItems = useMemo<LocalScreenshot[]>(() => {
    if (!activeQueue) return [];
    const byId = new Map(items.map((it) => [it.id, it]));
    return queueIds.map((id) => byId.get(id)).filter(Boolean) as LocalScreenshot[];
  }, [activeQueue, items, queueIds]);

  const current = queueItems[cursor];
  const total = queueItems.length;

  const exitQueue = () => {
    setActiveQueue(null);
    setQueueIds([]);
    setCursor(0);
  };

  const advance = () => {
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

  const enterQueue = (q: QueueKey) => {
    const predicates: Record<QueueKey, (it: LocalScreenshot) => boolean> = {
      overdue: isOverdue, untagged: isUntagged, incomplete: isIncomplete,
      'incomplete-resonance': isMissingResonance, 'incomplete-urgency': isMissingUrgency,
      'incomplete-status': isMissingStatus, 'ai-unreviewed': isAiUnreviewed,
    };
    const snapshot = items.filter(predicates[q]);
    setQueueIds(snapshot.map((it) => it.id));
    setActiveQueue(q);
    setCursor(0);
    void (async () => {
      if (!(await wasHintSeen('triage-first-card'))) {
        setShowActionsHint(true);
        await markHintSeen('triage-first-card');
      }
    })();
  };

  const patchCurrent = async (patch: Partial<LocalScreenshot>) => {
    if (!current) return;
    const id = current.id;
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
    const dbPatch: Record<string, unknown> = {};
    if ('category' in patch) dbPatch.category = patch.category;
    if ('categories' in patch) {
      dbPatch.categories = patch.categories;
      dbPatch.category = patch.categories?.[0] ?? null;
    }
    if ('urgency' in patch) dbPatch.urgency = patch.urgency;
    if ('urgencyDate' in patch) dbPatch.urgency_date = patch.urgencyDate;
    if ('status' in patch) dbPatch.status = patch.status;
    if ('resonance' in patch) dbPatch.resonance = patch.resonance;
    const { error } = await updateScreenshot(id, dbPatch as Parameters<typeof updateScreenshot>[1]);
    if (error) toast.error(`Save failed: ${error.slice(0, 80)}`);
  };

  const toggleCategory = (cat: string) => {
    if (!current) return;
    const existing = current.categories?.length ? current.categories
      : current.category ? [current.category] : [];
    const next = existing.includes(cat) ? existing.filter((x) => x !== cat) : [...existing, cat];
    void patchCurrent({ categories: next, category: next[0] ?? null });
  };

  const onDelete = () => {
    if (!current) return;
    warnHaptic();
    const deletedId = current.id;
    removeItem(current);
    setQueueIds((ids) => ids.filter((id) => id !== deletedId));
    advance();
  };

  const onSave = () => { successHaptic(); advance(); };
  const onSkip = () => { tapHaptic(); advance(); };

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
          const horizontal = Math.abs(e.translationX) > Math.abs(e.translationY);
          if (horizontal) {
            if (e.translationX > 80) onSaveRef.current();
            else if (e.translationX < -80) onSkipRef.current();
          } else if (e.translationY < -80) {
            onDeleteRef.current();
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
        advance();
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
    const updated = [...(current.manualTags ?? []), t];
    setItems((prev) => prev.map((it) => (it.id === current.id ? { ...it, manualTags: updated } : it)));
    setTagInput('');
    const { error } = await updateScreenshot(current.id, { manual_typed_tags: updated });
    if (error) toast.error(`Save failed: ${error.slice(0, 80)}`);
  };

  return {
    session, items, loading, activeQueue, cursor, analyzing,
    tagInput, setTagInput, showActionsHint, setShowActionsHint,
    counts, current, total,
    enterQueue, exitQueue, patchCurrent, toggleCategory,
    onDelete, onSave, onSkip, onAnalyze, onCommitTag,
    cardSwipe, cardOpacity, cardSlide,
  };
};
