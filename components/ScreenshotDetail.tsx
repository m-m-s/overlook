import { Ionicons } from '@expo/vector-icons';
import { BottomSheetScrollView, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { Chip } from './Chip';
import { Iris } from './Iris';
import { CategoryIcon, type Category } from './CategoryIcon';
import { useSession } from '@/lib/auth';
import { colors, statusColors, urgencyColors } from '@/lib/colors';
import { CATEGORIES, RESONANCE_LEVELS, STATUSES, URGENCIES, TAG_TYPES } from '@/lib/options';
import {
  deleteScreenshot,
  fetchScreenshotMeta,
  updateScreenshot,
  type TypedTag,
} from '@/lib/screenshots';
import { buildTagFromValue, rememberTagType } from '@/lib/tagDictionary';
import type { LocalScreenshot } from '@/lib/uploads';

type Props = {
  item: LocalScreenshot;
  onChange: (patch: Partial<LocalScreenshot>) => void;
  onDelete: () => void;
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
  subject: string | null;
  urgency: string | null;
  status: string | null;
  resonance: 1 | 2 | 3 | null;
  notes: string | null;
}>;

const SectionLabel = ({ children }: { children: string }) => (
  <Text style={styles.sectionLabel}>{children}</Text>
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

export const ScreenshotDetail = ({ item, onChange, onDelete }: Props) => {
  const { session } = useSession();
  const [manualTags, setManualTags] = useState<TypedTag[]>([]);
  const [aiTags, setAiTags] = useState<TypedTag[]>([]);
  const [serverNotes, setServerNotes] = useState('');
  const [newTag, setNewTag] = useState('');
  const [pendingAmbiguous, setPendingAmbiguous] = useState<{ value: string; candidates: string[] } | null>(null);
  const [pending, setPending] = useState<Pending>({});

  // The "view" model = item + pending. UI reads from this; persist only on Apply.
  const view = {
    category: 'category' in pending ? pending.category : item.category,
    subject: 'subject' in pending ? pending.subject : item.subject,
    urgency: 'urgency' in pending ? pending.urgency : item.urgency,
    status: 'status' in pending ? pending.status : item.status,
    resonance: 'resonance' in pending ? pending.resonance : item.resonance,
    notes: 'notes' in pending ? pending.notes : serverNotes,
  };
  const pendingCount = Object.keys(pending).length;

  // Hydrate tags + notes from server when sheet opens.
  useEffect(() => {
    if (!session) return;
    fetchScreenshotMeta(item.id).then((meta) => {
      if (!meta) return;
      setManualTags(meta.manual_typed_tags);
      setAiTags(meta.ai_typed_tags);
      setServerNotes(meta.notes ?? '');
    });
  }, [item.id, session]);

  // Persist tag-array changes immediately (auto-save for tags is intentional in v1).
  const persistNow = (patch: Parameters<typeof updateScreenshot>[1]) => {
    updateScreenshot(item.id, patch);
  };

  // Stage scalar changes into `pending`; commit on Apply.
  const stage = (patch: Pending) => setPending((prev) => ({ ...prev, ...patch }));

  const setCategory = (cat: Category | null) => {
    stage({ category: view.category === cat ? null : cat });
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
    const patch = pending;
    setPending({});
    onChange(patch as Partial<LocalScreenshot>);
    await updateScreenshot(item.id, patch as Parameters<typeof updateScreenshot>[1]);
    if ('notes' in patch) setServerNotes(patch.notes ?? '');
  };

  const onCancel = () => {
    setPending({});
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
    Alert.alert('Delete screenshot?', 'This removes it from your library.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteScreenshot(item.id, item.storagePath);
          onDelete();
        },
      },
    ]);
  };

  const onShare = async () => {
    try {
      await Share.share({ url: item.uri, message: item.subject ?? '' });
    } catch (err) {
       
      console.warn('[share] failed', err);
    }
  };

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
    <BottomSheetScrollView contentContainerStyle={styles.scroll}>
      {/* Image preview */}
      <View style={styles.preview}>
        <Image source={{ uri: item.uri }} style={styles.previewImg} contentFit="cover" />
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
        {view.category && (
          <View style={styles.previewCat}>
            <CategoryIcon category={view.category} size={26} />
          </View>
        )}
        {view.resonance && (
          <View style={styles.previewIris}>
            <Iris level={view.resonance} size={26} />
          </View>
        )}
      </View>

      {/* Pending-changes bar (only when scalar edits are staged) */}
      {pendingCount > 0 && (
        <View style={styles.pendingBar}>
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

      {/* Category */}
      <SectionLabel>category</SectionLabel>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {CATEGORIES.map((cat) => (
          <Chip
            key={cat}
            label={cat}
            selected={view.category === cat}
            variant="meta"
            onPress={() => setCategory(cat)}
            color={view.category === cat ? colors.ink : colors.inkMuted}
          />
        ))}
      </ScrollView>

      {/* Subject */}
      <SectionLabel>subject</SectionLabel>
      <BottomSheetTextInput
        value={view.subject ?? ''}
        onChangeText={(t) => stage({ subject: t || null })}
        placeholder="specific thing — Crochet, React hook, Italian restaurant…"
        placeholderTextColor={colors.inkMuted}
        style={styles.subjectInput}
      />

      {/* Resonance */}
      <SectionLabel>resonance</SectionLabel>
      <View style={styles.row}>
        {RESONANCE_LEVELS.map((r) => {
          const active = view.resonance === r;
          return (
            <Pressable
              key={r}
              onPress={() => setResonance(r)}
              style={[styles.irisBtn, active && styles.irisBtnActive]}
            >
              <Iris level={r} size={22} color={active ? colors.parchment : colors.ink} />
            </Pressable>
          );
        })}
      </View>

      {/* Urgency */}
      <SectionLabel>urgency</SectionLabel>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {URGENCIES.map((u) => {
          const active = view.urgency === u.key;
          return (
            <Chip
              key={u.key}
              label={u.label}
              variant="meta"
              selected={active}
              color={active ? urgencyColors[u.key] : colors.inkMuted}
              onPress={() => setUrgency(u.key)}
            />
          );
        })}
      </ScrollView>

      {/* Status */}
      <SectionLabel>status</SectionLabel>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {STATUSES.map((s) => {
          const active = view.status === s.key;
          return (
            <Chip
              key={s.key}
              label={s.label}
              variant="meta"
              selected={active}
              color={active ? statusColors[s.key] : colors.inkMuted}
              onPress={() => setStatus(s.key)}
            />
          );
        })}
      </ScrollView>

      {/* Tags — manual + AI mixed, sorted by spec hierarchy: typed first (in TAG_TYPES order), alphabetical within type, untyped last. */}
      <SectionLabel>tags</SectionLabel>
      <View style={[styles.row, styles.wrap]}>
        {sortedDisplayTags(manualTags, aiTags).map((entry) => {
          const { tag, source, manualIndex } = entry;
          if (source === 'manual') {
            return (
              <Chip
                key={`m-${tag.value}-${manualIndex}`}
                label={tag.type ? `${tag.type}:${tag.value}` : tag.value}
                variant="manual"
                onPress={() => {
                  const types = [undefined, ...TAG_TYPES] as (string | undefined)[];
                  const cur = types.indexOf(tag.type);
                  const next = types[(cur + 1) % types.length];
                  setTagType(manualIndex, next);
                }}
                onRemove={() => removeTag(manualIndex)}
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
      <View style={styles.addTagRow}>
        <BottomSheetTextInput
          value={newTag}
          onChangeText={setNewTag}
          onSubmitEditing={addTag}
          placeholder="+ add tag"
          placeholderTextColor={colors.inkMuted}
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
                color={colors.ink}
                onPress={() => resolveAmbiguous(cand)}
              />
            ))}
            <Chip
              label="neither — keep untyped"
              variant="add"
              color={colors.inkMuted}
              onPress={() => resolveAmbiguous(null)}
            />
          </View>
        </View>
      )}

      {/* Notes */}
      <SectionLabel>notes</SectionLabel>
      <BottomSheetTextInput
        value={view.notes ?? ''}
        onChangeText={(t) => stage({ notes: t })}
        multiline
        placeholder="quick thought, link, anything…"
        placeholderTextColor={colors.inkMuted}
        style={styles.notesInput}
      />

      {/* Footer actions: share + delete (spec: "Share button (Android native share sheet)") */}
      <View style={styles.footer}>
        <Pressable onPress={onShare} style={styles.footerBtn} accessibilityLabel="Share screenshot">
          <Ionicons name="share-outline" size={18} color={colors.ink} />
          <Text style={styles.footerText}>share</Text>
        </Pressable>
        <Pressable onPress={onTrash} style={styles.footerBtn} accessibilityLabel="Delete screenshot">
          <Ionicons name="trash-outline" size={18} color="#C0392B" />
          <Text style={[styles.footerText, { color: '#C0392B' }]}>delete</Text>
        </Pressable>
      </View>
    </BottomSheetScrollView>
  );
};

const styles = StyleSheet.create({
  scroll: { padding: 20, paddingBottom: 80, gap: 4 },
  preview: { width: '100%', aspectRatio: 1.6, marginBottom: 16, backgroundColor: colors.divider },
  previewImg: { width: '100%', height: '100%' },
  previewEdge: { position: 'absolute', top: 0, left: 0, right: 0, height: '18%' },
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
    color: colors.inkMuted,
    marginTop: 22,
    marginBottom: 10,
  },
  row: { flexDirection: 'row', gap: 6 },
  wrap: { flexWrap: 'wrap', rowGap: 8 },
  subjectInput: {
    fontSize: 16,
    fontFamily: 'Georgia',
    color: colors.ink,
    paddingVertical: 8,
    borderBottomWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.divider,
  },
  irisBtn: {
    width: 44,
    height: 44,
    borderWidth: 1,
    borderColor: colors.ink,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  irisBtnActive: { backgroundColor: colors.ink },
  addTagRow: { marginTop: 8 },
  ambiguousRow: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.divider,
    borderRadius: 4,
    gap: 10,
  },
  ambiguousLabel: {
    fontSize: 12,
    color: colors.ink,
    fontStyle: 'italic',
  },
  pendingBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.ink,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 4,
    marginTop: 4,
  },
  pendingText: {
    color: colors.parchment,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  pendingBtns: { flexDirection: 'row', gap: 6 },
  pendingCancel: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.parchment,
    borderRadius: 3,
  },
  pendingCancelText: {
    color: colors.parchment,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  pendingApply: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.parchment,
    borderRadius: 3,
  },
  pendingApplyText: {
    color: colors.ink,
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  tagInput: {
    fontSize: 13,
    color: colors.ink,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.inkMuted,
    borderRadius: 3,
  },
  notesInput: {
    fontSize: 14,
    color: colors.ink,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: colors.divider,
    borderRadius: 4,
    minHeight: 80,
    textAlignVertical: 'top',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 32,
    paddingVertical: 14,
    borderTopWidth: 2,
    borderTopColor: colors.divider,
    borderStyle: 'dashed',
  },
  footerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  footerText: {
    color: colors.ink,
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
});
