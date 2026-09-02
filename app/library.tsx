import { Ionicons } from '@expo/vector-icons';
import { BottomSheetBackdrop, BottomSheetModal, type BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useFocusEffect, usePathname } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, BackHandler, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { ActiveFilters } from '@/components/ActiveFilters';
import { BulkTagSheet } from '@/components/BulkTagSheet';
import { DetailSheetHost, type DetailSheetHostHandle } from '@/components/DetailSheetHost';
import { GhostHint } from '@/components/GhostHint';
import { Card, type CardData } from '@/components/Card';
import { Iris } from '@/components/Iris';
import { EdgeSwipe } from '@/components/EdgeSwipe';
import { Sidebar } from '@/components/Sidebar';
import { SignIn } from '@/components/SignIn';
import { useDemoMode } from '@/lib/demoMode';
import { applyFilters, sortByUrgency } from '@/lib/filters';
import { useFilters } from '@/lib/filtersContext';
import { buildSearchIndex, runSearch } from '@/lib/search';
import { signOut, useSession } from '@/lib/auth';
import { statusColors, urgencyColors, type FontSet, type Palette } from '@/lib/colors';
import { useColors, useFonts } from '@/lib/themeContext';
import { pickGalleryImages } from '@/lib/galleryPicker';
import { useScreenshotWatcher } from '@/lib/screenshotWatcher';
import { fetchScreenshots } from '@/lib/screenshots';
import { animDuration, useReduceMotion } from '@/lib/a11y';
import { getQueuedIds } from '@/lib/analysisQueue';
import { heavyHaptic } from '@/lib/haptics';
import { effectiveUrgencyKey } from '@/lib/urgency';
import { useUndoableDelete } from '@/lib/useUndoableDelete';
import { useLibraryHints } from '@/lib/useLibraryHints';
import { useLibraryUpload } from '@/lib/useLibraryUpload';
import { useMultiSelect } from '@/lib/useMultiSelect';
import { isSupabaseConfigured } from '@/lib/supabase';
import type { LocalScreenshot } from '@/lib/uploads';

type ColCount = 1 | 2 | 3 | 4;
const COLS_KEY = 'overlook.grid_cols';
const GRID_GAP = 3;

const toCardData = (it: LocalScreenshot): CardData => ({
  id: it.id,
  uri: it.uri,
  category: it.category ?? null,
  status: (it.status as keyof typeof statusColors) ?? null,
  urgency: (effectiveUrgencyKey(it) as keyof typeof urgencyColors) ?? null,
  resonance: it.resonance ?? null,
});

const intentTagPills = (it: LocalScreenshot): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (v: string) => {
    const key = v.trim().toLowerCase();
    if (!key || key.length < 2 || seen.has(key)) return;
    seen.add(key);
    out.push(v);
  };
  for (const t of it.manualTags ?? []) push(t.value);
  for (const t of it.aiTags ?? []) push(t.value);
  return out.slice(0, 3);
};

const BulkBar = ({
  visible, count, onCancel, onTag, onDelete,
}: {
  visible: boolean; count: number;
  onCancel: () => void; onTag: () => void; onDelete: () => void;
}) => {
  const reduceMotion = useReduceMotion();
  const translateY = useRef(new Animated.Value(-110)).current;
  const c = useColors();
  const f = useFonts();
  const styles = useMemo(() => makeStyles(c, f), [c, f]);

  useEffect(() => {
    Animated.timing(translateY, {
      toValue: visible ? 0 : -110,
      duration: animDuration(220, reduceMotion),
      useNativeDriver: true,
    }).start();
  }, [visible, translateY, reduceMotion]);

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[styles.bulkBar, { transform: [{ translateY }] }]}
    >
      <Pressable onPress={onCancel} hitSlop={12} style={styles.bulkIconBtn} accessibilityLabel="Cancel selection">
        <Ionicons name="close" size={22} color={c.parchment} />
      </Pressable>
      <Text style={styles.bulkCount}>{count} selected</Text>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <Pressable onPress={onTag} hitSlop={12} style={styles.bulkIconBtn} accessibilityLabel="Bulk tag">
          <Ionicons name="pricetag-outline" size={20} color={c.parchment} />
        </Pressable>
        <Pressable onPress={onDelete} hitSlop={12} style={styles.bulkIconBtn} accessibilityLabel="Bulk delete">
          <Ionicons name="trash-outline" size={20} color={c.parchment} />
        </Pressable>
      </View>
    </Animated.View>
  );
};

export default function LibraryScreen() {
  const { session, loading } = useSession();
  const [items, setItems] = useState<LocalScreenshot[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [queuedIds, setQueuedIds] = useState<Set<string>>(new Set());
  const [cols, setCols] = useState<ColCount>(3);
  const [urgencySort, setUrgencySort] = useState<'asc' | 'desc'>('asc');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [demoOn, setDemoOn] = useDemoMode();
  const sheetHostRef = useRef<DetailSheetHostHandle>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const bulkSheetRef = useRef<BottomSheetModal>(null);
  const { filters, setFilters, clearFilters, searchQuery } = useFilters();
  const { enqueue: enqueueAssets } = useScreenshotWatcher();
  const insets = useSafeAreaInsets();
  const c = useColors();
  const f = useFonts();
  const styles = useMemo(() => makeStyles(c, f), [c, f]);

  const isIntentMode = cols === 1;

  const { remove: undoableRemove, removeMany: undoableRemoveMany } = useUndoableDelete(setItems);

  const {
    multiSelectIds, inSelectMode, toggleMultiSelect, exitMultiSelect, onBulkApplied, onBulkDelete,
  } = useMultiSelect(items, setItems, undoableRemoveMany);

  const { busy, analyzingIds, onPick } = useLibraryUpload(session, setItems, setQueuedIds, setDemoOn);

  const filtered = useMemo(() => applyFilters(items, filters), [items, filters]);
  const searchIndex = useMemo(() => buildSearchIndex(filtered), [filtered]);
  const visibleItems = useMemo(() => {
    const searched = searchQuery.trim() ? runSearch(searchIndex, searchQuery) : filtered;
    return filters.urgencies.size > 0 ? sortByUrgency(searched, urgencySort) : searched;
  }, [filtered, searchIndex, searchQuery, urgencySort, filters.urgencies.size]);

  const {
    showLibraryPinchHint, setShowLibraryPinchHint,
    showSelectHint, setShowSelectHint,
    showIntentHint, setShowIntentHint,
  } = useLibraryHints(items.length, cols);

  useEffect(() => {
    AsyncStorage.getItem(COLS_KEY).then((v) => {
      const n = v ? parseInt(v, 10) : 3;
      if (n === 1 || n === 2 || n === 3 || n === 4) setCols(n);
    });
  }, []);

  useEffect(() => {
    AsyncStorage.setItem(COLS_KEY, String(cols)).catch(() => {});
  }, [cols]);

  const pathname = usePathname();
  useEffect(() => {
    if (pathname === '/library') setSidebarOpen(false);
  }, [pathname]);

  useFocusEffect(useCallback(() => { setSidebarOpen(false); }, []));

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (sheetOpen) { sheetHostRef.current?.dismiss(); return true; }
      if (sidebarOpen) { setSidebarOpen(false); return true; }
      if (inSelectMode) { exitMultiSelect(); return true; }
      return false;
    });
    return () => sub.remove();
  }, [sheetOpen, sidebarOpen, inSelectMode]);

  useEffect(() => {
    if (!session) return;
    fetchScreenshots().then((rows) => setItems(rows));
    void getQueuedIds().then(setQueuedIds);
  }, [session, demoOn]);

  const onRefresh = useCallback(async () => {
    if (!session) return;
    setRefreshing(true);
    try { setItems(await fetchScreenshots()); }
    finally { setRefreshing(false); }
  }, [session]);

  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .runOnJS(true)
        .onEnd((e) => {
          if (e.scale > 1.3) setCols((prev) => (prev > 1 ? ((prev - 1) as ColCount) : 1));
          else if (e.scale < 0.7) setCols((prev) => (prev < 4 ? ((prev + 1) as ColCount) : 4));
        }),
    [],
  );

  const openDetail = (it: LocalScreenshot) => sheetHostRef.current?.present(it.id);
  const onCardPress = (it: LocalScreenshot) => { if (inSelectMode) toggleMultiSelect(it.id); else openDetail(it); };
  const onCardLongPress = (it: LocalScreenshot) => { void heavyHaptic(); toggleMultiSelect(it.id); };
  const onBulkTag = () => { if (multiSelectIds.size > 0) bulkSheetRef.current?.present(); };

  const onItemChange = useCallback(
    (id: string, patch: Partial<LocalScreenshot>) => {
      setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
    },
    [],
  );

  const onItemDelete = useCallback(
    (id: string) => {
      const item = items.find((it) => it.id === id);
      if (item) undoableRemove(item);
    },
    [items, undoableRemove],
  );

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.4} />
    ),
    [],
  );

  const onSignOut = () => {
    Alert.alert('Sign out?', `You'll be signed out of ${session?.user.email ?? 'your account'}.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: async () => { await signOut(); setItems([]); } },
    ]);
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <Iris level={3} size={36} color={c.ink} spinning />
      </View>
    );
  }

  if (isSupabaseConfigured && !session) return <SignIn />;

  return (
    <View style={styles.container}>
      <BulkBar
        visible={inSelectMode}
        count={multiSelectIds.size}
        onCancel={exitMultiSelect}
        onTag={onBulkTag}
        onDelete={onBulkDelete}
      />
      {items.length === 0 ? (
        <View style={styles.empty}>
          <View style={{ marginBottom: 24, opacity: 0.92 }}>
            <Iris level={3} size={56} color={c.ink} />
          </View>
          <Text style={styles.emptyTitle}>Overlook</Text>
          <Text style={styles.emptySub}>your screenshot library</Text>
          <Pressable
            accessibilityLabel="Upload screenshots"
            onPress={onPick}
            disabled={busy}
            style={({ pressed }) => [styles.bigBtn, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.bigBtnText}>{busy ? 'uploading…' : 'upload screenshots'}</Text>
          </Pressable>
          <Pressable onPress={() => void setDemoOn(true)} hitSlop={8} style={({ pressed }) => [{ marginTop: 24 }, pressed && { opacity: 0.75 }]}>
            <Text style={styles.demoLink}>or load demo data</Text>
          </Pressable>
        </View>
      ) : (
        <GestureDetector gesture={pinchGesture}>
          <FlatList
            key={`grid-${cols}`}
            data={visibleItems}
            keyExtractor={(it) => it.id}
            numColumns={cols}
            contentContainerStyle={{ paddingBottom: 96 + insets.bottom }}
            columnWrapperStyle={cols > 1 ? { gap: GRID_GAP } : undefined}
            ItemSeparatorComponent={() => <View style={{ height: GRID_GAP }} />}
            ListHeaderComponent={
              <ActiveFilters
                filters={filters}
                onChange={setFilters}
                totalCount={items.length}
                filteredCount={visibleItems.length}
                onOpenSidebar={() => setSidebarOpen(true)}
                urgencySort={urgencySort}
                onToggleUrgencySort={() => setUrgencySort((d) => d === 'asc' ? 'desc' : 'asc')}
              />
            }
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptySub}>No screenshots match these filters.</Text>
              </View>
            }
            renderItem={({ item }) => (
              <View style={isIntentMode ? styles.cellIntent : { flex: 1 / cols, aspectRatio: 4 / 5 }}>
                <Card
                  data={toCardData(item)}
                  analyzing={analyzingIds.has(item.id)}
                  queued={queuedIds.has(item.id)}
                  inSelectMode={inSelectMode}
                  selected={multiSelectIds.has(item.id)}
                  mode={isIntentMode ? 'intent' : 'grid'}
                  tagPills={isIntentMode ? intentTagPills(item) : undefined}
                  onPress={() => onCardPress(item)}
                  onLongPress={() => onCardLongPress(item)}
                />
              </View>
            )}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.ink} colors={[c.ink]} />
            }
          />
        </GestureDetector>
      )}

      {!inSelectMode && session && <EdgeSwipe onOpen={() => setSidebarOpen(true)} />}

      <DetailSheetHost
        ref={sheetHostRef}
        items={visibleItems}
        onItemChange={onItemChange}
        onItemDelete={onItemDelete}
        hideImage={cols === 1}
        onOpenChange={setSheetOpen}
      />

      <BottomSheetModal
        ref={bulkSheetRef}
        snapPoints={useMemo(() => ['85%'], [])}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: c.parchment }}
        handleIndicatorStyle={{ backgroundColor: c.inkMuted }}
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
        onPickFromGallery={async () => {
          setSidebarOpen(false);
          const assets = await pickGalleryImages({ allowsMultipleSelection: true });
          if (assets.length > 0) enqueueAssets(assets);
        }}
        onUpload={() => { setSidebarOpen(false); router.push('/upload'); }}
        onLibrary={() => { setSidebarOpen(false); clearFilters(); }}
        onApplyFilters={() => { setSidebarOpen(false); }}
        onLogo={() => { setSidebarOpen(false); clearFilters(); router.push('/'); }}
        onSavedFilters={() => { setSidebarOpen(false); router.push('/saved-filters'); }}
        onTriage={() => { setSidebarOpen(false); router.push('/triage'); }}
        onSettings={() => { setSidebarOpen(false); router.push('/settings'); }}
        onSignOut={() => { setSidebarOpen(false); onSignOut(); }}
      />

      <GhostHint
        visible={showSelectHint}
        variant="tap"
        label="Long press to select multiple"
        onDismiss={() => setShowSelectHint(false)}
        topOffset="65%"
      />
      <GhostHint
        visible={showLibraryPinchHint}
        variant="pinch-in"
        label="Pinch to change zoom"
        onDismiss={() => setShowLibraryPinchHint(false)}
      />
      <GhostHint
        visible={showIntentHint}
        variant="pinch-in"
        label="Pinch in to return to grid"
        onDismiss={() => setShowIntentHint(false)}
      />
    </View>
  );
}

const makeStyles = (c: Palette, f: FontSet) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.parchment },
    center: { alignItems: 'center', justifyContent: 'center' },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    emptyTitle: { fontFamily: f.displayMedium, fontSize: 44, color: c.ink, letterSpacing: -0.5 },
    emptySub: {
      fontSize: 11, letterSpacing: 2, textTransform: 'uppercase',
      color: c.inkMuted, marginTop: 6, marginBottom: 32,
    },
    bigBtn: { backgroundColor: c.ink, paddingHorizontal: 28, paddingVertical: 16, borderRadius: 4 },
    bigBtnText: {
      color: c.parchment, fontSize: 16, letterSpacing: 1.4,
      textTransform: 'uppercase', fontWeight: '600',
    },
    cellIntent: { width: '100%', aspectRatio: 9 / 16 },
    demoLink: {
      fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase',
      color: c.inkMuted, textDecorationLine: 'underline', textDecorationStyle: 'dashed',
    },
    bulkBar: {
      position: 'absolute', top: 0, left: 0, right: 0,
      paddingTop: 56, paddingBottom: 14, paddingHorizontal: 20,
      backgroundColor: c.ink, flexDirection: 'row', alignItems: 'center',
      justifyContent: 'space-between', zIndex: 20,
    },
    bulkCount: {
      color: c.parchment, fontSize: 13, letterSpacing: 1.5,
      textTransform: 'uppercase', fontWeight: '600',
    },
    bulkIconBtn: { padding: 4 },
  });
