import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { useToast } from './Toast';
import { colors } from '@/lib/colors';
import { type Filters } from '@/lib/filters';
import { createSavedFilter, type SavedFilter } from '@/lib/savedFilters';

type Props = {
  filters: Filters;
  onSaved?: (sf: SavedFilter) => void;
};

/**
 * Tiny "save" button for the filtered grid header. Opens a small modal:
 * name input + pin toggle + save/cancel.
 */
export const SaveFilterButton = ({ filters, onSaved }: Props) => {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [pinned, setPinned] = useState(false);
  const [busy, setBusy] = useState(false);

  const onSave = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert('name required', 'give your saved filter a short name.');
      return;
    }
    setBusy(true);
    try {
      const sf = await createSavedFilter(trimmed, filters, pinned);
      if (!sf) {
        toast.error('save failed — try again');
        return;
      }
      toast.show(pinned ? 'saved & pinned to home ✓' : 'filter saved ✓');
      onSaved?.(sf);
      setOpen(false);
      setName('');
      setPinned(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Pressable onPress={() => setOpen(true)} hitSlop={6} style={styles.btn}>
        <Ionicons name="bookmark-outline" size={14} color={colors.ink} />
        <Text style={styles.btnText}>save</Text>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.card} onPress={() => {}}>
            <Text style={styles.title}>save filter</Text>
            <Text style={styles.help}>name this filter combo so you can come back to it.</Text>

            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. gift ideas for Anton, fall craft inspo"
              placeholderTextColor={colors.inkMuted}
              autoCapitalize="none"
              autoFocus
              style={styles.input}
            />

            <View style={styles.toggleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.toggleLabel}>pin to home</Text>
                <Text style={styles.toggleHint}>show as a row on the home screen</Text>
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
                <Text style={styles.cancelText}>cancel</Text>
              </Pressable>
              <Pressable
                onPress={onSave}
                disabled={busy}
                style={[styles.modalBtn, styles.applyBtn, busy && { opacity: 0.5 }]}
              >
                <Text style={styles.applyText}>{busy ? 'saving…' : 'save'}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
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
  title: { fontFamily: 'Georgia', fontSize: 22, color: colors.ink, marginBottom: 4 },
  help: { fontSize: 12, color: colors.inkMuted, marginBottom: 18, lineHeight: 17 },
  input: {
    fontSize: 16,
    fontFamily: 'Georgia',
    color: colors.ink,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.divider,
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
