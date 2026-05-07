import { Ionicons } from '@expo/vector-icons';
import { BottomSheetBackdrop, BottomSheetModal, type BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import * as ImagePicker from 'expo-image-picker';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { Card, type CardData } from '@/components/Card';
import { applyFilters, emptyFilters, FilterBar, type Filters } from '@/components/FilterBar';
import { ScreenshotDetail } from '@/components/ScreenshotDetail';
import { SignIn } from '@/components/SignIn';
import { analyzeAndPersist, isAnalyzeConfigured } from '@/lib/analyze';
import { signOut, useSession } from '@/lib/auth';
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
  const [refreshing, setRefreshing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>(emptyFilters());
  const [analyzingIds, setAnalyzingIds] = useState<Set<string>>(new Set());

  const visibleItems = useMemo(() => applyFilters(items, filters), [items, filters]);

  const onRefresh = useCallback(async () => {
    if (!session) return;
    setRefreshing(true);
    try {
      const rows = await fetchScreenshots();
      setItems(rows);
    } finally {
      setRefreshing(false);
    }
  }, [session]);

  const sheetRef = useRef<BottomSheetModal>(null);
  // 3 snap points lets user drag from 60% (compact) -> 85% -> 100% (full detail per spec).
  const snapPoints = useMemo(() => ['60%', '85%', '100%'], []);

  useEffect(() => {
    if (!session) return;
    fetchScreenshots().then((rows) => setItems(rows));
  }, [session]);

  const onPick = async () => {
    setBusy(true);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          'Photo permission needed',
          'Overlook needs access to your gallery to add screenshots. Open Settings → Apps → Overlook → Permissions to enable.',
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        // Sprint v1: cap at 10 so 10 simultaneous base64 reads + AI calls don't
        // crash the phone process. Bulk import (per CLAUDE.md) is a separate flow.
        selectionLimit: 10,
        quality: 0.9,
      });
      if (result.canceled) return;

      const uploads = await Promise.all(result.assets.map((a) => uploadScreenshot(a.uri)));

      // 1) Show the cards immediately (no AI tags yet).
      setItems((prev) => [...uploads, ...prev]);

      // 2) Mark them as analyzing only if AI is configured.
      if (isAnalyzeConfigured) {
        setAnalyzingIds((prev) => {
          const next = new Set(prev);
          for (const u of uploads) next.add(u.id);
          return next;
        });

        // 3) Fire analyses after setItems so the cards exist before patches arrive.
        for (const u of uploads) {
          void (async () => {
            const patch = await analyzeAndPersist(u.uri, u.id);
            setAnalyzingIds((prev) => {
              const next = new Set(prev);
              next.delete(u.id);
              return next;
            });
            if (!patch) return;
            setItems((prev) => prev.map((it) => (it.id === u.id ? { ...it, ...patch } : it)));
          })();
        }
      }
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

  const onSignOut = () => {
    Alert.alert('Sign out?', `You'll be signed out of ${session?.user.email ?? 'your account'}.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          setItems([]);
        },
      },
    ]);
  };

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
      {session && (
        <Pressable
          onPress={onSignOut}
          accessibilityLabel="Sign out"
          hitSlop={12}
          style={styles.signOutBtn}
        >
          <Ionicons name="log-out-outline" size={20} color={colors.inkMuted} />
        </Pressable>
      )}
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
          data={visibleItems}
          keyExtractor={(it) => it.id}
          numColumns={GRID_COLUMNS}
          contentContainerStyle={{ paddingBottom: 96 }}
          columnWrapperStyle={{ gap: GRID_GAP }}
          ItemSeparatorComponent={() => <View style={{ height: GRID_GAP }} />}
          ListHeaderComponent={<FilterBar filters={filters} onChange={setFilters} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptySub}>no screenshots match these filters</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.cell}>
              <Card
                data={toCardData(item)}
                analyzing={analyzingIds.has(item.id)}
                onPress={() => openDetail(item)}
              />
            </View>
          )}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.ink}
              colors={[colors.ink]}
            />
          }
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
  signOutBtn: {
    position: 'absolute',
    top: 56,
    right: 20,
    zIndex: 10,
    padding: 6,
  },
});
