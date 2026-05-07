import { BottomSheetScrollView, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

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
import type { LocalScreenshot } from '@/lib/uploads';

type Props = {
  item: LocalScreenshot;
  onChange: (patch: Partial<LocalScreenshot>) => void;
  onDelete: () => void;
};

const SectionLabel = ({ children }: { children: string }) => (
  <Text style={styles.sectionLabel}>{children}</Text>
);

export const ScreenshotDetail = ({ item, onChange, onDelete }: Props) => {
  const { session } = useSession();
  const [manualTags, setManualTags] = useState<TypedTag[]>([]);
  const [aiTags, setAiTags] = useState<TypedTag[]>([]);
  const [notes, setNotes] = useState('');
  const [subject, setSubject] = useState(item.subject ?? '');
  const [newTag, setNewTag] = useState('');

  // Hydrate tags + notes from server when sheet opens.
  useEffect(() => {
    if (!session) return;
    fetchScreenshotMeta(item.id).then((meta) => {
      if (!meta) return;
      setManualTags(meta.manual_typed_tags);
      setAiTags(meta.ai_typed_tags);
      setNotes(meta.notes ?? '');
    });
  }, [item.id, session]);

  const persist = (patch: Parameters<typeof updateScreenshot>[1]) => {
    updateScreenshot(item.id, patch);
  };

  const setCategory = (cat: Category | null) => {
    onChange({ category: cat });
    persist({ category: cat });
  };
  const setStatus = (s: string | null) => {
    onChange({ status: s });
    persist({ status: s });
  };
  const setUrgency = (u: string | null) => {
    onChange({ urgency: u });
    persist({ urgency: u });
  };
  const setResonance = (r: 1 | 2 | 3 | null) => {
    onChange({ resonance: r });
    persist({ resonance: r });
  };

  const addTag = () => {
    const v = newTag.trim();
    if (!v) return;
    const updated = [...manualTags, { value: v }];
    setManualTags(updated);
    setNewTag('');
    persist({ manual_typed_tags: updated });
  };

  const removeTag = (idx: number) => {
    const updated = manualTags.filter((_, i) => i !== idx);
    setManualTags(updated);
    persist({ manual_typed_tags: updated });
  };

  const setTagType = (idx: number, type: string | undefined) => {
    const updated = manualTags.map((t, i) => (i === idx ? { ...t, type } : t));
    setManualTags(updated);
    persist({ manual_typed_tags: updated });
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

  // Compute edge gradient colors for the preview (same logic as Card).
  const statusColor = item.status ? statusColors[item.status] : undefined;
  const urgencyColor = item.urgency ? urgencyColors[item.urgency] : undefined;
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
        {item.category && (
          <View style={styles.previewCat}>
            <CategoryIcon category={item.category} size={26} />
          </View>
        )}
        {item.resonance && (
          <View style={styles.previewIris}>
            <Iris level={item.resonance} size={26} />
          </View>
        )}
      </View>

      {/* Category */}
      <SectionLabel>category</SectionLabel>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {CATEGORIES.map((cat) => (
          <Chip
            key={cat}
            label={cat}
            selected={item.category === cat}
            variant={item.category === cat ? 'meta' : 'meta'}
            onPress={() => setCategory(item.category === cat ? null : cat)}
            color={item.category === cat ? colors.ink : colors.inkMuted}
          />
        ))}
      </ScrollView>

      {/* Subject */}
      <SectionLabel>subject</SectionLabel>
      <BottomSheetTextInput
        value={subject}
        onChangeText={setSubject}
        onBlur={() => {
          const v = subject.trim() || null;
          onChange({ subject: v });
          persist({ subject: v });
        }}
        placeholder="specific thing — Crochet, React hook, Italian restaurant…"
        placeholderTextColor={colors.inkMuted}
        style={styles.subjectInput}
      />

      {/* Resonance */}
      <SectionLabel>resonance</SectionLabel>
      <View style={styles.row}>
        {RESONANCE_LEVELS.map((r) => {
          const active = item.resonance === r;
          return (
            <Pressable
              key={r}
              onPress={() => setResonance(active ? null : r)}
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
          const active = item.urgency === u.key;
          return (
            <Chip
              key={u.key}
              label={u.label}
              variant="meta"
              selected={active}
              color={active ? urgencyColors[u.key] : colors.inkMuted}
              onPress={() => setUrgency(active ? null : u.key)}
            />
          );
        })}
      </ScrollView>

      {/* Status */}
      <SectionLabel>status</SectionLabel>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {STATUSES.map((s) => {
          const active = item.status === s.key;
          return (
            <Chip
              key={s.key}
              label={s.label}
              variant="meta"
              selected={active}
              color={active ? statusColors[s.key] : colors.inkMuted}
              onPress={() => setStatus(active ? null : s.key)}
            />
          );
        })}
      </ScrollView>

      {/* Tags */}
      <SectionLabel>tags</SectionLabel>
      <View style={[styles.row, styles.wrap]}>
        {manualTags.map((tag, idx) => (
          <Chip
            key={`${tag.value}-${idx}`}
            label={tag.type ? `${tag.type}:${tag.value}` : tag.value}
            variant="manual"
            onPress={() => {
              // Cycle the tag type on tap (untyped -> first type -> next -> ... -> untyped)
              const types = [undefined, ...TAG_TYPES] as (string | undefined)[];
              const cur = types.indexOf(tag.type);
              const next = types[(cur + 1) % types.length];
              setTagType(idx, next);
            }}
            onRemove={() => removeTag(idx)}
          />
        ))}
        {aiTags.map((tag, idx) => (
          <Chip
            key={`ai-${tag.value}-${idx}`}
            label={tag.type ? `${tag.type}:${tag.value}` : tag.value}
            variant="ai"
          />
        ))}
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

      {/* Notes */}
      <SectionLabel>notes</SectionLabel>
      <BottomSheetTextInput
        value={notes}
        onChangeText={setNotes}
        onBlur={() => persist({ notes: notes.trim() || null })}
        multiline
        placeholder="quick thought, link, anything…"
        placeholderTextColor={colors.inkMuted}
        style={styles.notesInput}
      />

      {/* Delete */}
      <Pressable onPress={onTrash} style={styles.deleteBtn}>
        <Text style={styles.deleteText}>delete from library</Text>
      </Pressable>
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
  deleteBtn: {
    marginTop: 32,
    paddingVertical: 14,
    alignItems: 'center',
    borderTopWidth: 2,
    borderTopColor: colors.divider,
    borderStyle: 'dashed',
  },
  deleteText: {
    color: '#C0392B',
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
});
