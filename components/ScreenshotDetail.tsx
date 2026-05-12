import { Ionicons } from '@expo/vector-icons';
import { BottomSheetScrollView, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as Sharing from 'expo-sharing';
import { Animated, Dimensions, LayoutAnimation, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { CategorySubjectSection } from './detail/CategorySubjectSection';
import { type Category } from './CategoryIcon';
import { Chip } from './Chip';
import { EditableField } from './detail/EditableField';
import { LinksSection } from './detail/LinksSection';
import { Lightbox } from './detail/Lightbox';
import { SimilarRow } from './detail/SimilarRow';
import { StatusDifficultyTimeSection } from './detail/StatusDifficultyTimeSection';
import { TagsSection } from './detail/TagsSection';
import { GhostHint } from './GhostHint';
import { Iris } from './Iris';
import { useToast } from './Toast';
import { markHintSeen, wasHintSeen } from '@/lib/hints';
import { analyzeAndPersist, isAnalyzeConfigured } from '@/lib/analyze';
import { addToCalendar } from '@/lib/calendar';
import { dropFromAnalysisQueue } from '@/lib/analysisQueue';
import { useSession } from '@/lib/auth';
import { successHaptic, tapHaptic, warnHaptic } from '@/lib/haptics';
import { statusColors, urgencyColors, type FontSet, type Palette } from '@/lib/colors';
import { useColors, useFonts } from '@/lib/themeContext';
import { RESONANCE_LEVELS, URGENCIES } from '@/lib/options';
import {
  fetchScreenshotMeta,
  updateScreenshot,
  type TypedTag,
} from '@/lib/screenshots';
import { buildTagFromValue, rememberTagType } from '@/lib/tagDictionary';
import type { LocalScreenshot } from '@/lib/uploads';

const SCREEN_HEIGHT = Dimensions.get('window').height;

type Props = {
  item: LocalScreenshot;
  onChange: (patch: Partial<LocalScreenshot>) => void;
  onDelete: () => void;
  snapIndex?: number;
  onNext?: () => void;
  onPrev?: () => void;
  hideImage?: boolean;
  allItems?: LocalScreenshot[];
  onSelect?: (id: string) => void;
};

type Pending = Partial<{
  category: string | null;
  categories: string[];
  subject: string | null;
  urgency: string | null;
  status: string | null;
  resonance: 1 | 2 | 3 | null;
  difficulty: 'beginner' | 'intermediate' | 'advanced' | null;
  timeToComplete: 'quick' | 'afternoon' | 'full_day' | 'multi_day' | 'long_term' | null;
  sourceUrlManual: string | null;
  notes: string | null;
  localOnly: boolean;
}>;

const LOCAL_ONLY_DEFAULT_CATEGORIES = new Set(['documents', 'messages']);

export const ScreenshotDetail = ({
  item,
  onChange,
  onDelete,
  snapIndex = 0,
  onNext,
  onPrev,
  hideImage = false,
  allItems,
  onSelect,
}: Props) => {
  const { session } = useSession();
  const toast = useToast();
  const c = useColors();
  const f = useFonts();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(c, f), [c, f]);

  // Parallax scroll animation — translateY runs at 60fps without layout passes.
  const IMAGE_MAX = SCREEN_HEIGHT * 0.32;
  const COLLAPSE_DISTANCE = IMAGE_MAX;
  const scrollY = useRef(new Animated.Value(0)).current;
  const imageTranslateY = scrollY.interpolate({
    inputRange: [0, COLLAPSE_DISTANCE || 1],
    outputRange: [0, -COLLAPSE_DISTANCE],
    extrapolate: 'clamp',
  });
  const imageScale = scrollY.interpolate({
    inputRange: [0, COLLAPSE_DISTANCE || 1],
    outputRange: [1, 0.92],
    extrapolate: 'clamp',
  });
  const imageOpacity = scrollY.interpolate({
    inputRange: [0, COLLAPSE_DISTANCE * 0.7 || 1, COLLAPSE_DISTANCE || 1],
    outputRange: [1, 1, 0.6],
    extrapolate: 'clamp',
  });
  const onScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    { useNativeDriver: false },
  );

  const [zoomOpen, setZoomOpen] = useState(false);
  const [manualTags, setManualTags] = useState<TypedTag[]>([]);
  const [aiTags, setAiTags] = useState<TypedTag[]>([]);
  const [aiSubjects, setAiSubjects] = useState<string[]>([]);
  const [serverNotes, setServerNotes] = useState('');
  const [newTag, setNewTag] = useState('');
  const [pendingAmbiguous, setPendingAmbiguous] = useState<{ value: string; candidates: string[] } | null>(null);
  const [pending, setPending] = useState<Pending>({});
  const [editingSections, setEditingSections] = useState<Set<string>>(new Set());

  const isEditing = (key: string) => editingSections.has(key);
  const toggleEditing = (key: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setEditingSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };
  const closeAllEditing = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setEditingSections(new Set());
  };

  const itemCategories: string[] =
    item.categories && item.categories.length > 0
      ? item.categories
      : item.category
        ? [item.category]
        : [];
  const view = {
    category: 'category' in pending ? pending.category : item.category,
    categories: 'categories' in pending ? (pending.categories ?? []) : itemCategories,
    subject: 'subject' in pending ? pending.subject : item.subject,
    urgency: 'urgency' in pending ? pending.urgency : item.urgency,
    status: 'status' in pending ? pending.status : item.status,
    resonance: 'resonance' in pending ? pending.resonance : item.resonance,
    difficulty: 'difficulty' in pending ? pending.difficulty : item.difficulty ?? null,
    timeToComplete: 'timeToComplete' in pending ? pending.timeToComplete : item.timeToComplete ?? null,
    sourceUrlManual: 'sourceUrlManual' in pending ? pending.sourceUrlManual : item.sourceUrlManual ?? null,
    notes: 'notes' in pending ? pending.notes : serverNotes,
    localOnly: 'localOnly' in pending ? pending.localOnly : item.localOnly ?? false,
  };
  const effectiveSourceUrl = view.sourceUrlManual ?? item.sourceUrl ?? null;
  const pendingCount = Object.keys(pending).length;

  // Onboarding hints
  const [showDragHint, setShowDragHint] = useState(false);
  const [showEditHint, setShowEditHint] = useState(false);
  const [showZoomHint, setShowZoomHint] = useState(false);
  useEffect(() => {
    let editTimer: ReturnType<typeof setTimeout> | undefined;
    void (async () => {
      const dragSeen = await wasHintSeen('sheet-drag-up');
      const editSeen = await wasHintSeen('sheet-long-press-edit');
      if (!dragSeen && !hideImage) {
        setShowDragHint(true);
        await markHintSeen('sheet-drag-up');
      }
      if (!editSeen) {
        editTimer = setTimeout(async () => {
          setShowEditHint(true);
          await markHintSeen('sheet-long-press-edit');
        }, dragSeen || hideImage ? 600 : 2400);
      }
    })();
    return () => { if (editTimer) clearTimeout(editTimer); };
  }, [hideImage]);

  useEffect(() => {
    if (hideImage) return;
    void (async () => {
      if (!(await wasHintSeen('sheet-tap-to-zoom'))) {
        const t = setTimeout(async () => {
          setShowZoomHint(true);
          await markHintSeen('sheet-tap-to-zoom');
        }, 2400);
        return () => clearTimeout(t);
      }
    })();
  }, [hideImage]);

  // Card-wide horizontal swipe for prev/next navigation.
  // failOffsetY must be tight so the Pan gives up quickly on vertical
  // movement and hands the gesture to BottomSheetScrollView. Previously
  // this was scoped to the image header only to avoid scroll caps; now
  // that Pressable wrappers have been removed from scroll content, RNGH
  // has clean ownership and this outer gesture coexists safely.
  const cardSwipeGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-20, 20])
        .failOffsetY([-10, 10])
        .runOnJS(true)
        .onEnd((e) => {
          const flick = Math.abs(e.velocityX) > 500;
          if ((e.translationX < -40 || (flick && e.translationX < -15)) && onNext) onNext();
          else if ((e.translationX > 40 || (flick && e.translationX > 15)) && onPrev) onPrev();
        }),
    [onNext, onPrev],
  );

  // Image-only gesture: pinch-to-zoom. Swipe is now handled by the outer
  // card gesture above, so the image gesture is pinch-only.
  const pinchToZoomGesture = useMemo(
    () => Gesture.Pinch().runOnJS(true).onStart(() => setZoomOpen(true)),
    [],
  );

  // Hydrate tags + notes from server on open.
  useEffect(() => {
    if (!session) return;
    fetchScreenshotMeta(item.id).then((meta) => {
      if (!meta) return;
      setManualTags(meta.manual_typed_tags);
      setAiTags(meta.ai_typed_tags);
      setAiSubjects(meta.ai_suggested_subjects);
      setServerNotes(meta.notes ?? '');
    });
    if ((item.aiTags?.length ?? 0) > 0 && item.aiReviewed === false) {
      void updateScreenshot(item.id, { ai_reviewed: true });
      onChange({ aiReviewed: true });
    }
  }, [item.id, session, item.aiTags, item.aiReviewed, onChange]);

  const persistNow = async (patch: Parameters<typeof updateScreenshot>[1]) => {
    const { error } = await updateScreenshot(item.id, patch);
    if (error) toast.error(`Save failed: ${error.slice(0, 80)}`);
  };

  const stage = (patch: Pending) => setPending((prev) => ({ ...prev, ...patch }));

  const setCategory = (cat: Category | null) => {
    if (!cat) { stage({ category: null, categories: [] }); return; }
    const has = view.categories.includes(cat);
    const nextCategories = has ? view.categories.filter((x) => x !== cat) : [...view.categories, cat];
    const updates: Pending = { categories: nextCategories, category: nextCategories[0] ?? null };
    if (!has && LOCAL_ONLY_DEFAULT_CATEGORIES.has(cat) && !view.localOnly) updates.localOnly = true;
    stage(updates);
  };
  const setStatus = (s: string | null) => stage({ status: view.status === s ? null : s });
  const setUrgency = (u: string | null) => stage({ urgency: view.urgency === u ? null : u });
  const setResonance = (r: 1 | 2 | 3 | null) => stage({ resonance: view.resonance === r ? null : r });

  const onApply = async () => {
    void successHaptic();
    const patch = pending;
    const dbPatch: Record<string, unknown> = {};
    if ('category' in patch) dbPatch.category = patch.category;
    if ('categories' in patch) dbPatch.categories = patch.categories;
    if ('subject' in patch) dbPatch.subject = patch.subject;
    if ('urgency' in patch) dbPatch.urgency = patch.urgency;
    if ('status' in patch) dbPatch.status = patch.status;
    if ('resonance' in patch) dbPatch.resonance = patch.resonance;
    if ('difficulty' in patch) dbPatch.difficulty = patch.difficulty;
    if ('timeToComplete' in patch) dbPatch.time_to_complete = patch.timeToComplete;
    if ('sourceUrlManual' in patch) dbPatch.source_url_manual = patch.sourceUrlManual;
    if ('notes' in patch) dbPatch.notes = patch.notes;
    if ('localOnly' in patch) dbPatch.local_only = patch.localOnly;

    onChange(patch as Partial<LocalScreenshot>);
    if ('notes' in patch) setServerNotes(patch.notes ?? '');
    setPending({});
    closeAllEditing();

    const { error } = await updateScreenshot(
      item.id,
      dbPatch as Parameters<typeof updateScreenshot>[1],
    );
    if (error) {
      setPending(patch);
      toast.error(`Save failed: ${error.slice(0, 80)}`);
      return;
    }
    if (patch.localOnly === true) void dropFromAnalysisQueue(item.id);
  };

  const onCancel = () => { setPending({}); closeAllEditing(); };

  const commitTag = (tag: TypedTag) => {
    const updated = [...manualTags, tag];
    setManualTags(updated);
    setNewTag('');
    setPendingAmbiguous(null);
    persistNow({ manual_typed_tags: updated });
  };

  const addTag = async () => {
    const v = newTag.trim();
    if (!v) return;
    const result = await buildTagFromValue(v);
    if ('ambiguous' in result) { setPendingAmbiguous({ value: result.value, candidates: result.candidates }); return; }
    commitTag(result);
  };

  const resolveAmbiguous = (type: string | null) => {
    if (!pendingAmbiguous) return;
    const tag: TypedTag = type ? { type, value: pendingAmbiguous.value } : { value: pendingAmbiguous.value };
    if (type) void rememberTagType(pendingAmbiguous.value, type);
    commitTag(tag);
  };

  const removeTag = (idx: number) => {
    const updated = manualTags.filter((_, i) => i !== idx);
    setManualTags(updated);
    persistNow({ manual_typed_tags: updated });
  };

  const setTagType = (idx: number, type: string | undefined) => {
    const updated = manualTags.map((t, i) => (i === idx ? { ...t, type } : t));
    setManualTags(updated);
    persistNow({ manual_typed_tags: updated });
    if (type) void rememberTagType(manualTags[idx].value, type);
  };

  const onTrash = () => { void warnHaptic(); onDelete(); };

  const onShare = async () => {
    try {
      const ok = await Sharing.isAvailableAsync();
      if (!ok) { toast.error('Sharing not available on this device.'); return; }
      await Sharing.shareAsync(item.uri, { mimeType: 'image/jpeg' });
    } catch (err) { console.warn('[share] failed', err); }
  };

  const [analyzing, setAnalyzing] = useState(false);
  const onAnalyze = async () => {
    if (analyzing) return;
    setAnalyzing(true);
    try {
      const patch = await analyzeAndPersist(item.uri, item.id, item.deviceAssetId ?? undefined);
      if (patch) {
        onChange({ category: patch.category ?? null, subject: patch.subject ?? null, urgency: patch.urgency ?? null });
        toast.show('Analyzed ✓');
      } else {
        toast.error('Analysis failed — try again later.');
      }
    } finally { setAnalyzing(false); }
  };
  const showAnalyzeAction = isAnalyzeConfigured && !view.localOnly && (item.aiTags?.length ?? 0) === 0;

  const statusColor = view.status ? statusColors[view.status] : undefined;
  const urgencyColor = view.urgency ? urgencyColors[view.urgency] : undefined;
  const showEdge =
    Boolean(statusColor && statusColor !== 'transparent') || Boolean(urgencyColor);
  const edgeColors: [string, string, string, string] = [
    statusColor && statusColor !== 'transparent' ? statusColor : 'rgba(0,0,0,0)',
    statusColor && statusColor !== 'transparent' ? statusColor : 'rgba(0,0,0,0)',
    urgencyColor ?? 'rgba(0,0,0,0)',
    urgencyColor ?? 'rgba(0,0,0,0)',
  ];

  return (
    <GestureDetector gesture={cardSwipeGesture}>
    <View style={{ flex: 1 }}>
      {/* Parallax image header — inner GestureDetector handles pinch-to-zoom only.
          Card-wide horizontal swipe is handled by the outer GestureDetector above. */}
      {!hideImage && (
        <GestureDetector gesture={pinchToZoomGesture}>
          <Animated.View
            pointerEvents="box-none"
            style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: IMAGE_MAX,
              backgroundColor: c.parchment, overflow: 'hidden', zIndex: 1,
              opacity: imageOpacity,
              transform: [{ translateY: imageTranslateY }, { scale: imageScale }],
            }}
          >
            <Pressable onPress={() => setZoomOpen(true)} style={{ flex: 1 }}>
              <Image source={{ uri: item.uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
              {showEdge && (
                <LinearGradient
                  colors={edgeColors}
                  locations={[0, 0.35, 0.65, 1]}
                  start={{ x: 0, y: 0.5 }}
                  end={{ x: 1, y: 0.5 }}
                  style={styles.previewEdge}
                  pointerEvents="none"
                />
              )}
            </Pressable>
          </Animated.View>
        </GestureDetector>
      )}

      {/* Pending-changes bar — floats just below the image. */}
      {pendingCount > 0 && (
        <View
          style={[
            styles.pendingBar,
            { position: 'absolute', top: hideImage ? 8 : IMAGE_MAX + 8, left: 12, right: 12, zIndex: 2, elevation: 4 },
          ]}
        >
          <Text style={styles.pendingText}>
            {pendingCount} {pendingCount === 1 ? 'change' : 'changes'} pending
          </Text>
          <View style={styles.pendingBtns}>
            <Pressable onPress={onCancel} style={styles.pendingCancel}>
              <Text style={styles.pendingCancelText}>cancel</Text>
            </Pressable>
            <Pressable onPress={onApply} style={styles.pendingApply}>
              <Text style={styles.pendingApplyText}>apply</Text>
            </Pressable>
          </View>
        </View>
      )}

      <BottomSheetScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scroll, { paddingTop: hideImage ? 12 : IMAGE_MAX + 16, paddingBottom: 16 }]}
        onScroll={onScroll}
      >
        <View>
          <Lightbox visible={zoomOpen} uri={item.uri} onClose={() => setZoomOpen(false)} />

          <CategorySubjectSection
            categories={view.categories}
            category={view.category}
            subject={view.subject}
            aiSubjects={aiSubjects}
            isEditingCategory={isEditing('category')}
            isEditingSubject={isEditing('subject')}
            onToggleCategory={() => toggleEditing('category')}
            onToggleSubject={() => toggleEditing('subject')}
            onSetCategory={setCategory}
            onStageSubject={(s) => stage({ subject: s })}
          />

          <TagsSection
            manualTags={manualTags}
            aiTags={aiTags}
            isEditing={isEditing('tags')}
            onToggle={() => toggleEditing('tags')}
            newTag={newTag}
            onNewTagChange={setNewTag}
            onAddTag={addTag}
            onRemoveTag={removeTag}
            onSetTagType={setTagType}
            pendingAmbiguous={pendingAmbiguous}
            onResolveAmbiguous={resolveAmbiguous}
          />

          <EditableField
            sectionKey="resonance"
            label="resonance"
            editing={isEditing('resonance')}
            onToggle={() => toggleEditing('resonance')}
            hasValue={view.resonance != null}
            read={
              view.resonance ? (
                <View style={styles.irisBtn}>
                  <Iris level={view.resonance} size={22} color={c.ink} />
                </View>
              ) : null
            }
            edit={
              <View style={styles.chipRow}>
                {RESONANCE_LEVELS.map((r) => {
                  const active = view.resonance === r;
                  return (
                    <Pressable
                      key={r}
                      onPress={() => { tapHaptic(); setResonance(r); }}
                      style={[styles.irisBtn, active && styles.irisBtnActive]}
                    >
                      <Iris level={r} size={22} color={c.ink} filled={active} />
                    </Pressable>
                  );
                })}
              </View>
            }
          />

          <EditableField
            sectionKey="urgency"
            label="urgency"
            editing={isEditing('urgency')}
            onToggle={() => toggleEditing('urgency')}
            hasValue={!!view.urgency}
            read={
              view.urgency ? (
                <View style={[styles.chipRow, { alignItems: 'center' }]}>
                  <Chip
                    label={URGENCIES.find((u) => u.key === view.urgency)?.label ?? view.urgency}
                    variant="meta"
                    selected
                    color={urgencyColors[view.urgency] ?? c.ink}
                  />
                  {item.urgencyDate && (
                    <Pressable
                      onPress={async () => {
                        const r = await addToCalendar(
                          view.subject ?? view.category ?? 'Overlook event',
                          item.urgencyDate!,
                          view.notes ?? undefined,
                        );
                        if (r.ok) { void successHaptic(); toast.show('Opening calendar…'); }
                        else toast.error(r.error ?? 'Could not open calendar');
                      }}
                      style={styles.calendarBtn}
                      accessibilityLabel="Add to calendar"
                    >
                      <Ionicons name="calendar-outline" size={14} color={c.ink} />
                      <Text style={styles.calendarBtnText}>Add to calendar</Text>
                    </Pressable>
                  )}
                </View>
              ) : null
            }
            edit={
              <View style={[styles.chipRow, { flexWrap: 'wrap' }]}>
                {URGENCIES.map((u) => {
                  const active = view.urgency === u.key;
                  return (
                    <Chip
                      key={u.key}
                      label={u.label}
                      variant="meta"
                      selected={active}
                      color={active ? urgencyColors[u.key] : c.inkMuted}
                      onPress={() => setUrgency(u.key)}
                    />
                  );
                })}
              </View>
            }
          />

          <StatusDifficultyTimeSection
            status={view.status}
            difficulty={view.difficulty}
            timeToComplete={view.timeToComplete}
            editingSections={editingSections}
            setEditingSections={setEditingSections}
            onSetStatus={setStatus}
            onSetDifficulty={(d) => stage({ difficulty: d })}
            onSetTimeToComplete={(t) => stage({ timeToComplete: t })}
          />

          <LinksSection
            item={item}
            sourceUrl={effectiveSourceUrl}
            sourceUrlManual={view.sourceUrlManual ?? null}
            onSourceChange={(t) => stage({ sourceUrlManual: t.trim() || null })}
            onLinksChange={(next) => {
              onChange({ actionUrls: next });
              void persistNow({ action_urls: next });
            }}
          />

          <EditableField
            sectionKey="notes"
            label="notes"
            editing={isEditing('notes')}
            onToggle={() => toggleEditing('notes')}
            hasValue={!!view.notes}
            read={view.notes ? <Text style={styles.notesReadOnly}>{view.notes}</Text> : null}
            edit={
              <BottomSheetTextInput
                value={view.notes ?? ''}
                onChangeText={(t) => stage({ notes: t })}
                multiline
                placeholder="quick thought, link, anything…"
                placeholderTextColor={c.inkMuted}
                style={styles.notesInput}
              />
            }
          />

          {/* AI tagging toggle — autosaves (binary privacy setting, no pending bar). */}
          <View style={styles.localOnlyRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionLabel}>Allow AI tagging</Text>
              <Text style={styles.emptyHint}>
                {view.localOnly
                  ? 'Image stays on this device — AI analysis is off.'
                  : 'AI can analyze this image to suggest tags.'}
              </Text>
            </View>
            <Pressable
              onPress={async () => {
                const next = !view.localOnly;
                onChange({ localOnly: next });
                const { error } = await updateScreenshot(item.id, { local_only: next });
                if (error) { onChange({ localOnly: !next }); toast.error('Save failed'); return; }
                if (next) void dropFromAnalysisQueue(item.id);
              }}
              style={[styles.localOnlySwitch, !view.localOnly && styles.localOnlySwitchOn]}
              accessibilityLabel="Toggle AI tagging"
              accessibilityRole="switch"
              accessibilityState={{ checked: !view.localOnly }}
            >
              <View style={[styles.localOnlyThumb, !view.localOnly && { transform: [{ translateX: 18 }] }]} />
            </Pressable>
          </View>

          {showAnalyzeAction && (
            <Pressable
              onPress={onAnalyze}
              disabled={analyzing}
              style={({ pressed }) => [styles.analyzeBtn, (pressed || analyzing) && { opacity: 0.7 }]}
              accessibilityLabel="Analyze with AI"
              accessibilityState={{ busy: analyzing }}
            >
              {analyzing
                ? <Iris level={3} size={18} color={c.parchment} spinning />
                : <Ionicons name="sparkles-outline" size={16} color={c.parchment} />}
              <Text style={styles.analyzeBtnText}>
                {analyzing ? 'analyzing…' : 'analyze with AI'}
              </Text>
            </Pressable>
          )}

          {onSelect && <SimilarRow item={item} allItems={allItems} onSelect={onSelect} />}

          <View style={styles.footer}>
            <Pressable onPress={onShare} style={styles.footerBtn} accessibilityLabel="Share screenshot">
              <Ionicons name="share-outline" size={18} color={c.ink} />
              <Text style={styles.footerText}>share</Text>
            </Pressable>
            <View style={styles.footerDivider} />
            <Pressable onPress={onTrash} style={styles.footerBtn} accessibilityLabel="Delete screenshot">
              <Ionicons name="trash-outline" size={18} color="#C0392B" />
              <Text style={[styles.footerText, { color: '#C0392B' }]}>delete</Text>
            </Pressable>
          </View>
          {/* Explicit spacer — BottomSheetScrollView.contentContainerStyle.paddingBottom
              is unreliable on Android. Real layout child enforces the clearance. */}
          <View style={{ height: 300 + insets.bottom }} />
        </View>
      </BottomSheetScrollView>

      <GhostHint
        visible={showDragHint}
        variant="drag-up"
        label="Drag up for full detail"
        topOffset={32}
        onDismiss={() => setShowDragHint(false)}
      />
      <GhostHint
        visible={showEditHint}
        variant="tap"
        label="Long-press tags to edit"
        topOffset={IMAGE_MAX + 80}
        onDismiss={() => setShowEditHint(false)}
      />
      <GhostHint
        visible={showZoomHint}
        variant="tap"
        label="Tap image to zoom"
        topOffset={IMAGE_MAX / 2 - 40}
        onDismiss={() => setShowZoomHint(false)}
      />
    </View>
    </GestureDetector>
  );
};

const makeStyles = (c: Palette, f: FontSet) =>
  StyleSheet.create({
    scroll: { padding: 20, paddingBottom: 120, gap: 4 },
    previewEdge: { position: 'absolute', top: 0, left: 0, right: 0, height: 8 },
    sectionLabel: {
      fontSize: 11, letterSpacing: 1.8, textTransform: 'uppercase', color: c.inkMuted, marginTop: 8, marginBottom: 4,
    },
    emptyHint: { fontSize: 12, color: c.inkMuted, fontStyle: 'italic' },
    notesReadOnly: { fontSize: 14, color: c.ink, paddingVertical: 6, lineHeight: 20 },
    localOnlyRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, paddingVertical: 4, gap: 12 },
    localOnlySwitch: { width: 42, height: 24, borderRadius: 12, backgroundColor: c.divider, padding: 2, justifyContent: 'center' },
    localOnlySwitchOn: { backgroundColor: c.ink },
    localOnlyThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: c.parchment },
    chipRow: { flexDirection: 'row', gap: 6 },
    irisBtn: { width: 44, height: 44, borderWidth: 1, borderColor: c.ink, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
    irisBtnActive: { borderWidth: 2 },
    calendarBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: c.ink, marginLeft: 8,
    },
    calendarBtnText: { fontFamily: f.body, fontSize: 12, letterSpacing: 0.2, color: c.ink },
    pendingBar: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      backgroundColor: c.ink, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 4, marginTop: 4,
    },
    pendingText: { color: c.parchment, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase' },
    pendingBtns: { flexDirection: 'row', gap: 6 },
    pendingCancel: { paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: c.parchment, borderRadius: 3 },
    pendingCancelText: { color: c.parchment, fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase' },
    pendingApply: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: c.parchment, borderRadius: 3 },
    pendingApplyText: { color: c.ink, fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', fontWeight: '600' },
    notesInput: {
      fontSize: 14, color: c.ink, paddingVertical: 10, paddingHorizontal: 12,
      borderWidth: 1, borderColor: c.divider, borderRadius: 4, minHeight: 80, textAlignVertical: 'top',
    },
    analyzeBtn: {
      marginTop: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      gap: 8, paddingVertical: 14, paddingHorizontal: 18, borderRadius: 4, backgroundColor: c.ink,
    },
    analyzeBtnText: { color: c.parchment, fontSize: 15, letterSpacing: 1.4, textTransform: 'uppercase', fontWeight: '600' },
    footer: {
      flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 12,
      borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.ink, borderStyle: 'dashed',
    },
    footerBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 12, paddingHorizontal: 16, minHeight: 44 },
    footerDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: c.divider, marginVertical: 4 },
    footerText: { color: c.ink, fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase' },
  });
