import { Ionicons } from '@expo/vector-icons';
import { BottomSheetBackdrop, BottomSheetModal, type BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { ActiveFilters } from '@/components/ActiveFilters';
import { BulkTagSheet } from '@/components/BulkTagSheet';
import { Card, type CardData } from '@/components/Card';
import { ScreenshotDetail } from '@/components/ScreenshotDetail';
import { Sidebar } from '@/components/Sidebar';
import { SignIn } from '@/components/SignIn';
import { useToast } from '@/components/Toast';
import { applyFilters, filtersActive } from '@/lib/filters';
import { useFilters } from '@/lib/filtersContext';
import { analyzeAndPersist, isAnalyzeConfigured } from '@/lib/analyze';
import { signOut, useSession } from '@/lib/auth';
import { colors, statusColors, urgencyColors } from '@/lib/colors';
import { markHintSeen, wasHintSeen } from '@/lib/hints';
import { deleteScreenshots, fetchScreenshots } from '@/lib/screenshots';
import { isSupabaseConfigured } from '@/lib/supabase';
import { uploadScreenshot, type LocalScreenshot } from '@/lib/uploads';

type ColCount = 1 | 2 | 3 | 4;
const COLS_KEY = 'overlook.grid_cols';
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
  const toast = useToast();
  const [items, setItems] = useState<LocalScreenshot[]>([]);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { filters, setFilters, clearFilters } = useFilters();
  const [analyzingIds, setAnalyzingIds] = useState<Set<string>>(new Set());
  const [multiSelectIds, setMultiSelectIds] = useState<Set<string>>(new Set());
  const [cols, setCols] = useState<ColCount>(3);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const inSelectMode = multiSelectIds.size > 0;
  const isIntentMode = cols === 1;

  // Load persisted column count
  useEffect(() => {
    AsyncStorage.getItem(COLS_KEY).then((v) => {
      const n = v ? parseInt(v, 10) : 3;
      if (n === 1 || n === 2 || n === 3 || n === 4) setCols(n);
    });
  }, []);

  // Persist on change
  useEffect(() => {
    AsyncStorage.setItem(COLS_KEY, String(cols)).catch(() => {});
  }, [cols]);

  // Android hardware back: nav-style. Sidebar > multi-select > filters >
  // default (exit app).
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (sidebarOpen) {
        setSidebarOpen(false);
        return true;
      }
      if (inSelectMode) {
        exitMultiSelect();
        return true;
      }
      if (filtersActive(filters) > 0) {
        clearFilters();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [sidebarOpen, inSelectMode, filters, clearFilters]);

  // First-card hint: when items first appear, drop a one-time toast pointing
  // at the gestures users wouldn't discover otherwise.
  const prevItemsCount = useRef(items.length);
  useEffect(() => {
    if (prevItemsCount.current === 0 && items.length > 0) {
      void (async () => {
        if (!(await wasHintSeen('first-card-gestures'))) {
          toast.show('tap a card to view • pinch to zoom • long-press to select');
          await markHintSeen('first-card-gestures');
        }
      })();
    }
    prevItemsCount.current = items.length;
  }, [items.length, toast]);

  // Pinch gesture: pinch out (scale > 1.3) -> zoom in (fewer cols).
  // Pinch in (scale < 0.7) -> zoom out (more cols).
  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .runOnJS(true)
        .onEnd((e) => {
          if (e.scale > 1.3) {
            setCols((prev) => (prev > 1 ? ((prev - 1) as ColCount) : 1));
          } else if (e.scale < 0.7) {
            setCols((prev) => (prev < 4 ? ((prev + 1) as ColCount) : 4));
          }
        }),
    [],
  );

  // Show a hint once when user enters intent mode (1 col) for the first time.
  useEffect(() => {
    if (cols !== 1) return;
    void (async () => {
      if (!(await wasHintSeen('intent-mode'))) {
        toast.show('intent mode — pinch in to return to grid');
        await markHintSeen('intent-mode');
      }
    })();
  }, [cols, toast]);

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
  const bulkSheetRef = useRef<BottomSheetModal>(null);
  // 3 snap points lets user drag from 60% (compact) -> 85% -> 100% (full detail per spec).
  const snapPoints = useMemo(() => ['60%', '85%', '100%'], []);
  const bulkSnapPoints = useMemo(() => ['85%'], []);
  const [sheetIndex, setSheetIndex] = useState(0);

  useEffect(() => {
    if (!session) return;
    fetchScreenshots().then((rows) => setItems(rows));
  }, [session]);

  // Two-step upload per spec privacy model: pick first, then user explicitly
  // chooses to analyze with AI or add without AI. "Nothing auto-sends ever."
  const runUpload = async (assets: ImagePicker.ImagePickerAsset[], analyze: boolean) => {
    const uploads = await Promise.all(assets.map((a) => uploadScreenshot(a.uri)));

    // Show cards immediately
    setItems((prev) => [...uploads, ...prev]);

    if (!analyze || !isAnalyzeConfigured) return;

    // Mark as analyzing
    setAnalyzingIds((prev) => {
      const next = new Set(prev);
      for (const u of uploads) next.add(u.id);
      return next;
    });

    let failures = 0;
    for (const u of uploads) {
      void (async () => {
        const patch = await analyzeAndPersist(u.uri, u.id);
        setAnalyzingIds((prev) => {
          const next = new Set(prev);
          next.delete(u.id);
          return next;
        });
        if (!patch) {
          failures++;
          if (failures === 1) toast.error('AI tagging failed for some images — retry from card detail');
          return;
        }
        setItems((prev) => prev.map((it) => (it.id === u.id ? { ...it, ...patch } : it)));
      })();
    }
  };

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
        selectionLimit: 10,
        quality: 0.9,
      });
      if (result.canceled || result.assets.length === 0) return;

      const count = result.assets.length;
      const assets = result.assets;

      // Per spec privacy model: "Nothing auto-sends ever. Post-screenshot popup
      // requires explicit tap to analyze." Confirm before AI analysis.
      if (isAnalyzeConfigured) {
        Alert.alert(
          `Add ${count} screenshot${count === 1 ? '' : 's'}?`,
          'Choose how to add them. AI tagging sends each image to Claude for analysis (~$0.003/image). "Add without AI" keeps them local-only — you can tag manually or analyze later from the card detail view.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Add without AI', onPress: () => void runUpload(assets, false) },
            {
              text: 'Analyze with AI',
              style: 'default',
              onPress: () => void runUpload(assets, true),
            },
          ],
        );
      } else {
        // No AI configured — just add them
        await runUpload(assets, false);
      }
    } finally {
      setBusy(false);
    }
  };

  const openDetail = (it: LocalScreenshot) => {
    setSelectedId(it.id);
    sheetRef.current?.present();
  };

  const toggleMultiSelect = (id: string) => {
    setMultiSelectIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exitMultiSelect = () => setMultiSelectIds(new Set());

  const onCardPress = (it: LocalScreenshot) => {
    if (inSelectMode) toggleMultiSelect(it.id);
    else openDetail(it);
  };

  const onCardLongPress = (it: LocalScreenshot) => {
    // Long-press always selects (or de-selects if already in)
    setMultiSelectIds((prev) => {
      const next = new Set(prev);
      if (next.has(it.id)) next.delete(it.id);
      else next.add(it.id);
      return next;
    });
  };

  const onBulkTag = () => {
    if (multiSelectIds.size === 0) return;
    bulkSheetRef.current?.present();
  };

  const onBulkApplied = (
    patch: Partial<LocalScreenshot>,
    appendedTag: { type?: string; value: string } | null,
  ) => {
    setItems((prev) =>
      prev.map((it) =>
        multiSelectIds.has(it.id)
          ? {
              ...it,
              ...patch,
              // appendedTag changes manual_typed_tags but we don't store those in
              // LocalScreenshot — server stays source of truth, list-view ignores.
            }
          : it,
      ),
    );
    if (appendedTag) {
      // intentionally a no-op locally — appended tag isn't in card visual.
    }
    exitMultiSelect();
  };

  const onBulkDelete = () => {
    const count = multiSelectIds.size;
    if (count === 0) return;
    Alert.alert(
      `Delete ${count} screenshot${count === 1 ? '' : 's'}?`,
      'This removes them from your library.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const targets = items
              .filter((it) => multiSelectIds.has(it.id))
              .map((it) => ({ id: it.id, storagePath: it.storagePath }));
            await deleteScreenshots(targets);
            setItems((prev) => prev.filter((it) => !multiSelectIds.has(it.id)));
            exitMultiSelect();
          },
        },
      ],
    );
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
      {/* Persistent edge hint bar (per spec) — tap to open sidebar */}
      {!inSelectMode && session && (
        <Pressable
          onPress={() => setSidebarOpen(true)}
          accessibilityLabel="Open filters and nav"
          style={styles.edgeBar}
          hitSlop={{ left: 0, right: 8, top: 0, bottom: 0 }}
        />
      )}

      {inSelectMode && (
        <View style={styles.bulkBar}>
          <Pressable onPress={exitMultiSelect} hitSlop={12} style={styles.bulkIconBtn}>
            <Ionicons name="close" size={22} color={colors.parchment} />
          </Pressable>
          <Text style={styles.bulkCount}>
            {multiSelectIds.size} selected
          </Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Pressable onPress={onBulkTag} hitSlop={12} style={styles.bulkIconBtn}>
              <Ionicons name="pricetag-outline" size={20} color={colors.parchment} />
            </Pressable>
            <Pressable onPress={onBulkDelete} hitSlop={12} style={styles.bulkIconBtn}>
              <Ionicons name="trash-outline" size={20} color={colors.parchment} />
            </Pressable>
          </View>
        </View>
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
        <GestureDetector gesture={pinchGesture}>
          <FlatList
            // key on cols forces FlatList to remount when numColumns changes.
            key={`grid-${cols}`}
            data={visibleItems}
            keyExtractor={(it) => it.id}
            numColumns={cols}
            contentContainerStyle={{ paddingBottom: 96 }}
            columnWrapperStyle={cols > 1 ? { gap: GRID_GAP } : undefined}
            ItemSeparatorComponent={() => <View style={{ height: GRID_GAP }} />}
            ListHeaderComponent={
              <ActiveFilters
                filters={filters}
                onChange={setFilters}
                totalCount={items.length}
                filteredCount={visibleItems.length}
                onOpenSidebar={() => setSidebarOpen(true)}
              />
            }
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptySub}>no screenshots match these filters</Text>
              </View>
            }
            renderItem={({ item }) => (
              <View style={isIntentMode ? styles.cellIntent : { flex: 1 / cols, aspectRatio: 1 }}>
                <Card
                  data={toCardData(item)}
                  analyzing={analyzingIds.has(item.id)}
                  inSelectMode={inSelectMode}
                  selected={multiSelectIds.has(item.id)}
                  mode={isIntentMode ? 'intent' : 'grid'}
                  onPress={() => onCardPress(item)}
                  onLongPress={() => onCardLongPress(item)}
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
        </GestureDetector>
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
        onChange={(idx) => setSheetIndex(idx < 0 ? 0 : idx)}
      >
        {selected && (
          <ScreenshotDetail
            item={selected}
            onChange={onItemChange}
            onDelete={onItemDelete}
            snapIndex={sheetIndex}
          />
        )}
      </BottomSheetModal>

      <BottomSheetModal
        ref={bulkSheetRef}
        snapPoints={bulkSnapPoints}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: colors.parchment }}
        handleIndicatorStyle={{ backgroundColor: colors.inkMuted }}
      >
        <BulkTagSheet
          selectedIds={Array.from(multiSelectIds)}
          onApplied={onBulkApplied}
          onClose={() => bulkSheetRef.current?.dismiss()}
        />
      </BottomSheetModal>

      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        filters={filters}
        onFiltersChange={setFilters}
        userEmail={session?.user.email ?? null}
        onUpload={() => {
          setSidebarOpen(false);
          // Navigate to bulk upload screen instead of opening the small picker.
          // The small picker is also still available via the FAB on the grid.
          router.push('/upload');
        }}
        onLibrary={() => {
          setSidebarOpen(false);
          clearFilters();
        }}
        onSavedFilters={() => {
          setSidebarOpen(false);
          router.push('/saved-filters');
        }}
        onSignOut={() => {
          setSidebarOpen(false);
          onSignOut();
        }}
      />
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
  cellIntent: { width: '100%', aspectRatio: 9 / 16 },
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
  edgeBar: {
    position: 'absolute',
    left: 0,
    top: '40%',
    width: 4,
    height: 60,
    backgroundColor: colors.inkMuted,
    opacity: 0.55,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
    zIndex: 5,
  },
  bulkBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: 50,
    paddingBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: colors.ink,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 20,
  },
  bulkCount: {
    color: colors.parchment,
    fontSize: 13,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  bulkIconBtn: { padding: 4 },
});
