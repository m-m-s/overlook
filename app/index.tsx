import { BottomSheetBackdrop, BottomSheetModal, type BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Card, type CardData } from '@/components/Card';
import { ScreenshotDetail } from '@/components/ScreenshotDetail';
import { SignIn } from '@/components/SignIn';
import { useSession } from '@/lib/auth';
import { colors, statusColors, urgencyColors } from '@/lib/colors';
import { fetchScreenshots } from '@/lib/screenshots';
import { isSupabaseConfigured } from '@/lib/supabase';
import { uploadScreenshot, type LocalScreenshot } from '@/lib/uploads';

const GRID_COLUMNS = 3;
const GRID_GAP = 3;

const toCardData = (it: LocalScreenshot): CardData => ({
  id: it.id,
  uri: it.uri,
  category: it.category ?? null,
  status: (it.status as keyof typeof statusColors) ?? null,
  urgency: (it.urgency as keyof typeof urgencyColors) ?? null,
  resonance: it.resonance ?? null,
});

export default function LibraryScreen() {
  const { session, loading } = useSession();
  const [items, setItems] = useState<LocalScreenshot[]>([]);
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const sheetRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ['70%', '95%'], []);

  useEffect(() => {
    if (!session) return;
    fetchScreenshots().then((rows) => setItems(rows));
  }, [session]);

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

      const onAnalyzed = (id: string, patch: Partial<LocalScreenshot> | null) => {
        if (!patch) return;
        setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
      };
      const uploads = await Promise.all(
        result.assets.map((a) => uploadScreenshot(a.uri, { onAnalyzed })),
      );
      setItems((prev) => [...uploads, ...prev]);
    } finally {
      setBusy(false);
    }
  };

  const openDetail = (it: LocalScreenshot) => {
    setSelectedId(it.id);
    sheetRef.current?.present();
  };

  const onItemChange = (patch: Partial<LocalScreenshot>) => {
    if (!selectedId) return;
    setItems((prev) => prev.map((it) => (it.id === selectedId ? { ...it, ...patch } : it)));
  };

  const onItemDelete = () => {
    if (!selectedId) return;
    setItems((prev) => prev.filter((it) => it.id !== selectedId));
    sheetRef.current?.dismiss();
  };

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.4} />
    ),
    [],
  );

  const selected = items.find((it) => it.id === selectedId) ?? null;

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  if (isSupabaseConfigured && !session) {
    return <SignIn />;
  }

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
              <Card data={toCardData(item)} onPress={() => openDetail(item)} />
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

      <BottomSheetModal
        ref={sheetRef}
        snapPoints={snapPoints}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: colors.parchment }}
        handleIndicatorStyle={{ backgroundColor: colors.inkMuted }}
        onDismiss={() => setSelectedId(null)}
      >
        {selected && (
          <ScreenshotDetail item={selected} onChange={onItemChange} onDelete={onItemDelete} />
        )}
      </BottomSheetModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.parchment },
  center: { alignItems: 'center', justifyContent: 'center' },
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
