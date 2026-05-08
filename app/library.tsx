import { Ionicons } from '@expo/vector-icons';
import { BottomSheetBackdrop, BottomSheetModal, type BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { router, useFocusEffect, usePathname } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, BackHandler, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { ActiveFilters } from '@/components/ActiveFilters';
import { BulkTagSheet } from '@/components/BulkTagSheet';
import { GhostHint } from '@/components/GhostHint';
import { Card, type CardData } from '@/components/Card';
import { Iris } from '@/components/Iris';
import { EdgeSwipe } from '@/components/EdgeSwipe';
import { ScreenshotDetail } from '@/components/ScreenshotDetail';
import { Sidebar } from '@/components/Sidebar';
import { SignIn } from '@/components/SignIn';
import { useToast } from '@/components/Toast';
import { useDemoMode } from '@/lib/demoMode';
import { applyFilters, filtersActive } from '@/lib/filters';
import { useFilters } from '@/lib/filtersContext';
import { searchItems } from '@/lib/search';
import { analyzeAndPersist, isAnalyzeConfigured } from '@/lib/analyze';
import { signOut, useSession } from '@/lib/auth';
import { statusColors, urgencyColors, type FontSet, type Palette } from '@/lib/colors';
import { useColors, useFonts } from '@/lib/themeContext';
import { markHintSeen, wasHintSeen } from '@/lib/hints';
import { pickAndImportImages } from '@/lib/galleryPicker';
import { fetchScreenshots } from '@/lib/screenshots';
import { animDuration, useReduceMotion } from '@/lib/a11y';
import { enqueueAnalysis, getQueuedIds } from '@/lib/analysisQueue';
import { heavyHaptic, warnHaptic } from '@/lib/haptics';
import { useUndoableDelete } from '@/lib/useUndoableDelete';
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

/**
 * Compute the top 3 tag values to overlay in intent-mode cards. Prefers manual
 * tags (heavier signal), then AI tags. Skips untyped values that are very
 * generic (single chars). De-duplicates by lowercase value.
 */
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

/** Multi-select top bar: slides down from above when active, slides up when not. */
const BulkBar = ({
  visible,
  count,
  onCancel,
  onTag,
  onDelete,
}: {
  visible: boolean;
  count: number;
  onCancel: () => void;
  onTag: () => void;
  onDelete: () => void;
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
  const toast = useToast();
  const [items, setItems] = useState<LocalScreenshot[]>([]);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { filters, setFilters, clearFilters, searchQuery } = useFilters();
  const [analyzingIds, setAnalyzingIds] = useState<Set<string>>(new Set());
  const [queuedIds, setQueuedIds] = useState<Set<string>>(new Set());
  const [multiSelectIds, setMultiSelectIds] = useState<Set<string>>(new Set());
  const [cols, setCols] = useState<ColCount>(3);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [demoOn, setDemoOn] = useDemoMode();
  const insets = useSafeAreaInsets();
  const inSelectMode = multiSelectIds.size > 0;
  const isIntentMode = cols === 1;
  const c = useColors();
  const f = useFonts();
  const styles = useMemo(() => makeStyles(c, f), [c, f]);

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

  // Close any sticky overlays whenever this screen gains focus (e.g. coming
  // back from /upload, /triage, etc) — defensive layered: useFocusEffect +
  // pathname watcher to catch all navigation patterns.
  const pathname = usePathname();
  useEffect(() => {
    if (pathname === '/library') setSidebarOpen(false);
  }, [pathname]);
  useFocusEffect(
    useCallback(() => {
      setSidebarOpen(false);
    }, []),
  );

  // Android hardware back: nav-style. Sheet > sidebar > multi-select >
  // filters > default (let the navigator pop or exit app).
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (selectedId) {
        sheetRef.current?.dismiss();
        return true;
      }
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
  }, [selectedId, sidebarOpen, inSelectMode, filters, clearFilters]);

  // First-card hint: when items first appear, show a ghost-hand pinch-in
  // overlay so users discover the gesture-based zoom.
  const [showLibraryPinchHint, setShowLibraryPinchHint] = useState(false);
  const prevItemsCount = useRef(items.length);
  useEffect(() => {
    if (prevItemsCount.current === 0 && items.length > 0) {
      void (async () => {
        if (!(await wasHintSeen('library-pinch-zoom'))) {
          setShowLibraryPinchHint(true);
          await markHintSeen('library-pinch-zoom');
        }
      })();
    }
    prevItemsCount.current = items.length;
  }, [items.length]);

  // Intent-mode hint: ghost dot converging when first entering 1-col view.
  const [showIntentHint, setShowIntentHint] = useState(false);

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
        setShowIntentHint(true);
        await markHintSeen('intent-mode');
      }
    })();
  }, [cols]);

  const visibleItems = useMemo(() => {
    const filtered = applyFilters(items, filters);
    return searchQuery.trim() ? searchItems(filtered, searchQuery) : filtered;
  }, [items, filters, searchQuery]);
  const { remove: undoableRemove, removeMany: undoableRemoveMany } = useUndoableDelete(setItems);

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
    void getQueuedIds().then(setQueuedIds);
  }, [session, demoOn]);

  // Two-step upload per spec privacy model: pick first, then user explicitly
  // chooses to analyze with AI or add without AI. "Nothing auto-sends ever."
  const runUpload = async (assets: ImagePicker.ImagePickerAsset[], analyze: boolean) => {
    // Device-only architecture: we need an assetId for each picked image to
    // resolve its URI on subsequent loads. Skip + warn for any picker assets
    // missing an assetId (camera-captured items don't expose one).
    const skipped = assets.filter((a) => !a.assetId).length;
    const usable = assets.filter((a) => a.assetId);
    if (skipped > 0) {
      toast.error(
        `${skipped} image${skipped === 1 ? '' : 's'} skipped (camera-only — must come from your Photos library to import)`,
      );
    }
    if (usable.length === 0) return;

    // Real upload starting — clear demo mode so fetched rows aren't masked.
    void setDemoOn(false);

    const uploads = await Promise.all(
      usable.map((a) =>
        uploadScreenshot(a.uri, {
          deviceAssetId: a.assetId ?? undefined,
        }),
      ),
    );

    // Show cards immediately
    setItems((prev) => [...uploads, ...prev]);

    if (!analyze || !isAnalyzeConfigured) return;

    setAnalyzingIds((prev) => {
      const next = new Set(prev);
      for (const u of uploads) next.add(u.id);
      return next;
    });

    // Run analyses concurrently, then update state once with the aggregated
    // result so we don't race the failures counter or leak fire-and-forget
    // promises.
    const results = await Promise.allSettled(
      uploads.map(async (u) => ({
        id: u.id,
        patch: await analyzeAndPersist(u.uri, u.id, u.deviceAssetId ?? undefined),
      })),
    );

    let failures = 0;
    const successPatches: { id: string; patch: NonNullable<Awaited<ReturnType<typeof analyzeAndPersist>>> }[] = [];
    const failedIds: { id: string; uri: string }[] = [];
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const upload = uploads[i];
      if (r.status === 'fulfilled' && r.value.patch) {
        successPatches.push({ id: r.value.id, patch: r.value.patch });
      } else {
        failures++;
        failedIds.push({ id: upload.id, uri: upload.uri });
      }
    }
    // Enqueue failed analyses for offline retry on next app foreground.
    for (const f of failedIds) {
      const u = uploads.find((x) => x.id === f.id);
      await enqueueAnalysis(f.id, f.uri, u?.deviceAssetId ?? undefined);
    }

    setAnalyzingIds((prev) => {
      const next = new Set(prev);
      for (const u of uploads) next.delete(u.id);
      return next;
    });
    if (successPatches.length > 0) {
      setItems((prev) =>
        prev.map((it) => {
          const found = successPatches.find((s) => s.id === it.id);
          return found ? { ...it, ...found.patch } : it;
        }),
      );
    }
    if (failures > 0) {
      toast.show(
        `${failures} of ${uploads.length} couldn't be AI-tagged — queued for retry when online`,
        { kind: 'error' },
      );
    }
    // Refresh queued snapshot in case items were enqueued for retry.
    void getQueuedIds().then(setQueuedIds);
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
    void heavyHaptic();
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
    const targets = items.filter((it) => multiSelectIds.has(it.id));
    if (targets.length === 0) return;
    void warnHaptic();
    undoableRemoveMany(targets);
    exitMultiSelect();
  };

  // Memoized so the ScreenshotDetail's "auto-mark ai_reviewed on open"
  // effect doesn't re-fire on every parent render.
  const onItemChange = useCallback(
    (patch: Partial<LocalScreenshot>) => {
      if (!selectedId) return;
      setItems((prev) => prev.map((it) => (it.id === selectedId ? { ...it, ...patch } : it)));
    },
    [selectedId],
  );

  const onItemDelete = () => {
    if (!selectedId) return;
    const item = items.find((it) => it.id === selectedId);
    sheetRef.current?.dismiss();
    if (item) undoableRemove(item);
  };

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.4} />
    ),
    [],
  );

  const selected = items.find((it) => it.id === selectedId) ?? null;
  // Walk through whatever the user is currently looking at — `visibleItems`
  // is filters + search applied, so swiping respects the filter context.
  const selIdx = selected ? visibleItems.findIndex((it) => it.id === selected.id) : -1;
  const goPrev = useCallback(() => {
    if (selIdx <= 0) return;
    setSelectedId(visibleItems[selIdx - 1].id);
  }, [visibleItems, selIdx]);
  const goNext = useCallback(() => {
    if (selIdx < 0 || selIdx >= visibleItems.length - 1) return;
    setSelectedId(visibleItems[selIdx + 1].id);
  }, [visibleItems, selIdx]);

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
        <Iris level={3} size={36} color={c.ink} spinning />
      </View>
    );
  }

  if (isSupabaseConfigured && !session) {
    return <SignIn />;
  }

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
          <Pressable onPress={() => void setDemoOn(true)} hitSlop={8} style={{ marginTop: 24 }}>
            <Text style={styles.demoLink}>or load demo data</Text>
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
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={c.ink}
                colors={[c.ink]}
              />
            }
          />
        </GestureDetector>
      )}

      {/* Edge swipe — rendered after the grid so it stacks on top reliably. */}
      {!inSelectMode && session && <EdgeSwipe onOpen={() => setSidebarOpen(true)} />}

      <BottomSheetModal
        ref={sheetRef}
        snapPoints={snapPoints}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: c.parchment }}
        handleIndicatorStyle={{ backgroundColor: c.inkMuted }}
        onDismiss={() => setSelectedId(null)}
        onChange={(idx) => setSheetIndex(idx < 0 ? 0 : idx)}
        keyboardBehavior="interactive"
        keyboardBlurBehavior="restore"
        android_keyboardInputMode="adjustResize"
      >
        {selected && (
          <ScreenshotDetail
            item={selected}
            onChange={onItemChange}
            onDelete={onItemDelete}
            snapIndex={sheetIndex}
            onPrev={selIdx > 0 ? goPrev : undefined}
            onNext={selIdx >= 0 && selIdx < visibleItems.length - 1 ? goNext : undefined}
            hideImage={cols === 1}
          />
        )}
      </BottomSheetModal>

      <BottomSheetModal
        ref={bulkSheetRef}
        snapPoints={bulkSnapPoints}
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
          toast.show('Opening gallery…');
          const { added, skipped, errored } = await pickAndImportImages({ allowsMultipleSelection: true });
          if (added.length === 0 && skipped === 0 && errored === 0) return;
          if (added.length > 0) {
            toast.show(
              `Added ${added.length} ${added.length === 1 ? 'image' : 'images'}` +
                (skipped > 0 ? ` · skipped ${skipped} duplicate${skipped === 1 ? '' : 's'}` : ''),
            );
            void onRefresh();
          } else if (skipped > 0) {
            toast.show(`All ${skipped} already imported`);
          } else if (errored > 0) {
            toast.error(`Failed to import ${errored} ${errored === 1 ? 'image' : 'images'}`);
          }
        }}
        onUpload={() => {
          setSidebarOpen(false);
          // Navigate to bulk upload screen instead of opening the small picker.
          // The small picker is also still available via the FAB on the grid.
          router.push('/upload');
        }}
        onLibrary={() => {
          setSidebarOpen(false);
          clearFilters();
          // Already on /library; clearing filters reveals the unfiltered grid.
        }}
        onApplyFilters={() => {
          // Already on /library — just close the sidebar so the user can see
          // the (already-active) filters take effect on the visible grid.
          setSidebarOpen(false);
        }}
        onLogo={() => {
          setSidebarOpen(false);
          clearFilters();
          router.push('/');
        }}
        onSavedFilters={() => {
          setSidebarOpen(false);
          router.push('/saved-filters');
        }}
        onTriage={() => {
          setSidebarOpen(false);
          router.push('/triage');
        }}
        onSettings={() => {
          setSidebarOpen(false);
          router.push('/settings');
        }}
        onSignOut={() => {
          setSidebarOpen(false);
          onSignOut();
        }}
      />

      {/* Onboarding overlays */}
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
      fontSize: 11,
      letterSpacing: 2,
      textTransform: 'uppercase',
      color: c.inkMuted,
      marginTop: 6,
      marginBottom: 32,
    },
    bigBtn: {
      backgroundColor: c.ink,
      paddingHorizontal: 28,
      paddingVertical: 16,
      borderRadius: 4,
    },
    bigBtnText: {
      color: c.parchment,
      fontSize: 16,
      letterSpacing: 1.4,
      textTransform: 'uppercase',
      fontWeight: '600',
    },
    cellIntent: { width: '100%', aspectRatio: 9 / 16 },
    demoLink: {
      fontSize: 11,
      letterSpacing: 1.4,
      textTransform: 'uppercase',
      color: c.inkMuted,
      textDecorationLine: 'underline',
      textDecorationStyle: 'dashed',
    },
    bulkBar: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      paddingTop: 56,
      paddingBottom: 14,
      paddingHorizontal: 20,
      backgroundColor: c.ink,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      zIndex: 20,
    },
    bulkCount: {
      color: c.parchment,
      fontSize: 13,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      fontWeight: '600',
    },
    bulkIconBtn: { padding: 4 },
  });
