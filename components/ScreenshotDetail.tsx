import { Ionicons } from '@expo/vector-icons';
import { BottomSheetScrollView, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState } from 'react';
import * as Sharing from 'expo-sharing';
import { Animated, Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import Reanimated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GestureDetector } from 'react-native-gesture-handler';

import { CategorySubjectSection } from './detail/CategorySubjectSection';
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
import { effectiveUrgencyKey, urgencyDisplayLabel } from '@/lib/urgency';
import { updateScreenshot } from '@/lib/screenshots';
import { useDetailAnimations } from '@/lib/useDetailAnimations';
import { useDetailEdit } from '@/lib/useDetailEdit';
import { useTagEditor } from '@/lib/useTagEditor';
import type { LocalScreenshot } from '@/lib/uploads';

const SCREEN_HEIGHT = Dimensions.get('window').height;

type Props = {
  item: LocalScreenshot;
  onChange: (patch: Partial<LocalScreenshot>) => void;
  onDelete: () => void;
  onClose?: () => void;
  snapIndex?: number;
  onNext?: () => void;
  onPrev?: () => void;
  hideImage?: boolean;
  allItems?: LocalScreenshot[];
  onSelect?: (id: string) => void;
};

export const ScreenshotDetail = ({
  item,
  onChange,
  onDelete,
  onClose,
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

  const IMAGE_MAX = SCREEN_HEIGHT * 0.32;

  const [zoomOpen, setZoomOpen] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  // ─── Animations & gestures ─────────────────────────────────────────────
  const {
    imageTranslateY, imageScale, imageOpacity, onScroll,
    cardTranslateStyle, cardSwipeGesture, pinchToZoomGesture,
  } = useDetailAnimations(item.id, IMAGE_MAX, onNext, onPrev, () => setZoomOpen(true));

  // ─── Tag editor ────────────────────────────────────────────────────────
  const [serverNotes, setServerNotes] = useState('');
  const {
    manualTags, aiTags, aiSubjects,
    newTag, setNewTag, pendingAmbiguous,
    addTag, removeTag, setTagType, resolveAmbiguous,
  } = useTagEditor(item, session, onChange, setServerNotes, toast);

  // ─── Pending edit state ────────────────────────────────────────────────
  const {
    view, stage, editingSections, isEditing, toggleEditing,
    setEditingSections, setCategory, setStatus, setUrgency, setResonance,
    filterBy, onApply: applyPending,
  } = useDetailEdit(item, serverNotes, onChange, onClose, toast);

  const onApply = () => applyPending((notes) => setServerNotes(notes ?? ''));

  // ─── Onboarding hints ──────────────────────────────────────────────────
  const [showDragHint, setShowDragHint] = useState(false);
  const [showEditHint, setShowEditHint] = useState(false);
  const [showZoomHint, setShowZoomHint] = useState(false);
  useEffect(() => {
    let editTimer: ReturnType<typeof setTimeout> | undefined;
    void (async () => {
      const dragSeen = await wasHintSeen('sheet-drag-up');
      const editSeen = await wasHintSeen('sheet-long-press-edit');
      const zoomSeen = await wasHintSeen('sheet-tap-to-zoom');
      if (!dragSeen && !hideImage) { setShowDragHint(true); await markHintSeen('sheet-drag-up'); }
      if (!editSeen) {
        editTimer = setTimeout(async () => { setShowEditHint(true); await markHintSeen('sheet-long-press-edit'); },
          dragSeen || hideImage ? 600 : 2400);
      }
      if (!zoomSeen && !hideImage) {
        setTimeout(async () => { setShowZoomHint(true); await markHintSeen('sheet-tap-to-zoom'); }, 2400);
      }
    })();
    return () => { if (editTimer) clearTimeout(editTimer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  // ─── Actions ───────────────────────────────────────────────────────────
  const onTrash = () => { void warnHaptic(); onDelete(); };

  const onShare = async () => {
    try {
      const ok = await Sharing.isAvailableAsync();
      if (!ok) { toast.error('Sharing not available on this device.'); return; }
      await Sharing.shareAsync(item.uri, { mimeType: 'image/jpeg' });
    } catch (err) { console.warn('[share] failed', err); }
  };

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

  // ─── Derived display values ────────────────────────────────────────────
  const statusColor = view.status ? statusColors[view.status] : undefined;
  const urgencyColor = view.urgency ? urgencyColors[effectiveUrgencyKey(view) ?? ''] : undefined;
  const showEdge = Boolean(statusColor && statusColor !== 'transparent') || Boolean(urgencyColor);
  const edgeColors: [string, string, string, string] = [
    statusColor && statusColor !== 'transparent' ? statusColor : 'rgba(0,0,0,0)',
    statusColor && statusColor !== 'transparent' ? statusColor : 'rgba(0,0,0,0)',
    urgencyColor ?? 'rgba(0,0,0,0)',
    urgencyColor ?? 'rgba(0,0,0,0)',
  ];

  // ─── Render ────────────────────────────────────────────────────────────
  return (
    <GestureDetector gesture={cardSwipeGesture}>
    <Reanimated.View style={[{ flex: 1 }, cardTranslateStyle]}>
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
            onApply={onApply}
          />

          <TagsSection
            manualTags={manualTags}
            aiTags={aiTags}
            isEditing={isEditing('tags')}
            onToggle={() => toggleEditing('tags')}
            onApply={onApply}
            newTag={newTag}
            onNewTagChange={setNewTag}
            onAddTag={addTag}
            onRemoveTag={removeTag}
            onSetTagType={setTagType}
            pendingAmbiguous={pendingAmbiguous}
            onResolveAmbiguous={resolveAmbiguous}
            onFilterByTag={(tag) => filterBy({ tagQueries: new Set([tag.value]) })}
          />

          <EditableField
            sectionKey="resonance"
            label="resonance"
            editing={isEditing('resonance')}
            onToggle={() => toggleEditing('resonance')}
            onDone={onApply}
            hasValue={view.resonance != null}
            read={
              view.resonance ? (
                <Pressable
                  onPress={() => filterBy({ resonances: new Set([view.resonance!]) })}
                  style={({ pressed }) => [styles.irisBtn, pressed && { opacity: 0.75 }]}
                >
                  <Iris level={view.resonance} size={22} color={c.ink} />
                </Pressable>
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
            onDone={onApply}
            hasValue={!!view.urgency}
            read={
              view.urgency ? (
                <View style={[styles.chipRow, { alignItems: 'center' }]}>
                  <Chip
                    label={urgencyDisplayLabel(effectiveUrgencyKey(view)) ?? view.urgency ?? ''}
                    variant="meta"
                    selected
                    color={urgencyColors[effectiveUrgencyKey(view) ?? ''] ?? c.ink}
                    onPress={() => filterBy({ urgencies: new Set([view.urgency!]) })}
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
                      style={({ pressed }) => [styles.calendarBtn, pressed && { opacity: 0.75 }]}
                      hitSlop={8}
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
            onApply={onApply}
            onFilterByStatus={(s) => filterBy({ statuses: new Set([s]) })}
            onFilterByDifficulty={(d) => filterBy({ difficulties: new Set([d]) })}
            onFilterByTimeToComplete={(t) => filterBy({ timesToComplete: new Set([t]) })}
          />

          <LinksSection
            item={item}
            sourceUrl={view.sourceUrlManual ?? item.sourceUrl ?? null}
            sourceUrlManual={view.sourceUrlManual ?? null}
            onSourceChange={(t) => stage({ sourceUrlManual: t.trim() || null })}
            onLinksChange={(next) => {
              onChange({ actionUrls: next });
              void updateScreenshot(item.id, { action_urls: next });
            }}
          />

          <EditableField
            sectionKey="notes"
            label="notes"
            editing={isEditing('notes')}
            onToggle={() => toggleEditing('notes')}
            onDone={onApply}
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
              hitSlop={8}
              accessibilityLabel="Toggle AI tagging"
              accessibilityRole="switch"
              accessibilityState={{ checked: !view.localOnly }}
            >
              <View style={[styles.localOnlyThumb, !view.localOnly && { transform: [{ translateX: 18 }] }]} />
            </Pressable>
          </View>

          {isAnalyzeConfigured && !view.localOnly && (item.aiTags?.length ?? 0) === 0 && (
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

          {onSelect && (
            <SimilarRow
              item={item}
              allItems={allItems}
              onSelect={onSelect}
              onSeeAll={view.categories.length > 0
                ? () => filterBy({ categories: new Set(view.categories) })
                : undefined}
            />
          )}

          <View style={styles.footer}>
            <Pressable onPress={onShare} style={({ pressed }) => [styles.footerBtn, pressed && { opacity: 0.75 }]} accessibilityLabel="Share screenshot">
              <Ionicons name="share-outline" size={18} color={c.ink} />
              <Text style={styles.footerText}>share</Text>
            </Pressable>
            <View style={styles.footerDivider} />
            <Pressable onPress={onTrash} style={({ pressed }) => [styles.footerBtn, pressed && { opacity: 0.75 }]} accessibilityLabel="Delete screenshot">
              <Ionicons name="trash-outline" size={18} color="#C0392B" />
              <Text style={[styles.footerText, { color: '#C0392B' }]}>delete</Text>
            </Pressable>
          </View>
          {/* Explicit spacer — BottomSheetScrollView.contentContainerStyle.paddingBottom
              is unreliable on Android. Real layout child enforces the clearance. */}
          <View style={{ height: 300 + insets.bottom }} />
        </View>
      </BottomSheetScrollView>

      <GhostHint visible={showDragHint} variant="drag-up" label="Drag up for full detail" topOffset={32} onDismiss={() => setShowDragHint(false)} />
      <GhostHint visible={showEditHint} variant="tap" label="Tap labels to edit" topOffset={IMAGE_MAX + 80} onDismiss={() => setShowEditHint(false)} />
      <GhostHint visible={showZoomHint} variant="tap" label="Tap image to zoom" topOffset={IMAGE_MAX / 2 - 40} onDismiss={() => setShowZoomHint(false)} />
    </Reanimated.View>
    </GestureDetector>
  );
};

const makeStyles = (c: Palette, f: FontSet) =>
  StyleSheet.create({
    scroll: { padding: 20, paddingBottom: 120, gap: 4 },
    previewEdge: { position: 'absolute', top: 0, left: 0, right: 0, height: 8 },
    sectionLabel: { fontSize: 11, letterSpacing: 1.8, textTransform: 'uppercase', color: c.inkMuted, marginTop: 8, marginBottom: 4 },
    emptyHint: { fontSize: 12, color: c.inkMuted, fontStyle: 'italic' },
    notesReadOnly: { fontSize: 14, color: c.ink, paddingVertical: 6, lineHeight: 20 },
    localOnlyRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8, paddingVertical: 4, gap: 12 },
    localOnlySwitch: { width: 42, height: 24, borderRadius: 12, backgroundColor: c.divider, padding: 2, justifyContent: 'center' },
    localOnlySwitchOn: { backgroundColor: c.ink },
    localOnlyThumb: { width: 20, height: 20, borderRadius: 10, backgroundColor: c.parchment },
    chipRow: { flexDirection: 'row', gap: 6 },
    irisBtn: { width: 44, height: 44, borderWidth: 1, borderColor: c.ink, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
    irisBtnActive: { borderWidth: 2 },
    calendarBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14, borderWidth: 1, borderColor: c.ink, marginLeft: 8 },
    calendarBtnText: { fontFamily: f.body, fontSize: 12, letterSpacing: 0.2, color: c.ink },
    notesInput: { fontSize: 14, color: c.ink, paddingVertical: 10, paddingHorizontal: 12, borderWidth: 1, borderColor: c.divider, borderRadius: 4, minHeight: 80, textAlignVertical: 'top' },
    analyzeBtn: { marginTop: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, paddingHorizontal: 18, borderRadius: 4, backgroundColor: c.ink },
    analyzeBtnText: { color: c.parchment, fontSize: 15, letterSpacing: 1.4, textTransform: 'uppercase', fontWeight: '600' },
    footer: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.ink, borderStyle: 'dashed' },
    footerBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 12, paddingHorizontal: 16, minHeight: 44 },
    footerDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: c.divider, marginVertical: 4 },
    footerText: { color: c.ink, fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase' },
  });
