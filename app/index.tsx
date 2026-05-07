import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/lib/colors';
import { uploadScreenshot, type LocalScreenshot } from '@/lib/uploads';

const GRID_COLUMNS = 3;
const GRID_GAP = 3;

export default function LibraryScreen() {
  const [items, setItems] = useState<LocalScreenshot[]>([]);
  const [busy, setBusy] = useState(false);

  const onPick = async () => {
    setBusy(true);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: 0,
        quality: 1,
      });
      if (result.canceled) return;

      const uploads = await Promise.all(result.assets.map((a) => uploadScreenshot(a.uri)));
      setItems((prev) => [...uploads, ...prev]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      {items.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Overlook</Text>
          <Text style={styles.emptySub}>your screenshot library</Text>
          <Pressable
            accessibilityLabel="Upload screenshots"
            onPress={onPick}
            disabled={busy}
            style={({ pressed }) => [styles.bigBtn, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.bigBtnText}>{busy ? 'uploading…' : 'upload screenshots'}</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(it) => it.id}
          numColumns={GRID_COLUMNS}
          contentContainerStyle={{ paddingTop: 24, paddingBottom: 96 }}
          columnWrapperStyle={{ gap: GRID_GAP }}
          ItemSeparatorComponent={() => <View style={{ height: GRID_GAP }} />}
          renderItem={({ item }) => (
            <View style={styles.cell}>
              <Image source={{ uri: item.uri }} style={styles.thumb} contentFit="cover" />
            </View>
          )}
        />
      )}
      {items.length > 0 && (
        <Pressable
          accessibilityLabel="Add more screenshots"
          onPress={onPick}
          disabled={busy}
          style={({ pressed }) => [styles.fab, pressed && { opacity: 0.8 }]}
        >
          <Text style={styles.fabText}>{busy ? '…' : '+'}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.parchment },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyTitle: { fontFamily: 'Georgia', fontSize: 44, color: colors.ink, letterSpacing: -0.5 },
  emptySub: {
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: colors.inkMuted,
    marginTop: 6,
    marginBottom: 32,
  },
  bigBtn: {
    backgroundColor: colors.ink,
    paddingHorizontal: 28,
    paddingVertical: 16,
    borderRadius: 4,
  },
  bigBtnText: {
    color: colors.parchment,
    fontSize: 14,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  cell: { flex: 1 / GRID_COLUMNS, aspectRatio: 1 },
  thumb: { width: '100%', height: '100%', backgroundColor: colors.divider },
  fab: {
    position: 'absolute',
    right: 24,
    bottom: 36,
    width: 56,
    height: 56,
    borderRadius: 4,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabText: { color: colors.parchment, fontSize: 28, lineHeight: 30 },
});
