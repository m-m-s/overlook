import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { CategoryIcon, type Category } from './CategoryIcon';
import { useToast } from './Toast';
import { colors } from '@/lib/colors';
import { type Filters } from '@/lib/filters';
import { useFilters } from '@/lib/filtersContext';
import { CATEGORIES } from '@/lib/options';
import { createSavedFilter, type SavedFilter } from '@/lib/savedFilters';

type Props = {
  filters: Filters;
  onSaved?: (sf: SavedFilter) => void;
  /** Render as an inline small-caps text link (for the active-filters bar). */
  compact?: boolean;
};

/**
 * Tiny "save" button for the filtered grid header. Opens a small modal:
 * name input + pin toggle + save/cancel.
 */
export const SaveFilterButton = ({ filters, onSaved, compact }: Props) => {
  const toast = useToast();
  const { searchQuery } = useFilters();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [pinned, setPinned] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Either a CATEGORIES key (silhouette icon) or any short string
   *  (typically a single emoji). Empty = no icon on the home row. */
  const [icon, setIcon] = useState('');
  const [emojiDraft, setEmojiDraft] = useState('');

  const onSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert('Name required', 'Give your saved filter a short name.');
      return;
    }
    setBusy(true);
    try {
      const sf = await createSavedFilter(
        trimmed,
        filters,
        pinned,
        searchQuery,
        icon || undefined,
      );
      if (!sf) {
        toast.error('Save failed — try again.');
        return;
      }
      toast.show(pinned ? 'saved & pinned to home ✓' : 'filter saved ✓');
      onSaved?.(sf);
      setOpen(false);
      setName('');
      setPinned(false);
      setIcon('');
      setEmojiDraft('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {compact ? (
        <Pressable onPress={() => setOpen(true)} hitSlop={6}>
          <Text style={styles.compactLink}>save as album</Text>
        </Pressable>
      ) : (
        <Pressable onPress={() => setOpen(true)} hitSlop={6} style={styles.btn}>
          <Ionicons name="bookmark-outline" size={14} color={colors.ink} />
          <Text style={styles.btnText}>save</Text>
        </Pressable>
      )}

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
        statusBarTranslucent
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.backdrop}
        >
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
        <Pressable style={styles.card} onPress={() => {}}>
            <Text style={styles.title}>Save filter</Text>
            <Text style={styles.help}>Name this filter combo so you can come back to it.</Text>

            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. gift ideas for Anton, fall craft inspo"
              placeholderTextColor={colors.inkMuted}
              autoCapitalize="none"
              autoFocus
              style={styles.input}
            />

            {/* Icon picker — optional. Pick a category silhouette or
                type an emoji. Empty = row shows no icon, just title. */}
            <Text style={styles.iconLabel}>Icon (optional)</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.iconRow}
            >
              <Pressable
                onPress={() => {
                  setIcon('');
                  setEmojiDraft('');
                }}
                style={[styles.iconChip, !icon && styles.iconChipOn]}
                accessibilityLabel="No icon"
              >
                <Text style={[styles.iconChipText, !icon && { color: colors.parchment }]}>
                  none
                </Text>
              </Pressable>
              {CATEGORIES.map((cat) => {
                const selected = icon === cat;
                return (
                  <Pressable
                    key={cat}
                    onPress={() => {
                      setIcon(cat);
                      setEmojiDraft('');
                    }}
                    style={[styles.iconChip, selected && styles.iconChipOn]}
                    accessibilityLabel={`Use ${cat} icon`}
                  >
                    <CategoryIcon
                      category={cat as Category}
                      size={18}
                      color={selected ? colors.parchment : colors.ink}
                    />
                  </Pressable>
                );
              })}
            </ScrollView>
            <TextInput
              value={emojiDraft}
              onChangeText={(v) => {
                setEmojiDraft(v);
                // First grapheme only — keeps the chip visually tidy.
                const first = Array.from(v)[0] ?? '';
                setIcon(first);
              }}
              placeholder="…or type an emoji"
              placeholderTextColor={colors.inkMuted}
              maxLength={4}
              style={styles.emojiInput}
            />

            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleLabel}>Pin to home</Text>
                <Text style={styles.toggleHint}>Show as a row on the home screen.</Text>
              </View>
              <Switch
                value={pinned}
                onValueChange={setPinned}
                trackColor={{ false: colors.divider, true: colors.ink }}
                thumbColor={colors.parchment}
              />
            </View>

            <View style={styles.btnRow}>
              <Pressable onPress={() => setOpen(false)} style={[styles.modalBtn, styles.cancelBtn]}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={onSave}
                disabled={busy}
                style={[styles.modalBtn, styles.applyBtn, busy && { opacity: 0.5 }]}
              >
                <Text style={styles.applyText}>{busy ? 'Saving…' : 'Save'}</Text>
              </Pressable>
            </View>
        </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  compactLink: {
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.inkMuted,
    textDecorationLine: 'underline',
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.ink,
    borderRadius: 3,
  },
  btnText: {
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.ink,
    fontWeight: '600',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.parchment,
    borderRadius: 8,
    padding: 24,
  },
  title: { fontFamily: 'PlayfairDisplay_500Medium', fontSize: 22, color: colors.ink, marginBottom: 4 },
  help: { fontSize: 12, color: colors.inkMuted, marginBottom: 18, lineHeight: 17 },
  input: {
    fontSize: 16,
    fontFamily: 'PlayfairDisplay_500Medium',
    color: colors.ink,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.inkMuted,
  },
  iconLabel: {
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.inkMuted,
    marginTop: 18,
    marginBottom: 8,
  },
  iconRow: {
    flexDirection: 'row',
    gap: 6,
    paddingRight: 8,
  },
  iconChip: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.ink,
    borderRadius: 4,
    paddingHorizontal: 8,
  },
  iconChipOn: {
    backgroundColor: colors.ink,
  },
  iconChipText: {
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.ink,
  },
  emojiInput: {
    fontSize: 20,
    paddingVertical: 8,
    marginTop: 8,
    color: colors.ink,
    borderBottomWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.inkMuted,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 22,
    paddingVertical: 8,
  },
  toggleLabel: {
    fontSize: 13,
    color: colors.ink,
    marginBottom: 2,
  },
  toggleHint: { fontSize: 11, color: colors.inkMuted },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 22 },
  modalBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 4 },
  cancelBtn: { borderWidth: 1, borderColor: colors.ink },
  cancelText: {
    fontSize: 12,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.ink,
  },
  applyBtn: { backgroundColor: colors.ink },
  applyText: {
    fontSize: 12,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.parchment,
    fontWeight: '600',
  },
});
