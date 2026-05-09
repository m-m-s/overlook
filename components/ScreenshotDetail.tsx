import { Ionicons } from '@expo/vector-icons';
import { BottomSheetScrollView, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as Sharing from 'expo-sharing';
import { Animated, Dimensions, LayoutAnimation, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { CategoryIcon, type Category } from './CategoryIcon';
import { Chip } from './Chip';
import { LinksSection } from './detail/LinksSection';
import { Lightbox } from './detail/Lightbox';
import { SimilarRow } from './detail/SimilarRow';
import { GhostHint } from './GhostHint';
import { Iris } from './Iris';
import { Shake } from './Shake';
import { useToast } from './Toast';
import { markHintSeen, wasHintSeen } from '@/lib/hints';
import { analyzeAndPersist, isAnalyzeConfigured } from '@/lib/analyze';
import { addToCalendar } from '@/lib/calendar';
import { dropFromAnalysisQueue } from '@/lib/analysisQueue';
import { useSession } from '@/lib/auth';
import { heavyHaptic, successHaptic, tapHaptic, warnHaptic } from '@/lib/haptics';
import { statusColors, urgencyColors, type FontSet, type Palette } from '@/lib/colors';
import { useColors, useFonts } from '@/lib/themeContext';
import {
  capitalize,
  CATEGORIES,
  DIFFICULTIES,
  formatTagValue,
  RESONANCE_LEVELS,
  STATUSES,
  TAG_TYPES,
  TIMES_TO_COMPLETE,
  URGENCIES,
} from '@/lib/options';
import {
  fetchScreenshotMeta,
  updateScreenshot,
  type TypedTag,
} from '@/lib/screenshots';
import { buildTagFromValue, rememberTagType } from '@/lib/tagDictionary';
import type { ActionLink, LocalScreenshot } from '@/lib/uploads';

const SCREEN_HEIGHT = Dimensions.get('window').height;

type Props = {
  item: LocalScreenshot;
  onChange: (patch: Partial<LocalScreenshot>) => void;
  onDelete: () => void;
  /** 0 = compact (60%), 1 = mid (85%), 2 = full (100%). Drives image size. */
  snapIndex?: number;
  /** Swipe-left in the image area calls this to advance to the next item. */
  onNext?: () => void;
  /** Swipe-right in the image area calls this to go back to the previous item. */
  onPrev?: () => void;
  /** When true, skip the parallax image header. Used by the library's
   *  intent-mode (1-col) view where the full image is already on screen
   *  behind the sheet, so re-rendering it inside the sheet is redundant. */
  hideImage?: boolean;
  /** Full library reference so the sheet can compute "find similar".
   *  When omitted, the similar row hides. */
  allItems?: LocalScreenshot[];
  /** Called when the user taps a similar thumbnail — parent should set
   *  the selectedId so the sheet switches to that item without closing. */
  onSelect?: (id: string) => void;
};

/**
 * Pending-changes model per spec: "Apply to confirm edits, Cancel to revert
 * — no auto-save."
 *
 * Sprint v1 basic: scalar fields (category, subject, urgency, status,
 * resonance, notes) write to a `pending` patch instead of persisting on every
 * tap. The Apply/Cancel bar appears at the top of the sheet whenever pending
 * has any keys. Tags stay auto-saved for now (defer to v2).
 *
 * v2 will add: long-press a section to enter edit mode, shake animation on
 * chips, X on tags. (Per Maggie's call: ship basic Apply/Cancel for v1.)
 */
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

/**
 * Section header — read-only label. Long-press handling is done by the
 * outer Section wrapper, which covers the entire section block (header +
 * value display + empty state) so users can long-press anywhere.
 */
const SectionHeader = ({
  label,
  editing,
  onExit,
}: {
  label: string;
  editing: boolean;
  /** Tap target shown beside the label when editing — exits this section's edit mode. */
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

/**
 * Wraps a section so long-pressing anywhere inside (label, value, empty
 * "not set" hint) toggles edit mode. Tap on individual chips inside is
 * still routed to the chip's own onPress because RN's Pressable doesn't
 * eat short-tap events from nested Pressables.
 */
const Section = ({
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


type DisplayTag =
  | { tag: TypedTag; source: 'manual'; manualIndex: number; aiIndex?: undefined }
  | { tag: TypedTag; source: 'ai'; aiIndex: number; manualIndex?: undefined };

/**
 * Merge manual + AI tags and order them per CLAUDE.md:
 * "Typed tags first (in type hierarchy order) → untyped tags after.
 *  Within the same type, alphabetical."
 *
 * Manual/AI distinction is purely visual (filled vs outlined) — they share
 * the same sort space.
 */
const sortedDisplayTags = (manual: TypedTag[], ai: TypedTag[]): DisplayTag[] => {
  const all: DisplayTag[] = [
    ...manual.map((tag, manualIndex): DisplayTag => ({ tag, source: 'manual', manualIndex })),
    ...ai.map((tag, aiIndex): DisplayTag => ({ tag, source: 'ai', aiIndex })),
  ];
  const typeRank = (t?: string): number => {
    if (!t) return TAG_TYPES.length; // untyped → last
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

export const ScreenshotDetail = ({ item, onChange, onDelete, snapIndex = 0, onNext, onPrev, hideImage = false, allItems, onSelect }: Props) => {
  const { session } = useSession();
  const toast = useToast();
  const c = useColors();
  const f = useFonts();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(c, f), [c, f]);

  // Parallax header: the image is an absolutely-positioned overlay on top of
  // the scroll content (which has matching paddingTop). As the user scrolls,
  // we translateY the image — that's a paint-only transform, no Yoga layout
  // pass, no React reconciliation. Previously we shrank the image's `height`
  // each frame; height changes force layout for every descendant — that was
  // the jank source. translateY runs at 60fps even on Android.
  // Locked to 32% across all snap points — previously the image grew to
  // 70% at full snap, but that "snap up to fuller width" felt awkward.
  // The fullscreen lightbox (tap the image) is the path for a bigger view.
  const IMAGE_MAX = SCREEN_HEIGHT * 0.32;
  const COLLAPSE_DISTANCE = IMAGE_MAX;
  const scrollY = useRef(new Animated.Value(0)).current;
  const imageTranslateY = scrollY.interpolate({
    inputRange: [0, COLLAPSE_DISTANCE || 1],
    outputRange: [0, -COLLAPSE_DISTANCE],
    extrapolate: 'clamp',
  });
  // Subtle scale-down + fade as the image scrolls away. Both are native-
  // driver-eligible transforms and add a polished "the photo recedes"
  // feel on top of the translate.
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
  // useNativeDriver: false here for compat with @gorhom/bottom-sheet's
  // internal scroll handler. Because we only animate transform/opacity
  // (no layout-affecting props), this still avoids per-frame layout work
  // and is dramatically smoother than the previous height-based approach.
  const onScroll = Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    { useNativeDriver: false },
  );

  // Tap-to-zoom lightbox: at full snap, tapping the image opens a fullscreen
  // modal with the original aspect ratio + pinch-to-zoom (system gestures).
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

  // The "view" model = item + pending. UI reads from this; persist only on Apply.
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
  // Effective source URL: user-set if present, otherwise AI-extracted.
  const effectiveSourceUrl = view.sourceUrlManual ?? item.sourceUrl ?? null;
  const pendingCount = Object.keys(pending).length;

  // First-time bottom-sheet hints: drag-up arrow at the handle (only when
  // the parallax image is visible) and long-press-to-edit hint over the
  // tag area. Each fires once per install. Both can fire on the same
  // open — drag first, then edit ~2s later — so users see both gestures.
  const [showDragHint, setShowDragHint] = useState(false);
  const [showEditHint, setShowEditHint] = useState(false);
  const [showZoomHint, setShowZoomHint] = useState(false);
  useEffect(() => {
    let dragTimer: ReturnType<typeof setTimeout> | undefined;
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
    return () => {
      if (dragTimer) clearTimeout(dragTimer);
      if (editTimer) clearTimeout(editTimer);
    };
  }, [hideImage]);

  // Telegraph that the image is tappable to open the fullscreen
  // pinch-zoom lightbox. Skipped in intent-mode (hideImage) since there's
  // no in-sheet image to tap on there.
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

  // Horizontal swipe on the image header to walk through neighbouring
  // screenshots without closing the sheet. failOffsetY cedes vertical
  // drags to the bottom-sheet's own pan handler so the sheet still
  // opens/closes normally.
  const swipeGesture = useMemo(
    () =>
      Gesture.Pan()
        // Smaller activation X + bigger Y tolerance so horizontal swipes
        // anywhere across the sheet width register without being canceled
        // by minor vertical drift. Velocity threshold lets a fast flick
        // count even if the user only travels ~40px.
        .activeOffsetX([-8, 8])
        .failOffsetY([-40, 40])
        .runOnJS(true)
        .onEnd((e) => {
          const flick = Math.abs(e.velocityX) > 600;
          if ((e.translationX < -50 || (flick && e.translationX < -20)) && onNext) onNext();
          else if ((e.translationX > 50 || (flick && e.translationX > 20)) && onPrev) onPrev();
        }),
    [onNext, onPrev],
  );

  // Pinch on the in-sheet image snap-opens the fullscreen zoom modal.
  // The lightbox is where the actual pinch+pan zoom lives — the in-sheet
  // image is too small to zoom usefully, so we just hand the gesture off.
  const pinchToZoomGesture = useMemo(
    () =>
      Gesture.Pinch()
        .runOnJS(true)
        .onStart(() => {
          setZoomOpen(true);
        }),
    [],
  );

  // Combine swipe (horizontal pan for prev/next) and pinch (open lightbox)
  // so two-finger pinches don't get swallowed by the pan handler.
  const imageGesture = useMemo(
    () => Gesture.Simultaneous(swipeGesture, pinchToZoomGesture),
    [swipeGesture, pinchToZoomGesture],
  );

  // Hydrate tags + notes from server when sheet opens.
  useEffect(() => {
    if (!session) return;
    fetchScreenshotMeta(item.id).then((meta) => {
      if (!meta) return;
      setManualTags(meta.manual_typed_tags);
      setAiTags(meta.ai_typed_tags);
      setAiSubjects(meta.ai_suggested_subjects);
      setServerNotes(meta.notes ?? '');
    });

    // Mark AI-tagged items as reviewed on first open. The next triage
    // 'AI unreviewed' queue won't show them again.
    if ((item.aiTags?.length ?? 0) > 0 && item.aiReviewed === false) {
      void updateScreenshot(item.id, { ai_reviewed: true });
      onChange({ aiReviewed: true });
    }
  }, [item.id, session, item.aiTags, item.aiReviewed, onChange]);

  // Persist tag-array changes immediately (auto-save for tags is intentional in v1).
  // Surface failures via toast so silent server errors don't go unnoticed.
  const persistNow = async (patch: Parameters<typeof updateScreenshot>[1]) => {
    const { error } = await updateScreenshot(item.id, patch);
    if (error) toast.error(`Save failed: ${error.slice(0, 80)}`);
  };

  // Stage scalar changes into `pending`; commit on Apply.
  const stage = (patch: Pending) => setPending((prev) => ({ ...prev, ...patch }));

  const setCategory = (cat: Category | null) => {
    if (!cat) {
      stage({ category: null, categories: [] });
      return;
    }
    const has = view.categories.includes(cat);
    const nextCategories = has ? view.categories.filter((x) => x !== cat) : [...view.categories, cat];
    const updates: Pending = {
      categories: nextCategories,
      // Keep singular `category` synced to first entry for legacy display.
      category: nextCategories[0] ?? null,
    };
    // Per spec: "Certain categories (Documents, Messages, Finance) default
    // to local-only." If ANY selected category is local-only-default AND
    // localOnly hasn't been explicitly set, flip it on.
    if (
      !has &&
      LOCAL_ONLY_DEFAULT_CATEGORIES.has(cat) &&
      !view.localOnly
    ) {
      updates.localOnly = true;
    }
    stage(updates);
  };
  const setStatus = (s: string | null) => {
    stage({ status: view.status === s ? null : s });
  };
  const setUrgency = (u: string | null) => {
    stage({ urgency: view.urgency === u ? null : u });
  };
  const setResonance = (r: 1 | 2 | 3 | null) => {
    stage({ resonance: view.resonance === r ? null : r });
  };

  const onApply = async () => {
    void successHaptic();
    const patch = pending;
    // Map local camelCase keys to DB snake_case for the supabase update.
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

    // Optimistic UI: update parent + close edit mode immediately. If the
    // server rejects, restore the pending patch and toast the error so the
    // user can retry without losing what they typed.
    onChange(patch as Partial<LocalScreenshot>);
    if ('notes' in patch) setServerNotes(patch.notes ?? '');
    setPending({});
    closeAllEditing();

    const { error } = await updateScreenshot(
      item.id,
      dbPatch as Parameters<typeof updateScreenshot>[1],
    );
    if (error) {
      // Restore the pending state so the user can fix and re-apply.
      setPending(patch);
      toast.error(`Save failed: ${error.slice(0, 80)}`);
      return;
    }
    // Privacy: if we just marked this item local-only, also drop it from the
    // offline analysis queue so a later drain can't re-send it.
    if (patch.localOnly === true) {
      void dropFromAnalysisQueue(item.id);
    }
  };

  const onCancel = () => {
    setPending({});
    closeAllEditing();
  };

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
    if ('ambiguous' in result) {
      setPendingAmbiguous({ value: result.value, candidates: result.candidates });
      return;
    }
    commitTag(result);
  };

  const resolveAmbiguous = (type: string | null) => {
    if (!pendingAmbiguous) return;
    const tag: TypedTag = type
      ? { type, value: pendingAmbiguous.value }
      : { value: pendingAmbiguous.value };
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
    // Remember user's manual type assignment so future tags with this value auto-type.
    if (type) void rememberTagType(manualTags[idx].value, type);
  };

  const onTrash = () => {
    void warnHaptic();
    onDelete();
  };

  const onShare = async () => {
    try {
      const ok = await Sharing.isAvailableAsync();
      if (!ok) {
        toast.error('Sharing not available on this device.');
        return;
      }
      await Sharing.shareAsync(item.uri, { mimeType: 'image/jpeg' });
    } catch (err) {
      console.warn('[share] failed', err);
    }
  };

  // Manual AI re-analyze for cards that haven't been tagged yet (e.g. the
  // initial bulk import had a network failure on this one). Disabled while
  // a request is in flight.
  const [analyzing, setAnalyzing] = useState(false);
  const onAnalyze = async () => {
    if (analyzing) return;
    setAnalyzing(true);
    try {
      const patch = await analyzeAndPersist(
        item.uri,
        item.id,
        item.deviceAssetId ?? undefined,
      );
      if (patch) {
        onChange({
          category: patch.category ?? null,
          subject: patch.subject ?? null,
          urgency: patch.urgency ?? null,
        });
        toast.show('Analyzed ✓');
      } else {
        toast.error('Analysis failed — try again later.');
      }
    } finally {
      setAnalyzing(false);
    }
  };
  const showAnalyzeAction =
    isAnalyzeConfigured &&
    !view.localOnly &&
    (item.aiTags?.length ?? 0) === 0;


  // Compute edge gradient colors for the preview (uses staged values via `view`).
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
    <View style={{ flex: 1 }}>
      {/* Parallax image header — sits ABOVE the scroll content (zIndex 1)
          and translates up as the user scrolls. The scroll content has a
          matching paddingTop so the image visually occupies the top
          IMAGE_MAX pixels at scroll=0. Tap at full snap opens lightbox.
          Suppressed in intent-mode (hideImage) since the image is already
          visible behind the sheet.

          GestureDetector wraps ONLY this image header, not the whole sheet.
          When it wrapped the entire sheet, RNGH gesture nesting interfered
          with the BottomSheetScrollView's internal scroll handler — the
          scroll could only travel a fraction of the content height before
          getting capped, hiding the similar row + footer. */}
      {!hideImage && (
      <GestureDetector gesture={imageGesture}>
      <Animated.View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: IMAGE_MAX,
          backgroundColor: c.parchment,
          overflow: 'hidden',
          zIndex: 1,
          opacity: imageOpacity,
          transform: [
            { translateY: imageTranslateY },
            { scale: imageScale },
          ],
        }}
      >
        <Pressable onPress={() => setZoomOpen(true)} style={{ flex: 1 }}>
            <Image
              source={{ uri: item.uri }}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
            />
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
            {/* Category + resonance icon overlays were dropped — the
                chips below the image carry the same info, so the
                overlays were redundant chrome on top of the photo. */}
          </Pressable>
      </Animated.View>
      </GestureDetector>
      )}

      {/* Pending-changes bar — floats just below the image so it doesn't
          displace scroll content when it appears (avoids the awkward
          "page jumps down" feel when the user toggles a field at the
          bottom of the sheet). zIndex 2 keeps it above the parallax. */}
      {/* Pending-changes bar — floats just below the image so it doesn't
          displace scroll content when it appears (avoids the "page jumps
          down" feel when the user toggles a field at the bottom of the
          sheet). zIndex 2 keeps it above the parallax. The sticky footer
          claims the bottom, so this stays anchored at the top. */}
      {pendingCount > 0 && (
        <View
          style={[
            styles.pendingBar,
            {
              position: 'absolute',
              top: hideImage ? 8 : IMAGE_MAX + 8,
              left: 12,
              right: 12,
              zIndex: 2,
              elevation: 4,
            },
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
        contentContainerStyle={[
          styles.scroll,
          // Sheet extends under the gesture nav (bottomInset=0 in
          // DetailSheetHost) so the parchment fills the inset zone.
          // PaddingBottom = insets.bottom + 12 keeps the footer above the
          // nav indicator visually.
          { paddingTop: hideImage ? 12 : IMAGE_MAX + 16, paddingBottom: insets.bottom + 12 },
        ]}
        onScroll={onScroll}
      >
      {/* Removed: Pressable wrapping all scroll content. Its presence
          appeared to cap the BottomSheetScrollView's scroll travel —
          gestures landing on the Pressable were being claimed before
          they reached the scroll's pan handler. The "tap to exit edit
          mode" UX now lives on each section's "done editing" link. */}
      <View>



      <Lightbox
        visible={zoomOpen}
        uri={item.uri}
        onClose={() => setZoomOpen(false)}
      />


      {/* Categories → Subject as connected chips. Each part is tappable
          to enter its own edit mode: tapping a category chip opens the
          category selector, tapping the subject text opens the subject
          input. Long-press still works on either to toggle. */}
      {!isEditing('category') && !isEditing('subject') && (view.categories.length > 0 || view.subject) && (
        <View style={styles.breadcrumb}>
          {view.categories.map((cat) => (
            <Pressable
              key={cat}
              onPress={() => toggleEditing('category')}
              onLongPress={() => {
                void heavyHaptic();
                toggleEditing('category');
              }}
            >
              <Chip
                label={capitalize(cat)}
                variant="meta"
                selected
                color={c.ink}
                leading={<CategoryIcon category={cat} size={14} color={c.parchment} />}
              />
            </Pressable>
          ))}
          {view.categories.length > 0 && view.subject && (
            <Ionicons name="chevron-forward" size={14} color={c.inkMuted} />
          )}
          {view.subject && (
            <Pressable
              onPress={() => toggleEditing('subject')}
              onLongPress={() => {
                void heavyHaptic();
                toggleEditing('subject');
              }}
            >
              <Text style={styles.breadcrumbSubject}>{view.subject}</Text>
            </Pressable>
          )}
          {/* If category is set but subject isn't, expose an "+ add title" affordance */}
          {view.categories.length > 0 && !view.subject && (
            <Pressable onPress={() => toggleEditing('subject')} hitSlop={6}>
              <Text style={styles.breadcrumbAddTitle}>+ add title</Text>
            </Pressable>
          )}
        </View>
      )}

      {/* Category — only show separately when editing OR neither category nor subject is set */}
      {(isEditing('category') || (!view.category && !view.subject)) && (
        <Section onToggle={() => toggleEditing('category')}>
          <SectionHeader label="category" editing={isEditing('category')} onExit={() => toggleEditing('category')} />
          {isEditing('category') ? (
            <Shake trigger={isEditing('category')} style={[styles.row, styles.wrap]}>
              {CATEGORIES.map((cat) => {
                const active = view.categories.includes(cat);
                return (
                  <Chip
                    key={cat}
                    label={capitalize(cat)}
                    selected={active}
                    variant="meta"
                    onPress={() => setCategory(cat)}
                    color={active ? c.ink : c.inkMuted}
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
            </Shake>
          ) : (
            <Text style={styles.emptyHint}>not set</Text>
          )}
        </Section>
      )}

      {/* Subject — only show separately when editing OR no value */}
      {(isEditing('subject') || (!view.subject && !view.category)) && (
        <Section onToggle={() => toggleEditing('subject')}>
          <SectionHeader label="subject" editing={isEditing('subject')} onExit={() => toggleEditing('subject')} />
          {isEditing('subject') ? (
            <>
              {aiSubjects.length > 0 && !view.subject && (
                <View style={[styles.row, styles.wrap, { marginBottom: 8 }]}>
                  {aiSubjects.map((s) => (
                    <Chip key={s} label={s} variant="ai" color={c.inkMuted} onPress={() => stage({ subject: s })} />
                  ))}
                </View>
              )}
              <BottomSheetTextInput
                value={view.subject ?? ''}
                onChangeText={(t) => stage({ subject: t || null })}
                placeholder="specific thing — Crochet, React hook, Italian restaurant…"
                placeholderTextColor={c.inkMuted}
                style={styles.subjectInput}
              />
            </>
          ) : (
            <Text style={styles.emptyHint}>not set</Text>
          )}
        </Section>
      )}

      {/* Tags — placed above resonance/urgency/status so the descriptive
          metadata is read before the manual quantitative fields. */}
      <Section onToggle={() => toggleEditing('tags')}>
      <SectionHeader label="tags" editing={isEditing('tags')} onExit={() => toggleEditing('tags')} />
      {(() => {
        const sorted = sortedDisplayTags(manualTags, aiTags);
        if (sorted.length === 0 && !isEditing('tags')) {
          return <Text style={styles.emptyHint}>not set</Text>;
        }
        return (
          <>
            <View style={[styles.row, styles.wrap]}>
              {sorted.map((entry) => {
                const { tag, source, manualIndex } = entry;
                if (source === 'manual') {
                  return (
                    <Chip
                      key={`m-${tag.value}-${manualIndex}`}
                      label={tag.type ? `${tag.type}: ${formatTagValue(tag.value)}` : formatTagValue(tag.value)}
                      variant="manual"
                      onPress={
                        isEditing('tags')
                          ? () => {
                              const types = [undefined, ...TAG_TYPES] as (string | undefined)[];
                              const cur = types.indexOf(tag.type);
                              const next = types[(cur + 1) % types.length];
                              setTagType(manualIndex, next);
                            }
                          : undefined
                      }
                      onRemove={isEditing('tags') ? () => removeTag(manualIndex) : undefined}
                    />
                  );
                }
                return (
                  <Chip
                    key={`a-${tag.value}-${entry.aiIndex}`}
                    label={tag.type ? `${tag.type}:${tag.value}` : tag.value}
                    variant="ai"
                  />
                );
              })}
            </View>
            {isEditing('tags') && (
              <>
                <View style={styles.addTagRow}>
                  <BottomSheetTextInput
                    value={newTag}
                    onChangeText={setNewTag}
                    onSubmitEditing={addTag}
                    placeholder="+ add tag"
                    placeholderTextColor={c.inkMuted}
                    autoCapitalize="none"
                    style={styles.tagInput}
                  />
                </View>
                {pendingAmbiguous && (
                  <View style={styles.ambiguousRow}>
                    <Text style={styles.ambiguousLabel}>
                      is &quot;{pendingAmbiguous.value}&quot; a…
                    </Text>
                    <View style={[styles.row, styles.wrap]}>
                      {pendingAmbiguous.candidates.map((cand) => (
                        <Chip
                          key={cand}
                          label={cand}
                          variant="meta"
                          color={c.ink}
                          onPress={() => resolveAmbiguous(cand)}
                        />
                      ))}
                      <Chip
                        label="neither — keep untyped"
                        variant="add"
                        color={c.inkMuted}
                        onPress={() => resolveAmbiguous(null)}
                      />
                    </View>
                  </View>
                )}
              </>
            )}
          </>
        );
      })()}
      </Section>

      {/* Resonance */}
      <Section onToggle={() => toggleEditing('resonance')}>
      <SectionHeader label="resonance" editing={isEditing('resonance')} onExit={() => toggleEditing('resonance')} />
      {isEditing('resonance') ? (
        <Shake trigger={isEditing('resonance')} style={styles.row}>
          {RESONANCE_LEVELS.map((r) => {
            const active = view.resonance === r;
            return (
              <Pressable
                key={r}
                onPress={() => {
                  tapHaptic();
                  setResonance(r);
                }}
                style={[styles.irisBtn, active && styles.irisBtnActive]}
              >
                <Iris level={r} size={22} color={c.ink} filled={active} />
              </Pressable>
            );
          })}
        </Shake>
      ) : view.resonance ? (
        <View style={styles.irisBtn}>
          <Iris level={view.resonance} size={22} color={c.ink} />
        </View>
      ) : (
        <Text style={styles.emptyHint}>not set</Text>
      )}
      </Section>

      {/* Urgency */}
      <Section onToggle={() => toggleEditing('urgency')}>
      <SectionHeader label="urgency" editing={isEditing('urgency')} onExit={() => toggleEditing('urgency')} />
      {isEditing('urgency') ? (
        <Shake trigger={isEditing('urgency')} style={[styles.row, styles.wrap]}>
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
        </Shake>
      ) : view.urgency ? (
        <View style={[styles.row, { flexWrap: 'wrap', alignItems: 'center' }]}>
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
                if (r.ok) {
                  void successHaptic();
                  toast.show('Opening calendar…');
                } else {
                  toast.error(r.error ?? 'Could not open calendar');
                }
              }}
              style={styles.calendarBtn}
              accessibilityLabel="Add to calendar"
            >
              <Ionicons name="calendar-outline" size={14} color={c.ink} />
              <Text style={styles.calendarBtnText}>Add to calendar</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <Text style={styles.emptyHint}>not set</Text>
      )}
      </Section>

      {/* Status · difficulty · time-to-complete — combined into one section to
          save vertical space. When read-only, all three values render inline
          on a single chip row. Long-press toggles all three into edit mode. */}
      {(() => {
        const editingMeta = isEditing('status') || isEditing('difficulty') || isEditing('time');
        const toggleMeta = () => {
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
          <Section onToggle={toggleMeta}>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionLabel}>
                status · difficulty · time
                {editingMeta && (
                  <Text style={styles.sectionLabelEditing}>  · editing</Text>
                )}
              </Text>
            </View>

            {editingMeta ? (
              <View style={{ gap: 12 }}>
                <View>
                  <Text style={styles.subLabel}>status</Text>
                  <View style={[styles.row, styles.wrap]}>
                    {STATUSES.map((s) => {
                      const active = view.status === s.key;
                      return (
                        <Chip
                          key={s.key}
                          label={s.label}
                          variant="meta"
                          selected={active}
                          color={active ? statusColors[s.key] : c.inkMuted}
                          onPress={() => setStatus(s.key)}
                        />
                      );
                    })}
                  </View>
                </View>
                <View>
                  <Text style={styles.subLabel}>difficulty</Text>
                  <View style={[styles.row, styles.wrap]}>
                    {DIFFICULTIES.map((d) => {
                      const active = view.difficulty === d.key;
                      return (
                        <Chip
                          key={d.key}
                          label={d.label}
                          variant="meta"
                          selected={active}
                          color={active ? c.ink : c.inkMuted}
                          onPress={() =>
                            stage({
                              difficulty:
                                view.difficulty === d.key
                                  ? null
                                  : (d.key as 'beginner' | 'intermediate' | 'advanced'),
                            })
                          }
                        />
                      );
                    })}
                  </View>
                </View>
                <View>
                  <Text style={styles.subLabel}>time to complete</Text>
                  <View style={[styles.row, styles.wrap]}>
                    {TIMES_TO_COMPLETE.map((t) => {
                      const active = view.timeToComplete === t.key;
                      return (
                        <Chip
                          key={t.key}
                          label={t.label}
                          variant="meta"
                          selected={active}
                          color={active ? c.ink : c.inkMuted}
                          onPress={() =>
                            stage({
                              timeToComplete:
                                view.timeToComplete === t.key
                                  ? null
                                  : (t.key as
                                      | 'quick'
                                      | 'afternoon'
                                      | 'full_day'
                                      | 'multi_day'
                                      | 'long_term'),
                            })
                          }
                        />
                      );
                    })}
                  </View>
                </View>
              </View>
            ) : view.status || view.difficulty || view.timeToComplete ? (
              <View style={[styles.row, styles.wrap]}>
                {view.status && (
                  <Chip
                    label={STATUSES.find((s) => s.key === view.status)?.label ?? view.status}
                    variant="meta"
                    selected
                    color={statusColors[view.status] ?? c.ink}
                  />
                )}
                {view.difficulty && (
                  <Chip label={capitalize(view.difficulty)} variant="meta" selected color={c.ink} />
                )}
                {view.timeToComplete && (
                  <Chip
                    label={
                      TIMES_TO_COMPLETE.find((t) => t.key === view.timeToComplete)?.label ??
                      view.timeToComplete
                    }
                    variant="meta"
                    selected
                    color={c.ink}
                  />
                )}
              </View>
            ) : (
              <Text style={styles.emptyHint}>not set</Text>
            )}
          </Section>
        );
      })()}

      {/* Links — compact horizontal pill row. Combines source URL +
          AI-extracted action_urls + user-added custom links. Long-press
          a manual pill to remove. "+ Add" pill toggles an inline input. */}
      <LinksSection
        item={item}
        sourceUrl={effectiveSourceUrl}
        sourceUrlManual={view.sourceUrlManual ?? null}
        onSourceChange={(t) => stage({ sourceUrlManual: t.trim() || null })}
        onLinksChange={(next) => {
          // Persist immediately. Action URLs are not part of the
          // pending/Apply flow — adding/removing a link feels best as
          // an instant action rather than a staged edit.
          onChange({ actionUrls: next });
          void persistNow({ action_urls: next });
        }}
      />

      {/* Notes — read mode shows text; edit mode shows multi-line input */}
      <Section onToggle={() => toggleEditing('notes')}>
      <SectionHeader label="notes" editing={isEditing('notes')} onExit={() => toggleEditing('notes')} />
      {isEditing('notes') ? (
        <BottomSheetTextInput
          value={view.notes ?? ''}
          onChangeText={(t) => stage({ notes: t })}
          multiline
          placeholder="quick thought, link, anything…"
          placeholderTextColor={c.inkMuted}
          style={styles.notesInput}
        />
      ) : view.notes ? (
        <Text style={styles.notesReadOnly}>{view.notes}</Text>
      ) : (
        <Text style={styles.emptyHint}>not set</Text>
      )}
      </Section>

      {/* AI tagging toggle. The DB field is `local_only` (privacy-first
          invariant), but the UI surfaces it as the positive "Allow AI
          tagging" so the toggle's meaning matches the switch direction:
          ON = AI allowed, OFF = stays on device. Auto-flips OFF when
          the category becomes documents / messages. */}
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
          onPress={() => stage({ localOnly: !view.localOnly })}
          style={[styles.localOnlySwitch, !view.localOnly && styles.localOnlySwitchOn]}
          accessibilityLabel="Toggle AI tagging"
          accessibilityRole="switch"
          accessibilityState={{ checked: !view.localOnly }}
        >
          <View
            style={[
              styles.localOnlyThumb,
              !view.localOnly && { transform: [{ translateX: 18 }] },
            ]}
          />
        </Pressable>
      </View>

      {/* Manual AI analyze — only surfaces when the card hasn't been
          analyzed yet (e.g. the original bulk import failed on this one).
          Hidden once AI tags exist so it doesn't clutter normal usage. */}
      {showAnalyzeAction && (
        <Pressable
          onPress={onAnalyze}
          disabled={analyzing}
          style={({ pressed }) => [
            styles.analyzeBtn,
            (pressed || analyzing) && { opacity: 0.7 },
          ]}
          accessibilityLabel="Analyze with AI"
          accessibilityState={{ busy: analyzing }}
        >
          {analyzing ? (
            <Iris level={3} size={18} color={c.parchment} spinning />
          ) : (
            <Ionicons name="sparkles-outline" size={16} color={c.parchment} />
          )}
          <Text style={styles.analyzeBtnText}>
            {analyzing ? 'analyzing…' : 'analyze with AI'}
          </Text>
        </Pressable>
      )}

      {onSelect && <SimilarRow item={item} allItems={allItems} onSelect={onSelect} />}

      {/* Footer actions: share + delete — inline at the bottom of scroll
          content. Sheet's bottomInset=insets.bottom (in DetailSheetHost)
          keeps the sheet above the gesture nav, so this footer lands
          naturally above the nav at max scroll. */}
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
      </View>
      </BottomSheetScrollView>

      {/* Onboarding overlays */}
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
  );
};

const makeStyles = (c: Palette, f: FontSet) =>
  StyleSheet.create({
    scroll: { padding: 20, paddingBottom: 120, gap: 4 },
    previewImg: { width: '100%', height: '100%' },
    previewEdge: { position: 'absolute', top: 0, left: 0, right: 0, height: 8 },
    previewCat: {
      position: 'absolute',
      left: 12,
      bottom: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.5,
      shadowRadius: 3,
      elevation: 4,
    },
    previewIris: {
      position: 'absolute',
      right: 12,
      bottom: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.5,
      shadowRadius: 3,
      elevation: 4,
    },
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
    subLabel: {
      fontSize: 10,
      letterSpacing: 1.4,
      textTransform: 'uppercase',
      color: c.inkMuted,
      marginBottom: 6,
    },
    sectionLabelEditing: { color: c.ink, fontWeight: '700' },
    emptyHint: {
      fontSize: 12,
      color: c.inkMuted,
      fontStyle: 'italic',
    },
    breadcrumb: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginTop: 12,
      marginBottom: 6,
      flexWrap: 'wrap',
    },
    breadcrumbSubject: {
      fontFamily: f.displayMedium,
      fontSize: 17,
      color: c.ink,
    },
    breadcrumbAddTitle: {
      fontFamily: f.body,
      fontSize: 13,
      color: c.inkMuted,
      borderBottomWidth: 1,
      borderStyle: 'dashed',
      borderColor: c.inkMuted,
    },
    notesReadOnly: {
      fontSize: 14,
      color: c.ink,
      paddingVertical: 6,
      lineHeight: 20,
    },
    localOnlyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 8,
      paddingVertical: 4,
      gap: 12,
    },
    localOnlySwitch: {
      width: 42,
      height: 24,
      borderRadius: 12,
      backgroundColor: c.divider,
      padding: 2,
      justifyContent: 'center',
    },
    localOnlySwitchOn: {
      backgroundColor: c.ink,
    },
    localOnlyThumb: {
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: c.parchment,
    },
    row: { flexDirection: 'row', gap: 6 },
    wrap: { flexWrap: 'wrap', rowGap: 8 },
    subjectInput: {
      fontSize: 16,
      fontFamily: f.displayMedium,
      color: c.ink,
      paddingVertical: 8,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderStyle: 'dashed',
      borderColor: c.ink,
    },
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
    calendarBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.ink,
      marginLeft: 8,
    },
    calendarBtnText: {
      fontFamily: f.body,
      fontSize: 12,
      letterSpacing: 0.2,
      color: c.ink,
    },
    addTagRow: { marginTop: 8 },
    ambiguousRow: {
      marginTop: 12,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: c.divider,
      borderRadius: 4,
      gap: 10,
    },
    ambiguousLabel: {
      fontSize: 12,
      color: c.ink,
      fontStyle: 'italic',
    },
    pendingBar: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: c.ink,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 4,
      marginTop: 4,
    },
    pendingBarFloating: {
      position: 'absolute',
      top: 8,
      left: 12,
      right: 12,
      zIndex: 2,
      elevation: 4,
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
    },
    pendingText: {
      color: c.parchment,
      fontSize: 11,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
    },
    pendingBtns: { flexDirection: 'row', gap: 6 },
    pendingCancel: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderWidth: 1,
      borderColor: c.parchment,
      borderRadius: 3,
    },
    pendingCancelText: {
      color: c.parchment,
      fontSize: 11,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
    },
    pendingApply: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      backgroundColor: c.parchment,
      borderRadius: 3,
    },
    pendingApplyText: {
      color: c.ink,
      fontSize: 11,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      fontWeight: '600',
    },
    tagInput: {
      fontSize: 13,
      color: c.ink,
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: c.inkMuted,
      borderRadius: 3,
    },
    actionUrlBtn: {
      marginTop: 22,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 14,
      backgroundColor: c.ink,
      borderRadius: 4,
    },
    actionUrlText: {
      color: c.parchment,
      fontSize: 13,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      fontWeight: '600',
    },
    urlRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderColor: c.divider,
    },
    urlText: {
      flex: 1,
      fontSize: 13,
      color: c.ink,
      textDecorationLine: 'underline',
    },
    urlInput: {
      fontSize: 13,
      color: c.ink,
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: c.inkMuted,
      borderRadius: 3,
      marginTop: 8,
    },
    notesInput: {
      fontSize: 14,
      color: c.ink,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderWidth: 1,
      borderColor: c.divider,
      borderRadius: 4,
      minHeight: 80,
      textAlignVertical: 'top',
    },
    analyzeBtn: {
      marginTop: 18,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 14,
      paddingHorizontal: 18,
      borderRadius: 4,
      backgroundColor: c.ink,
    },
    analyzeBtnText: {
      color: c.parchment,
      fontSize: 15,
      letterSpacing: 1.4,
      textTransform: 'uppercase',
      fontWeight: '600',
    },
    footer: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      paddingVertical: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: c.ink,
      borderStyle: 'dashed',
    },
    footerBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 12,
      paddingHorizontal: 16,
      minHeight: 44,
    },
    footerDivider: {
      width: StyleSheet.hairlineWidth,
      alignSelf: 'stretch',
      backgroundColor: c.divider,
      marginVertical: 4,
    },
    footerText: {
      color: c.ink,
      fontSize: 12,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
    },
  });
