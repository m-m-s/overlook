import { BottomSheetScrollView, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Chip } from './Chip';
import { Iris } from './Iris';
import { useToast } from './Toast';
import { colors, statusColors, urgencyColors } from '@/lib/colors';
import { capitalize, CATEGORIES, RESONANCE_LEVELS, STATUSES, URGENCIES } from '@/lib/options';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { updateScreenshots, type ScreenshotPatch, type TypedTag } from '@/lib/screenshots';
import { buildTagFromValue, rememberTagType } from '@/lib/tagDictionary';
import type { LocalScreenshot } from '@/lib/uploads';

type Props = {
  selectedIds: string[];
  /** Called once apply completes; passes the patch + optional appended tag. */
  onApplied: (patch: Partial<LocalScreenshot>, appendedTag: TypedTag | null) => void;
  onClose: () => void;
};

type Patch = {
  category?: string | null;
  urgency?: string | null;
  status?: string | null;
  resonance?: 1 | 2 | 3 | null;
};

/** Append a single tag to each row's manual_typed_tags. Per-item read+write. */
const appendTagToAll = async (ids: string[], tag: TypedTag): Promise<void> => {
  if (!isSupabaseConfigured) return;
  for (const id of ids) {
    const { data } = await supabase
      .from('screenshots')
      .select('manual_typed_tags')
      .eq('id', id)
      .single();
    const existing = (data?.manual_typed_tags ?? []) as TypedTag[];
    const next = [...existing, tag];
    await supabase.from('screenshots').update({ manual_typed_tags: next }).eq('id', id);
  }
};

const SectionLabel = ({ children }: { children: string }) => (
  <Text style={styles.sectionLabel}>{children}</Text>
);

export const BulkTagSheet = ({ selectedIds, onApplied, onClose }: Props) => {
  const toast = useToast();
  const [patch, setPatch] = useState<Patch>({});
  const [tagText, setTagText] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingAmbiguous, setPendingAmbiguous] = useState<{ value: string; candidates: string[] } | null>(null);

  const setField = <K extends keyof Patch>(key: K, value: Patch[K]) => {
    setPatch((prev) => ({ ...prev, [key]: prev[key] === value ? null : value }));
  };

  const fieldsCount = Object.keys(patch).filter((k) => patch[k as keyof Patch] !== undefined).length;
  const hasTagText = tagText.trim().length > 0;
  const canApply = (fieldsCount > 0 || hasTagText) && !busy;

  const onApply = async () => {
    if (!canApply) return;
    setBusy(true);
    try {
      let appendedTag: TypedTag | null = null;

      // Resolve tag (with auto-typing) before any writes.
      if (hasTagText) {
        const result = await buildTagFromValue(tagText.trim());
        if ('ambiguous' in result) {
          setPendingAmbiguous({ value: result.value, candidates: result.candidates });
          setBusy(false);
          return;
        }
        appendedTag = result;
      }

      // Apply scalar patch in one query.
      const scalarPatch: ScreenshotPatch = patch as ScreenshotPatch;
      if (fieldsCount > 0) {
        const { error } = await updateScreenshots(selectedIds, scalarPatch);
        if (error) {
          toast.error(`bulk save failed: ${error.slice(0, 80)}`);
          return;
        }
      }

      // Append tag per row.
      if (appendedTag) await appendTagToAll(selectedIds, appendedTag);

      onApplied(patch as Partial<LocalScreenshot>, appendedTag);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const resolveAmbiguous = async (type: string | null) => {
    if (!pendingAmbiguous) return;
    const tag: TypedTag = type
      ? { type, value: pendingAmbiguous.value }
      : { value: pendingAmbiguous.value };
    if (type) await rememberTagType(pendingAmbiguous.value, type);
    setPendingAmbiguous(null);
    setBusy(true);
    try {
      const scalarPatch: ScreenshotPatch = patch as ScreenshotPatch;
      if (fieldsCount > 0) {
        const { error } = await updateScreenshots(selectedIds, scalarPatch);
        if (error) {
          toast.error(`bulk save failed: ${error.slice(0, 80)}`);
          return;
        }
      }
      await appendTagToAll(selectedIds, tag);
      onApplied(patch as Partial<LocalScreenshot>, tag);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheetScrollView contentContainerStyle={styles.scroll}>
      <Text style={styles.title}>Tag {selectedIds.length} screenshot{selectedIds.length === 1 ? '' : 's'}</Text>
      <Text style={styles.help}>
        Only the fields you set will change. Tags are added (existing tags stay).
      </Text>

      <SectionLabel>category</SectionLabel>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {CATEGORIES.map((cat) => {
          const active = patch.category === cat;
          return (
            <Chip
              key={cat}
              label={capitalize(cat)}
              variant="meta"
              selected={active}
              color={active ? colors.ink : colors.inkMuted}
              onPress={() => setField('category', cat)}
            />
          );
        })}
      </ScrollView>

      <SectionLabel>resonance</SectionLabel>
      <View style={styles.row}>
        {RESONANCE_LEVELS.map((r) => {
          const active = patch.resonance === r;
          return (
            <Pressable
              key={r}
              onPress={() => setField('resonance', r)}
              style={[styles.irisBtn, active && styles.irisBtnActive]}
            >
              <Iris level={r} size={22} color={active ? colors.parchment : colors.ink} />
            </Pressable>
          );
        })}
      </View>

      <SectionLabel>urgency</SectionLabel>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {URGENCIES.map((u) => {
          const active = patch.urgency === u.key;
          return (
            <Chip
              key={u.key}
              label={u.label}
              variant="meta"
              selected={active}
              color={active ? urgencyColors[u.key] : colors.inkMuted}
              onPress={() => setField('urgency', u.key)}
            />
          );
        })}
      </ScrollView>

      <SectionLabel>status</SectionLabel>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {STATUSES.map((s) => {
          const active = patch.status === s.key;
          return (
            <Chip
              key={s.key}
              label={s.label}
              variant="meta"
              selected={active}
              color={active ? statusColors[s.key] : colors.inkMuted}
              onPress={() => setField('status', s.key)}
            />
          );
        })}
      </ScrollView>

      <SectionLabel>add tag (applied to all)</SectionLabel>
      <BottomSheetTextInput
        value={tagText}
        onChangeText={setTagText}
        placeholder="e.g. gift idea"
        placeholderTextColor={colors.inkMuted}
        autoCapitalize="none"
        style={styles.tagInput}
      />

      {pendingAmbiguous && (
        <View style={styles.ambiguousRow}>
          <Text style={styles.ambiguousLabel}>
            is &quot;{pendingAmbiguous.value}&quot; a…
          </Text>
          <View style={[styles.row, styles.wrap]}>
            {pendingAmbiguous.candidates.map((cand) => (
              <Chip key={cand} label={cand} variant="meta" color={colors.ink} onPress={() => resolveAmbiguous(cand)} />
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

      <View style={styles.footer}>
        <Pressable onPress={onClose} style={styles.cancelBtn}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
        <Pressable
          onPress={onApply}
          disabled={!canApply}
          style={[styles.applyBtn, !canApply && { opacity: 0.4 }]}
        >
          <Text style={styles.applyText}>{busy ? 'applying…' : 'apply'}</Text>
        </Pressable>
      </View>
    </BottomSheetScrollView>
  );
};

const styles = StyleSheet.create({
  scroll: { padding: 20, paddingBottom: 60, gap: 4 },
  title: { fontFamily: 'PlayfairDisplay_500Medium', fontSize: 22, color: colors.ink, marginBottom: 4 },
  help: { fontSize: 12, color: colors.inkMuted, marginBottom: 8, lineHeight: 18 },
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
  ambiguousLabel: { fontSize: 12, color: colors.ink, fontStyle: 'italic' },
  footer: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 28,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.inkMuted,
    borderStyle: 'dashed',
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.ink,
    borderRadius: 4,
  },
  cancelText: {
    color: colors.ink,
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  applyBtn: {
    flex: 2,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: colors.ink,
    borderRadius: 4,
  },
  applyText: {
    color: colors.parchment,
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
});
