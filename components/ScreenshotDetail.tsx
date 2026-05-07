import { Ionicons } from '@expo/vector-icons';
import { BottomSheetScrollView, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import { useEffect, useMemo, useState } from 'react';
import { LayoutAnimation, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import { Chip } from './Chip';
import { Iris } from './Iris';
import { CategoryIcon, type Category } from './CategoryIcon';
import { useToast } from './Toast';
import { useSession } from '@/lib/auth';
import { colors, statusColors, urgencyColors } from '@/lib/colors';
import {
  CATEGORIES,
  DIFFICULTIES,
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
import type { LocalScreenshot } from '@/lib/uploads';

type Props = {
  item: LocalScreenshot;
  onChange: (patch: Partial<LocalScreenshot>) => void;
  onDelete: () => void;
  /** 0 = compact (60%), 1 = mid (85%), 2 = full (100%). Drives image size. */
  snapIndex?: number;
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
  difficulty: 'beginner' | 'intermediate' | 'advanced' | null;
  timeToComplete: 'quick' | 'afternoon' | 'full_day' | 'multi_day' | 'long_term' | null;
  sourceUrlManual: string | null;
  notes: string | null;
}>;

/**
 * Tappable section header. Long-press to enter/exit edit mode for that
 * section (per spec: "Long press any section → edit mode"). Read mode shows
 * just the assigned value; edit mode reveals the chip pickers.
 */
const SectionHeader = ({
  label,
  editing,
  onToggle,
}: {
  label: string;
  editing: boolean;
  onToggle: () => void;
}) => (
  <Pressable onLongPress={onToggle} hitSlop={8}>
    <View style={styles.sectionHead}>
      <Text style={styles.sectionLabel}>
        {label}
        {editing && <Text style={styles.sectionLabelEditing}>  · editing</Text>}
      </Text>
      <Text style={styles.sectionEditHint}>{editing ? 'tap a chip · long-press done' : 'long-press to edit'}</Text>
    </View>
  </Pressable>
);

const actionUrlIcon = (type: string | null | undefined): React.ComponentProps<typeof Ionicons>['name'] => {
  switch (type) {
    case 'tickets': return 'ticket-outline';
    case 'directions': return 'navigate-outline';
    case 'buy': return 'bag-outline';
    case 'recipe': return 'restaurant-outline';
    case 'listen': return 'musical-notes-outline';
    case 'watch': return 'play-outline';
    case 'read': return 'book-outline';
    case 'search': return 'search-outline';
    default: return 'open-outline';
  }
};

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

export const ScreenshotDetail = ({ item, onChange, onDelete, snapIndex = 0 }: Props) => {
  const { session } = useSession();
  const toast = useToast();

  // Image preview height grows with the snap index per spec ("Drag up for full
  // detail view"). At compact snap, preview is a portrait thumbnail. At full,
  // it's nearly the full screen height with the image rendered uncropped.
  const previewStyle = useMemo(() => {
    if (snapIndex >= 2) {
      // Full snap: occupy most of the screen height, contain the image
      return { width: '100%' as const, height: 560, marginBottom: 16, backgroundColor: colors.divider };
    }
    if (snapIndex === 1) {
      return { width: '100%' as const, height: 380, marginBottom: 16, backgroundColor: colors.divider };
    }
    return { width: '100%' as const, height: 240, marginBottom: 16, backgroundColor: colors.divider };
  }, [snapIndex]);
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
  const view = {
    category: 'category' in pending ? pending.category : item.category,
    subject: 'subject' in pending ? pending.subject : item.subject,
    urgency: 'urgency' in pending ? pending.urgency : item.urgency,
    status: 'status' in pending ? pending.status : item.status,
    resonance: 'resonance' in pending ? pending.resonance : item.resonance,
    difficulty: 'difficulty' in pending ? pending.difficulty : item.difficulty ?? null,
    timeToComplete: 'timeToComplete' in pending ? pending.timeToComplete : item.timeToComplete ?? null,
    sourceUrlManual: 'sourceUrlManual' in pending ? pending.sourceUrlManual : item.sourceUrlManual ?? null,
    notes: 'notes' in pending ? pending.notes : serverNotes,
  };
  // Effective source URL: user-set if present, otherwise AI-extracted.
  const effectiveSourceUrl = view.sourceUrlManual ?? item.sourceUrl ?? null;
  const pendingCount = Object.keys(pending).length;

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
  }, [item.id, session]);

  // Persist tag-array changes immediately (auto-save for tags is intentional in v1).
  // Surface failures via toast so silent server errors don't go unnoticed.
  const persistNow = async (patch: Parameters<typeof updateScreenshot>[1]) => {
    const { error } = await updateScreenshot(item.id, patch);
    if (error) toast.error(`save failed: ${error.slice(0, 80)}`);
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
    // Map local camelCase keys to DB snake_case for the supabase update.
    const dbPatch: Record<string, unknown> = {};
    if ('category' in patch) dbPatch.category = patch.category;
    if ('subject' in patch) dbPatch.subject = patch.subject;
    if ('urgency' in patch) dbPatch.urgency = patch.urgency;
    if ('status' in patch) dbPatch.status = patch.status;
    if ('resonance' in patch) dbPatch.resonance = patch.resonance;
    if ('difficulty' in patch) dbPatch.difficulty = patch.difficulty;
    if ('timeToComplete' in patch) dbPatch.time_to_complete = patch.timeToComplete;
    if ('sourceUrlManual' in patch) dbPatch.source_url_manual = patch.sourceUrlManual;
    if ('notes' in patch) dbPatch.notes = patch.notes;

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
      toast.error(`save failed: ${error.slice(0, 80)}`);
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
    // Parent handles optimistic remove + 5-sec undo toast + commit (per spec).
    onDelete();
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
      {/* Image preview — grows with sheet snap index. Uses contentFit="contain"
          so the entire image is visible (no cropping) at full snap. */}
      <View style={previewStyle}>
        <Image source={{ uri: item.uri }} style={styles.previewImg} contentFit="contain" />
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

      {/* Category → Subject as connected chips per spec ("Category depth: Category → Subject as connected chips") */}
      {!isEditing('category') && !isEditing('subject') && (view.category || view.subject) && (
        <Pressable onLongPress={() => toggleEditing('category')} style={styles.breadcrumb}>
          {view.category && <Chip label={view.category} variant="meta" selected color={colors.ink} />}
          {view.category && view.subject && (
            <Ionicons name="chevron-forward" size={14} color={colors.inkMuted} />
          )}
          {view.subject && <Text style={styles.breadcrumbSubject}>{view.subject}</Text>}
        </Pressable>
      )}

      {/* Category — only show separately when editing OR neither category nor subject is set */}
      {(isEditing('category') || (!view.category && !view.subject)) && (
        <>
          <SectionHeader
            label="category"
            editing={isEditing('category')}
            onToggle={() => toggleEditing('category')}
          />
          {isEditing('category') ? (
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
          ) : (
            <Text style={styles.emptyHint}>not set</Text>
          )}
        </>
      )}

      {/* Subject — only show separately when editing OR no value */}
      {(isEditing('subject') || (!view.subject && !view.category)) && (
        <>
          <SectionHeader
            label="subject"
            editing={isEditing('subject')}
            onToggle={() => toggleEditing('subject')}
          />
          {isEditing('subject') ? (
            <>
              {aiSubjects.length > 0 && !view.subject && (
                <View style={[styles.row, styles.wrap, { marginBottom: 8 }]}>
                  {aiSubjects.map((s) => (
                    <Chip key={s} label={s} variant="ai" color={colors.inkMuted} onPress={() => stage({ subject: s })} />
                  ))}
                </View>
              )}
              <BottomSheetTextInput
                value={view.subject ?? ''}
                onChangeText={(t) => stage({ subject: t || null })}
                placeholder="specific thing — Crochet, React hook, Italian restaurant…"
                placeholderTextColor={colors.inkMuted}
                style={styles.subjectInput}
              />
            </>
          ) : (
            <Text style={styles.emptyHint}>not set</Text>
          )}
        </>
      )}

      {/* Resonance */}
      <SectionHeader label="resonance" editing={isEditing('resonance')} onToggle={() => toggleEditing('resonance')} />
      {isEditing('resonance') ? (
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
      ) : view.resonance ? (
        <View style={styles.irisBtn}>
          <Iris level={view.resonance} size={22} color={colors.ink} />
        </View>
      ) : (
        <Text style={styles.emptyHint}>not set</Text>
      )}

      {/* Urgency */}
      <SectionHeader label="urgency" editing={isEditing('urgency')} onToggle={() => toggleEditing('urgency')} />
      {isEditing('urgency') ? (
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
      ) : view.urgency ? (
        <View style={styles.row}>
          <Chip
            label={URGENCIES.find((u) => u.key === view.urgency)?.label ?? view.urgency}
            variant="meta"
            selected
            color={urgencyColors[view.urgency] ?? colors.ink}
          />
        </View>
      ) : (
        <Text style={styles.emptyHint}>not set</Text>
      )}

      {/* Status */}
      <SectionHeader label="status" editing={isEditing('status')} onToggle={() => toggleEditing('status')} />
      {isEditing('status') ? (
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
      ) : view.status ? (
        <View style={styles.row}>
          <Chip
            label={STATUSES.find((s) => s.key === view.status)?.label ?? view.status}
            variant="meta"
            selected
            color={statusColors[view.status] ?? colors.ink}
          />
        </View>
      ) : (
        <Text style={styles.emptyHint}>not set</Text>
      )}

      {/* Difficulty */}
      <SectionHeader label="difficulty" editing={isEditing('difficulty')} onToggle={() => toggleEditing('difficulty')} />
      {isEditing('difficulty') ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {DIFFICULTIES.map((d) => {
            const active = view.difficulty === d.key;
            return (
              <Chip
                key={d.key}
                label={d.label}
                variant="meta"
                selected={active}
                color={active ? colors.ink : colors.inkMuted}
                onPress={() =>
                  stage({
                    difficulty:
                      view.difficulty === d.key ? null : (d.key as 'beginner' | 'intermediate' | 'advanced'),
                  })
                }
              />
            );
          })}
        </ScrollView>
      ) : view.difficulty ? (
        <View style={styles.row}>
          <Chip label={view.difficulty} variant="meta" selected color={colors.ink} />
        </View>
      ) : (
        <Text style={styles.emptyHint}>not set</Text>
      )}

      {/* Time to complete */}
      <SectionHeader label="time to complete" editing={isEditing('time')} onToggle={() => toggleEditing('time')} />
      {isEditing('time') ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {TIMES_TO_COMPLETE.map((t) => {
            const active = view.timeToComplete === t.key;
            return (
              <Chip
                key={t.key}
                label={t.label}
                variant="meta"
                selected={active}
                color={active ? colors.ink : colors.inkMuted}
                onPress={() =>
                  stage({
                    timeToComplete:
                      view.timeToComplete === t.key
                        ? null
                        : (t.key as 'quick' | 'afternoon' | 'full_day' | 'multi_day' | 'long_term'),
                  })
                }
              />
            );
          })}
        </ScrollView>
      ) : view.timeToComplete ? (
        <View style={styles.row}>
          <Chip
            label={TIMES_TO_COMPLETE.find((t) => t.key === view.timeToComplete)?.label ?? view.timeToComplete}
            variant="meta"
            selected
            color={colors.ink}
          />
        </View>
      ) : (
        <Text style={styles.emptyHint}>not set</Text>
      )}

      {/* Tags — read mode shows tag chips (no remove X); edit mode adds X + the input + tag-type cycle on tap */}
      <SectionHeader label="tags" editing={isEditing('tags')} onToggle={() => toggleEditing('tags')} />
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
                      label={tag.type ? `${tag.type}:${tag.value}` : tag.value}
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
              </>
            )}
          </>
        );
      })()}

      {/* Action URL — AI-suggested action button (tickets/buy/recipe/etc.) */}
      {item.actionUrl && (
        <Pressable
          onPress={() => Linking.openURL(item.actionUrl!).catch(() => {})}
          style={styles.actionUrlBtn}
        >
          <Ionicons name={actionUrlIcon(item.actionUrlType)} size={18} color={colors.parchment} />
          <Text style={styles.actionUrlText}>
            {item.actionUrlType ?? 'open'}
          </Text>
        </Pressable>
      )}

      {/* Source URL — read mode shows tappable link; edit mode shows input */}
      <SectionHeader label="source url" editing={isEditing('source')} onToggle={() => toggleEditing('source')} />
      {isEditing('source') ? (
        <BottomSheetTextInput
          value={view.sourceUrlManual ?? ''}
          onChangeText={(t) => stage({ sourceUrlManual: t.trim() || null })}
          placeholder={effectiveSourceUrl ? 'override or paste a URL' : 'paste a URL'}
          placeholderTextColor={colors.inkMuted}
          autoCapitalize="none"
          keyboardType="url"
          style={styles.urlInput}
        />
      ) : effectiveSourceUrl ? (
        <Pressable
          onPress={() => Linking.openURL(effectiveSourceUrl).catch(() => {})}
          style={styles.urlRow}
        >
          <Ionicons name="open-outline" size={16} color={colors.ink} />
          <Text numberOfLines={1} style={styles.urlText}>
            {effectiveSourceUrl}
          </Text>
        </Pressable>
      ) : (
        <Text style={styles.emptyHint}>not set</Text>
      )}

      {/* Notes — read mode shows text; edit mode shows multi-line input */}
      <SectionHeader label="notes" editing={isEditing('notes')} onToggle={() => toggleEditing('notes')} />
      {isEditing('notes') ? (
        <BottomSheetTextInput
          value={view.notes ?? ''}
          onChangeText={(t) => stage({ notes: t })}
          multiline
          placeholder="quick thought, link, anything…"
          placeholderTextColor={colors.inkMuted}
          style={styles.notesInput}
        />
      ) : view.notes ? (
        <Text style={styles.notesReadOnly}>{view.notes}</Text>
      ) : (
        <Text style={styles.emptyHint}>not set</Text>
      )}

      {/* Footer actions: share + delete (per spec — no AI re-analyze button) */}
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
  sectionHead: { marginTop: 22, marginBottom: 10 },
  sectionLabelEditing: { color: colors.ink, fontWeight: '700' },
  sectionEditHint: {
    fontSize: 9,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.divider,
    marginTop: 2,
  },
  emptyHint: {
    fontSize: 12,
    color: colors.inkMuted,
    fontStyle: 'italic',
  },
  subjectReadOnly: {
    fontSize: 18,
    fontFamily: 'Georgia',
    color: colors.ink,
    paddingVertical: 4,
  },
  breadcrumb: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 22,
    marginBottom: 4,
    flexWrap: 'wrap',
  },
  breadcrumbSubject: {
    fontFamily: 'Georgia',
    fontSize: 17,
    color: colors.ink,
  },
  notesReadOnly: {
    fontSize: 14,
    color: colors.ink,
    paddingVertical: 6,
    lineHeight: 20,
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
  actionUrlBtn: {
    marginTop: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    backgroundColor: colors.ink,
    borderRadius: 4,
  },
  actionUrlText: {
    color: colors.parchment,
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
    borderColor: colors.divider,
  },
  urlText: {
    flex: 1,
    fontSize: 13,
    color: colors.ink,
    textDecorationLine: 'underline',
  },
  urlInput: {
    fontSize: 13,
    color: colors.ink,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.inkMuted,
    borderRadius: 3,
    marginTop: 8,
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
