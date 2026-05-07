import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { useToast } from '@/components/Toast';
import { colors } from '@/lib/colors';
import { filtersActive } from '@/lib/filters';
import { useFilters } from '@/lib/filtersContext';
import {
  deleteSavedFilter,
  listSavedFilters,
  togglePinned,
  type SavedFilter,
} from '@/lib/savedFilters';

export default function SavedFiltersScreen() {
  const toast = useToast();
  const { applyFilters } = useFilters();
  const [items, setItems] = useState<SavedFilter[]>([]);
  const [loading, setLoading] = useState(true);

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
    router.replace('/library');
  };

  const onTogglePin = async (sf: SavedFilter) => {
    const next = !sf.pinned;
    setItems((prev) => prev.map((it) => (it.id === sf.id ? { ...it, pinned: next } : it)));
    await togglePinned(sf.id, next);
    toast.show(next ? 'pinned to home ✓' : 'unpinned');
  };

  const onLongPress = (sf: SavedFilter) => {
    Alert.alert(sf.name, 'manage saved filter', [
      { text: 'cancel', style: 'cancel' },
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
          <Ionicons name="arrow-back" size={22} color={colors.ink} />
        </Pressable>
        <Text style={styles.title}>saved filters</Text>
      </View>

      {loading ? (
        <Text style={styles.empty}>loading…</Text>
      ) : items.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>no saved filters yet</Text>
          <Text style={styles.emptyBody}>
            apply some filters from the sidebar, then tap save in the grid header to bookmark them.
          </Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.id}
          contentContainerStyle={{ paddingBottom: 60 }}
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
                    color={item.pinned ? colors.ink : colors.inkMuted}
                  />
                </Pressable>
              </Pressable>
            );
          }}
          ItemSeparatorComponent={() => <View style={styles.sep} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.parchment },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 56,
    paddingBottom: 16,
    paddingHorizontal: 20,
    gap: 12,
  },
  backBtn: { padding: 4 },
  title: { fontFamily: 'Georgia', fontSize: 26, color: colors.ink, letterSpacing: -0.4 },
  empty: { padding: 24, color: colors.inkMuted, fontStyle: 'italic' },
  emptyWrap: { padding: 32, alignItems: 'center' },
  emptyTitle: { fontFamily: 'Georgia', fontSize: 20, color: colors.ink, marginBottom: 10 },
  emptyBody: { color: colors.inkMuted, lineHeight: 20, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    gap: 14,
  },
  rowName: { fontFamily: 'Georgia', fontSize: 17, color: colors.ink },
  rowMeta: {
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: colors.inkMuted,
    marginTop: 4,
  },
  pinBtn: { padding: 6 },
  sep: { height: 1, backgroundColor: colors.divider, marginHorizontal: 20 },
});
