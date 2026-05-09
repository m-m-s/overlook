import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Iris } from '@/components/Iris';
import { useToast } from '@/components/Toast';
import type { FontSet, Palette } from '@/lib/colors';
import { filtersActive } from '@/lib/filters';
import { useFilters } from '@/lib/filtersContext';
import { heavyHaptic } from '@/lib/haptics';
import { useColors, useFonts } from '@/lib/themeContext';
import {
  deleteSavedFilter,
  listSavedFilters,
  renameSavedFilter,
  togglePinned,
  type SavedFilter,
} from '@/lib/savedFilters';

export default function SavedFiltersScreen() {
  const toast = useToast();
  const { applyFilters, setSearchQuery } = useFilters();
  const [items, setItems] = useState<SavedFilter[]>([]);
  const [loading, setLoading] = useState(true);
  const insets = useSafeAreaInsets();
  const [renameTarget, setRenameTarget] = useState<SavedFilter | null>(null);
  const [renameText, setRenameText] = useState('');
  const c = useColors();
  const f = useFonts();
  const styles = useMemo(() => makeStyles(c, f), [c, f]);

  const load = async () => {
    setLoading(true);
    const data = await listSavedFilters();
    setItems(data);
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const onApply = (sf: SavedFilter) => {
    applyFilters(sf.filters);
    setSearchQuery(sf.searchQuery ?? '');
    router.replace('/library');
  };

  const onTogglePin = async (sf: SavedFilter) => {
    const next = !sf.pinned;
    setItems((prev) => prev.map((it) => (it.id === sf.id ? { ...it, pinned: next } : it)));
    await togglePinned(sf.id, next);
    toast.show(next ? 'pinned to home ✓' : 'unpinned');
  };

  const onLongPress = (sf: SavedFilter) => {
    void heavyHaptic();
    Alert.alert(sf.name, 'Manage saved filter', [
      { text: 'cancel', style: 'cancel' },
      {
        text: 'rename',
        onPress: () => {
          setRenameTarget(sf);
          setRenameText(sf.name);
        },
      },
      {
        text: 'delete',
        style: 'destructive',
        onPress: async () => {
          await deleteSavedFilter(sf.id);
          setItems((prev) => prev.filter((it) => it.id !== sf.id));
          toast.show('deleted');
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={22} color={c.ink} />
        </Pressable>
        <Text style={styles.title}>Saved filters</Text>
      </View>

      {loading ? (
        <Text style={styles.empty}>Loading…</Text>
      ) : items.length === 0 ? (
        <View style={styles.emptyWrap}>
          <View style={styles.emptyHero}>
            <Iris level={3} size={48} color={c.ink} />
          </View>
          <Text style={styles.emptyTitle}>No saved filters yet</Text>
          <Text style={styles.emptyBody}>
            Apply some filters from the sidebar, then tap save in the grid header to bookmark them.
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.id}
          contentContainerStyle={{ paddingBottom: 60 + insets.bottom }}
          renderItem={({ item }) => {
            const count = filtersActive(item.filters);
            return (
              <Pressable
                onPress={() => onApply(item)}
                onLongPress={() => onLongPress(item)}
                style={styles.row}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName}>{item.name}</Text>
                  <Text style={styles.rowMeta}>
                    {count} {count === 1 ? 'filter' : 'filters'} · {item.pinned ? 'pinned' : 'not pinned'}
                  </Text>
                </View>
                <Pressable onPress={() => onTogglePin(item)} hitSlop={10} style={styles.pinBtn}>
                  <Ionicons
                    name={item.pinned ? 'bookmark' : 'bookmark-outline'}
                    size={20}
                    color={item.pinned ? c.ink : c.inkMuted}
                  />
                </Pressable>
              </Pressable>
            );
          }}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
        />
      )}

      {/* Rename modal — Alert.prompt is iOS-only, so we render a simple
          centered modal with a text input that works on both platforms. */}
      <Modal
        visible={renameTarget !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setRenameTarget(null)}
        statusBarTranslucent
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalBackdrop}
        >
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setRenameTarget(null)} />
        <Pressable style={styles.modalCard} onPress={() => {}}>
            <Text style={styles.modalTitle}>Rename filter</Text>
            <TextInput
              value={renameText}
              onChangeText={setRenameText}
              placeholder="filter name"
              placeholderTextColor={c.inkMuted}
              autoFocus
              style={styles.modalInput}
            />
            <View style={styles.modalBtnRow}>
              <Pressable
                onPress={() => setRenameTarget(null)}
                style={[styles.modalBtn, styles.modalBtnCancel]}
              >
                <Text style={styles.modalBtnCancelText}>cancel</Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  if (!renameTarget) return;
                  const trimmed = renameText.trim();
                  if (!trimmed || trimmed === renameTarget.name) {
                    setRenameTarget(null);
                    return;
                  }
                  await renameSavedFilter(renameTarget.id, trimmed);
                  setItems((prev) =>
                    prev.map((it) =>
                      it.id === renameTarget.id ? { ...it, name: trimmed } : it,
                    ),
                  );
                  toast.show('renamed');
                  setRenameTarget(null);
                }}
                style={[styles.modalBtn, styles.modalBtnSave]}
              >
                <Text style={styles.modalBtnSaveText}>save</Text>
              </Pressable>
            </View>
        </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const makeStyles = (c: Palette, f: FontSet) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.parchment },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingTop: 56,
      paddingBottom: 16,
      paddingHorizontal: 20,
      gap: 12,
    },
    backBtn: { padding: 4 },
    title: { fontFamily: f.displayMedium, fontSize: 26, color: c.ink, letterSpacing: -0.4 },
    empty: { padding: 24, color: c.inkMuted, fontStyle: 'italic' },
    emptyWrap: { padding: 32, alignItems: 'center', paddingTop: 80 },
    emptyHero: { marginBottom: 22, opacity: 0.92 },
    emptyTitle: {
      fontFamily: f.displayMedium,
      fontSize: 26,
      color: c.ink,
      marginBottom: 10,
      letterSpacing: -0.4,
    },
    emptyBody: {
      fontFamily: f.italic,
      fontSize: 14,
      color: c.inkSoft,
      lineHeight: 22,
      textAlign: 'center',
      maxWidth: 280,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 16,
      gap: 14,
    },
    rowName: { fontFamily: f.displayMedium, fontSize: 17, color: c.ink },
    rowMeta: {
      fontSize: 11,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      color: c.inkMuted,
      marginTop: 4,
    },
    pinBtn: { padding: 6 },
    sep: { height: 1, backgroundColor: c.divider, marginHorizontal: 20 },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
    },
    modalCard: {
      backgroundColor: c.parchment,
      borderRadius: 12,
      padding: 20,
      width: '100%',
      maxWidth: 360,
      gap: 12,
    },
    modalTitle: {
      fontFamily: f.displayMedium,
      fontSize: 18,
      color: c.ink,
    },
    modalInput: {
      fontSize: 16,
      color: c.ink,
      fontFamily: f.displayMedium,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderStyle: 'dashed',
      borderColor: c.ink,
      paddingVertical: 8,
    },
    modalBtnRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: 12,
      marginTop: 4,
    },
    modalBtn: { paddingVertical: 10, paddingHorizontal: 18, borderRadius: 4 },
    modalBtnCancel: {},
    modalBtnCancelText: {
      color: c.inkMuted,
      fontSize: 12,
      letterSpacing: 1.4,
      textTransform: 'uppercase',
    },
    modalBtnSave: { backgroundColor: c.ink },
    modalBtnSaveText: {
      color: c.parchment,
      fontSize: 12,
      letterSpacing: 1.4,
      textTransform: 'uppercase',
      fontWeight: '600',
    },
  });
