import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, usePathname } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, BackHandler, Dimensions, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import DraggableFlatList, { ScaleDecorator } from 'react-native-draggable-flatlist';

import { DetailSheetHost, type DetailSheetHostHandle } from '@/components/DetailSheetHost';
import { EdgeSwipe } from '@/components/EdgeSwipe';
import { GhostHint } from '@/components/GhostHint';
import { HomeRow } from '@/components/HomeRow';
import { Iris } from '@/components/Iris';
import { Sidebar } from '@/components/Sidebar';
import { useToast } from '@/components/Toast';
import { markHintSeen, wasHintSeen } from '@/lib/hints';
import { getQueuedIds } from '@/lib/analysisQueue';
import { signOut, useSession } from '@/lib/auth';
import { useDemoMode } from '@/lib/demoMode';
import { heavyHaptic } from '@/lib/haptics';
import type { FontSet, Palette } from '@/lib/colors';
import { setBatchState, useBatchState } from '@/lib/batchState';
import { applyFilters as applyFiltersToItems, emptyFilters, filtersActive, type Filters } from '@/lib/filters';
import { useFilters } from '@/lib/filtersContext';
import { pickAndImportImages } from '@/lib/galleryPicker';
import { capitalize } from '@/lib/options';
import { mergeWithDefaults, useHiddenRows, usePinOrder, useRowOrder } from '@/lib/rowOrder';
import { useColors, useFonts } from '@/lib/themeContext';
import { listPinnedFilters, type SavedFilter } from '@/lib/savedFilters';
import { fetchScreenshots } from '@/lib/screenshots';
import type { LocalScreenshot } from '@/lib/uploads';
import { useUndoableDelete } from '@/lib/useUndoableDelete';

const SCREEN_WIDTH = Dimensions.get('window').width;

const URGENT_KEYS = new Set(['today', 'expires_soon', 'this_week']);

/**
 * Home screen per spec: urgent row, pinned filters (when present), recently
 * added grid, untagged row at bottom. Auto-surfaced category rows are
 * deferred per Maggie's call.
 */
export default function HomeScreen() {
  const { session } = useSession();
  const [items, setItems] = useState<LocalScreenshot[]>([]);
  const [queuedIds, setQueuedIds] = useState<Set<string>>(new Set());
  const [showWhatsNext, setShowWhatsNext] = useState(false);
  const [pinnedFilters, setPinnedFilters] = useState<SavedFilter[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [batchRefreshKey, setBatchRefreshKey] = useState(0);
  const batchState = useBatchState(batchRefreshKey);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { filters, setFilters, applyFilters: applyFilterCtx, setSearchQuery } = useFilters();
  const { remove: undoableRemove } = useUndoableDelete(setItems);
  const [reorderMode, setReorderMode] = useState(false);
  const { order: rowOrder, replace: replaceRowOrder } = useRowOrder();
  const { order: pinOrder, replace: replacePinOrder } = usePinOrder();
  const { hidden: hiddenRows, hide: hideRow, clear: clearHidden } = useHiddenRows();
  const [demoOn, setDemoOn] = useDemoMode();
  const insets = useSafeAreaInsets();
  const sheetHostRef = useRef<DetailSheetHostHandle>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const [loaded, setLoaded] = useState(false);

  const c = useColors();
  const f = useFonts();
  const styles = useMemo(() => makeStyles(c, f), [c, f]);

  // Home pinch-zoom: how many cards visible per row width.
  // 2 = bigger, 3 = default, 4 = smaller. Gallery is full-bleed (no edge
  // padding) so cellWidth divides the entire screen width.
  const [homeCols, setHomeCols] = useState<2 | 3 | 4>(3);
  // Tracks whether a 2-finger pinch is in flight; while true we disable
  // the horizontal-scroll galleries so the pinch isn't fighting the
  // FlatList scroll handler.
  const [zoomActive, setZoomActive] = useState(false);
  const ROW_GAP = 3;
  const cellWidth = Math.floor(
    (SCREEN_WIDTH - ROW_GAP * (homeCols - 1)) / homeCols,
  );

  // Pinch gesture wrapping the home ScrollView. Pinch out (>1.3) bumps to a
  // bigger card size; pinch in (<0.75) shrinks. onStart fires on the
  // 2-finger gesture activation — we flip zoomActive so the gallery
  // FlatLists stop consuming the gesture, and flip it back on end.
  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .runOnJS(true)
        .onStart(() => setZoomActive(true))
        .onEnd((e) => {
          setZoomActive(false);
          if (e.scale > 1.3) {
            setHomeCols((c) => (c === 4 ? 3 : c === 3 ? 2 : 2));
          } else if (e.scale < 0.75) {
            setHomeCols((c) => (c === 2 ? 3 : c === 3 ? 4 : 4));
          }
        })
        .onFinalize(() => setZoomActive(false)),
    [],
  );

  const loadItems = useCallback(async () => {
    if (!session) return;
    const [rows, pinned, queued] = await Promise.all([
      fetchScreenshots(),
      listPinnedFilters(),
      getQueuedIds(),
    ]);
    setItems(rows);
    setPinnedFilters(pinned);
    setQueuedIds(queued);
    setLoaded(true);
  }, [session]);

  useEffect(() => {
    void loadItems();
  }, [loadItems, demoOn]);

  const toast = useToast();

  // First-time home hint: ghost-hand swipe-right to telegraph the sidebar.
  const [showSwipeHint, setShowSwipeHint] = useState(false);
  useEffect(() => {
    if (!loaded || items.length === 0) return;
    void (async () => {
      if (!(await wasHintSeen('home-swipe-filter'))) {
        setShowSwipeHint(true);
        await markHintSeen('home-swipe-filter');
      }
    })();
  }, [loaded, items.length]);

  // Pinch-zoom hint — fires after the swipe hint has had its moment.
  const [showPinchHint, setShowPinchHint] = useState(false);
  useEffect(() => {
    if (!loaded || items.length === 0) return;
    if (showSwipeHint) return; // don't stack
    void (async () => {
      if (!(await wasHintSeen('home-pinch-zoom'))) {
        const t = setTimeout(async () => {
          setShowPinchHint(true);
          await markHintSeen('home-pinch-zoom');
        }, 4000);
        return () => clearTimeout(t);
      }
    })();
  }, [loaded, items.length, showSwipeHint]);

  // Bulletproof sidebar reset: useFocusEffect alone wasn't reliable across
  // every navigation flow (esp. via router.replace). Layering a pathname
  // watcher means any time we land on home, sidebar is forced closed.
  const pathname = usePathname();
  useEffect(() => {
    if (pathname === '/') {
      setSidebarOpen(false);
      setReorderMode(false);
    }
  }, [pathname]);

  // Re-fetch items + pinned filters on focus so changes made elsewhere
  // (e.g. saving a new pinned album) are reflected immediately on return.
  useFocusEffect(
    useCallback(() => {
      setSidebarOpen(false);
      setReorderMode(false);
      void loadItems();
    }, [loadItems]),
  );

  // Android hardware back: close overlays first (sheet > sidebar > reorder
  // mode) before letting the system exit the app from home.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (sheetOpen) {
        sheetHostRef.current?.dismiss();
        return true;
      }
      if (sidebarOpen) {
        setSidebarOpen(false);
        return true;
      }
      if (reorderMode) {
        setReorderMode(false);
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [sheetOpen, sidebarOpen, reorderMode]);

  // While a batch is actively processing, refetch items every 4s so the
  // gallery populates live as Supabase rows land.
  useEffect(() => {
    const active = batchState && batchState.processed < batchState.total;
    if (!active) return;
    const id = setInterval(() => {
      void loadItems();
    }, 4000);
    return () => clearInterval(id);
  }, [batchState, loadItems]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadItems();
      setBatchRefreshKey((k) => k + 1);
    } finally {
      setRefreshing(false);
    }
  };

  const urgent = useMemo(
    () => items.filter((it) => it.urgency && URGENT_KEYS.has(it.urgency)),
    [items],
  );
  // Per spec: when urgent is empty, "see what's next" surfaces month/season items.
  const whatsNext = useMemo(
    () =>
      items.filter((it) =>
        it.urgency &&
        (it.urgency === 'this_month' ||
          it.urgency === 'this_spring' ||
          it.urgency === 'this_summer' ||
          it.urgency === 'this_autumn' ||
          it.urgency === 'this_winter'),
      ),
    [items],
  );
  const recent = useMemo(() => items.slice(0, 24), [items]);
  // Categories for an item — prefer the multi-value `categories` array;
  // fall back to wrapping the singular `category` for legacy rows.
  const itemCategories = (it: LocalScreenshot): string[] =>
    it.categories && it.categories.length > 0
      ? it.categories
      : it.category
        ? [it.category]
        : [];
  const untagged = useMemo(
    () => items.filter((it) => itemCategories(it).length === 0),
    [items],
  );

  // Auto-surfaced category rows: top 5 by count, then re-ordered by user's
  // saved row order if any. Long-press a row title -> reorder mode.
  // With multi-category support, an item is counted (and appears in) EVERY
  // category it belongs to.
  const categoryRows = useMemo(() => {
    const counts = new Map<string, number>();
    for (const it of items) {
      for (const cat of itemCategories(it)) {
        counts.set(cat, (counts.get(cat) ?? 0) + 1);
      }
    }
    // Drop user-hidden categories before picking the top-5 so a hidden
    // row doesn't keep "stealing" a slot from the next-most-popular one.
    const hiddenSet = new Set(hiddenRows);
    const top5 = Array.from(counts.entries())
      .filter(([cat]) => !hiddenSet.has(cat))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([cat]) => cat);
    const ordered = mergeWithDefaults(rowOrder, top5).filter((cat) => !hiddenSet.has(cat));
    return ordered.map((cat) => ({
      category: cat,
      items: items.filter((it) => itemCategories(it).includes(cat)),
    }));
  }, [items, rowOrder, hiddenRows]);

  // Pinned-filter rows in user-set order (mergeWithDefaults appends any
  // newly pinned filters to the end of the saved order).
  const orderedPinnedFilters = useMemo(() => {
    const ids = pinnedFilters.map((p) => p.id);
    const order = mergeWithDefaults(pinOrder, ids);
    const byId = new Map(pinnedFilters.map((p) => [p.id, p]));
    return order.map((id) => byId.get(id)).filter((p): p is SavedFilter => Boolean(p));
  }, [pinnedFilters, pinOrder]);

  // Reorder mode merges categories and pinned filters into one list so the
  // user can freely swap between the two groups. The kind discriminator
  // tells the drag-end handler which orderings to update.
  type ReorderItem =
    | { kind: 'cat'; id: string; row: typeof categoryRows[number] }
    | { kind: 'pin'; id: string; pf: SavedFilter };
  const mergedReorderItems = useMemo<ReorderItem[]>(
    () => [
      ...categoryRows.map((row): ReorderItem => ({ kind: 'cat', id: row.category, row })),
      ...orderedPinnedFilters.map((pf): ReorderItem => ({ kind: 'pin', id: pf.id, pf })),
    ],
    [categoryRows, orderedPinnedFilters],
  );

  const onMergedReorderEnd = (data: ReorderItem[]) => {
    const newCats = data.filter((i) => i.kind === 'cat').map((i) => i.id);
    const newPins = data.filter((i) => i.kind === 'pin').map((i) => i.id);
    replaceRowOrder(newCats);
    replacePinOrder(newPins);
  };

  const onItemDelete = useCallback(
    (id: string) => {
      const item = items.find((it) => it.id === id);
      if (item) undoableRemove(item);
    },
    [items, undoableRemove],
  );

  const onItemChange = useCallback(
    (id: string, patch: Partial<LocalScreenshot>) => {
      setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
    },
    [],
  );

  const open = (it: LocalScreenshot) => sheetHostRef.current?.present(it.id);

  // Apply filters (from sidebar) → navigate to filtered grid page (which is /library for now;
  // dedicated /filtered route to be added). For sprint v2 simplicity we stay on home and
  // just route to /library when a filter is applied via the sidebar.

  // Pick-from-gallery — open the system image picker and import each
  // selected image through the same upload pipeline as a watcher-detected
  // screenshot. Lets the user add inspo / art / general images, not just
  // their phone's Screenshots album.
  const onPickFromGallery = useCallback(async () => {
    setSidebarOpen(false);
    toast.show('Opening gallery…');
    const { added, skipped, errored } = await pickAndImportImages({ allowsMultipleSelection: true });
    if (added.length === 0 && skipped === 0 && errored === 0) return; // user canceled
    if (added.length > 0) {
      toast.show(
        `Added ${added.length} ${added.length === 1 ? 'image' : 'images'}` +
          (skipped > 0 ? ` · skipped ${skipped} duplicate${skipped === 1 ? '' : 's'}` : ''),
      );
      void loadItems();
    } else if (skipped > 0) {
      toast.show(`All ${skipped} already imported.`);
    } else if (errored > 0) {
      toast.error(`Failed to import ${errored} ${errored === 1 ? 'image' : 'images'}.`);
    }
  }, [toast, loadItems]);

  // LOADING STATE — first fetch hasn't completed yet
  if (!loaded && session) {
    return (
      <View style={[styles.container, styles.center]}>
        <Iris level={3} size={36} color={c.ink} spinning />
      </View>
    );
  }

  // EMPTY STATE
  if (items.length === 0) {
    const isUploading = batchState && batchState.processed < batchState.total;
    return (
      <View style={[styles.container, styles.center]}>
        <EdgeSwipe onOpen={() => setSidebarOpen(true)} />
        <View style={styles.emptyHero}>
          <Iris level={3} size={64} color={c.ink} spinning={Boolean(isUploading)} />
        </View>
        <Text style={styles.title}>Overlook</Text>
        {isUploading ? (
          <>
            <Text style={styles.subtitle}>importing your screenshots</Text>
            <Text style={styles.emptyBody}>
              {batchState!.processed} of {batchState!.total} done
            </Text>
            <Text style={[styles.emptyBody, { marginTop: -8 }]}>
              Your images will appear here{'\n'}when they finish.
            </Text>
            <Pressable
              onPress={() => router.push('/upload')}
              style={({ pressed }) => [styles.bigBtn, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.bigBtnText}>view progress</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                Alert.alert(
                  'Cancel import?',
                  'The screenshots already imported stay in your library. The rest will not be processed.',
                  [
                    { text: 'Keep going', style: 'cancel' },
                    {
                      text: 'Cancel',
                      style: 'destructive',
                      onPress: () => {
                        void setBatchState(null);
                      },
                    },
                  ],
                );
              }}
              hitSlop={8}
              style={{ marginTop: 24 }}
            >
              <Text style={styles.demoLink}>cancel import</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.subtitle}>your screenshot library</Text>
            <Text style={styles.emptyBody}>
              A quiet home for the inspo, references, and visual notes scattered across your phone.
            </Text>
            <Pressable
              onPress={() => router.push('/upload')}
              style={({ pressed }) => [styles.bigBtn, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.bigBtnText}>upload screenshots</Text>
            </Pressable>
            <Pressable onPress={() => void setDemoOn(true)} hitSlop={8} style={{ marginTop: 24 }}>
              <Text style={styles.demoLink}>or load demo data</Text>
            </Pressable>
          </>
        )}
        <SidebarRender
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          filters={filters}
          onFiltersChange={setFilters}
          email={session?.user.email ?? null}
          onPickFromGallery={onPickFromGallery}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: c.parchment }]}>
      <GestureDetector gesture={pinchGesture}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: 60 + insets.bottom }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.ink} />}
        // Allow normal page scroll even while reordering so the user can
        // reach rows below the fold. DraggableFlatList claims its drag
        // gestures via long-press and won't fight regular scroll.
      >
        {/* Batch resume banner — appears when a bulk import is in progress
            or has remaining items. Tap to jump back into /upload. */}
        {batchState && batchState.processed < batchState.total && (
          <Pressable onPress={() => router.push('/upload')} style={styles.batchBanner}>
            <Ionicons name="arrow-forward" size={16} color={c.parchment} />
            <Text style={styles.batchBannerText}>
              importing · {batchState.processed} of {batchState.total} done · tap to view
            </Text>
          </Pressable>
        )}

        {/* Top header — sidebar trigger + title. When the batch banner is
            visible, it already provides the top safe-area gap, so the header
            tightens up to avoid an awkward second gap. */}
        <View
          style={[
            styles.header,
            batchState && batchState.processed < batchState.total && { paddingTop: 12 },
          ]}
        >
          <Pressable
            onPress={() => setSidebarOpen(true)}
            hitSlop={10}
            style={({ pressed }) => [pressed && { opacity: 0.7 }]}
            accessibilityLabel="Open sidebar"
          >
            <Iris level={3} size={26} color={c.ink} />
          </Pressable>
          <Pressable
            onPress={() => router.replace('/')}
            hitSlop={6}
            style={({ pressed }) => [{ marginLeft: 10 }, pressed && { opacity: 0.7 }]}
            accessibilityLabel="Go to home"
          >
            <Text style={styles.headerTitle}>Overlook</Text>
          </Pressable>
          <View style={{ flex: 1 }} />
          {!reorderMode && (
            <Pressable onPress={() => router.push('/library')} hitSlop={10}>
              <Text style={styles.headerLink}>all</Text>
            </Pressable>
          )}
        </View>

        {!reorderMode && urgent.length > 0 && (
          <HomeRow
            title="urgent"
            count={urgent.length}
            items={urgent}
            cellWidth={cellWidth}
            queuedIds={queuedIds}
            onCardPress={open}
            scrollLocked={zoomActive}
            onSeeAll={() => {
              const next = emptyFilters();
              for (const k of URGENT_KEYS) next.urgencies.add(k);
              applyFilterCtx(next);
              router.push('/library');
            }}
          />
        )}
        {!reorderMode && urgent.length === 0 && whatsNext.length > 0 && (
          <View style={styles.whatsNextWrap}>
            <Pressable onPress={() => setShowWhatsNext((v) => !v)} hitSlop={6}>
              <Text style={styles.whatsNextLabel}>
                Nothing urgent · {showWhatsNext ? 'hide' : 'see what’s next'}
              </Text>
            </Pressable>
            {showWhatsNext && (
              <HomeRow
                title="this month / season"
                count={whatsNext.length}
                items={whatsNext}
                cellWidth={cellWidth}
                queuedIds={queuedIds}
                onCardPress={open}
                scrollLocked={zoomActive}
                onSeeAll={() => {
                  const next = emptyFilters();
                  next.urgencies.add('this_month');
                  next.urgencies.add('this_spring');
                  next.urgencies.add('this_summer');
                  next.urgencies.add('this_autumn');
                  next.urgencies.add('this_winter');
                  applyFilterCtx(next);
                  router.push('/library');
                }}
              />
            )}
          </View>
        )}

        {/* Reorder bar — visible above the merged drag list. Categories +
            pinned albums can be reordered freely AND swapped between the
            groups (drag a pinned album above categories, etc). */}
        {reorderMode && (
          <View style={styles.reorderHeader}>
            <Text style={styles.reorderHint}>
              Long-press a row title to drag, tap × to hide.
            </Text>
            {hiddenRows.length > 0 && (
              <Pressable onPress={() => clearHidden()} hitSlop={8}>
                <Text style={[styles.headerLink, { marginRight: 12 }]}>
                  show {hiddenRows.length} hidden
                </Text>
              </Pressable>
            )}
            <Pressable onPress={() => setReorderMode(false)} hitSlop={8}>
              <Text style={styles.headerLink}>done</Text>
            </Pressable>
          </View>
        )}

        {reorderMode ? (
          <DraggableFlatList
            data={mergedReorderItems}
            keyExtractor={(item) => `${item.kind}:${item.id}`}
            activationDistance={8}
            nestedScrollEnabled
            autoscrollThreshold={80}
            autoscrollSpeed={140}
            onDragEnd={({ data }) => onMergedReorderEnd(data)}
            renderItem={({ item, drag, isActive }) => {
              const cards =
                item.kind === 'cat'
                  ? item.row.items.slice(0, 30)
                  : applyFiltersToItems(items, item.pf.filters).slice(0, 30);
              const title = item.kind === 'cat' ? item.row.category : item.pf.name;
              const count =
                item.kind === 'cat'
                  ? item.row.items.length
                  : applyFiltersToItems(items, item.pf.filters).length;
              return (
                <ScaleDecorator>
                  <View style={isActive && styles.rowActive}>
                    <HomeRow
                      title={title}
                      count={count}
                      items={cards}
                      cellWidth={cellWidth}
                      queuedIds={queuedIds}
                      // No card press in reorder mode — the FlatList still
                      // renders cards but taps are absorbed by the drag gesture.
                      onCardPress={() => {}}
                      onSeeAll={() => {}}
                      onTitleLongPress={drag}
                      reorderMode
                      emptyMessage="No matches yet"
                      onHide={
                        item.kind === 'cat'
                          ? () => hideRow(item.row.category)
                          : undefined
                      }
                    />
                  </View>
                </ScaleDecorator>
              );
            }}
          />
        ) : (
          categoryRows.map((row) => (
            <HomeRow
              key={`cat-${row.category}`}
              title={capitalize(row.category)}
              count={row.items.length}
              items={row.items}
              maxItems={30}
              cellWidth={cellWidth}
              queuedIds={queuedIds}
              onCardPress={open}
              scrollLocked={zoomActive}
              onTitleLongPress={() => setReorderMode(true)}
              onSeeAll={() => {
                const next = emptyFilters();
                next.categories.add(row.category);
                applyFilterCtx(next);
                router.push('/library');
              }}
            />
          ))
        )}

        {!reorderMode && orderedPinnedFilters.map((pf) => {
          const matched = applyFiltersToItems(items, pf.filters);
          return (
            <HomeRow
              key={pf.id}
              title={pf.name}
              count={matched.length}
              items={matched}
              maxItems={30}
              cellWidth={cellWidth}
              queuedIds={queuedIds}
              onCardPress={open}
              scrollLocked={zoomActive}
              emptyMessage="No matches yet"
              onTitleLongPress={() => setReorderMode(true)}
              onSeeAll={() => {
                applyFilterCtx(pf.filters);
                setSearchQuery(pf.searchQuery ?? '');
                router.push('/library');
              }}
            />
          );
        })}

        {!reorderMode && (
          <HomeRow
            title="recently added"
            count={recent.length}
            items={recent}
            cellWidth={cellWidth}
            queuedIds={queuedIds}
            onCardPress={open}
            scrollLocked={zoomActive}
            onSeeAll={() => router.push('/library')}
          />
        )}

        {!reorderMode && untagged.length > 0 && (
          <HomeRow
            title="untagged"
            count={untagged.length}
            items={untagged}
            cellWidth={cellWidth}
            queuedIds={queuedIds}
            onCardPress={open}
            scrollLocked={zoomActive}
            dimmed
            secondaryLabel="triage ›"
            onSecondary={() => router.push('/triage')}
            onSeeAll={() => {
              applyFilterCtx(emptyFilters());
              router.push('/library');
            }}
          />
        )}
      </ScrollView>
      </GestureDetector>

      {/* Edge-swipe affordance — rendered AFTER the ScrollView so it stacks
          on top and reliably catches left-edge swipes. */}
      <EdgeSwipe onOpen={() => setSidebarOpen(true)} />

      {/* No FAB per spec — upload lives in the sidebar. */}

      <DetailSheetHost
        ref={sheetHostRef}
        items={items}
        onItemChange={onItemChange}
        onItemDelete={onItemDelete}
        onOpenChange={setSheetOpen}
      />

      <SidebarRender
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        filters={filters}
        onFiltersChange={setFilters}
        email={session?.user.email ?? null}
        onPickFromGallery={onPickFromGallery}
      />

      {/* Onboarding overlays — fire once each, tracked via lib/hints. */}
      <GhostHint
        visible={showSwipeHint}
        variant="swipe-right"
        label="Swipe to filter"
        onDismiss={() => setShowSwipeHint(false)}
      />
      <GhostHint
        visible={showPinchHint}
        variant="pinch-in"
        label="Pinch to resize cards"
        onDismiss={() => setShowPinchHint(false)}
      />
    </View>
  );
}

// Wraps Sidebar with consistent nav callbacks
const SidebarRender = ({
  open,
  onClose,
  filters,
  onFiltersChange,
  email,
  onPickFromGallery,
}: {
  open: boolean;
  onClose: () => void;
  filters: Filters;
  onFiltersChange: (f: Filters) => void;
  email: string | null;
  onPickFromGallery?: () => void;
}) => (
  <Sidebar
    open={open}
    onClose={onClose}
    filters={filters}
    onFiltersChange={onFiltersChange}
    userEmail={email}
    onPickFromGallery={onPickFromGallery}
    onUpload={() => {
      onClose();
      router.push('/upload');
    }}
    onLibrary={() => {
      onClose();
      router.push('/library');
    }}
    onApplyFilters={() => {
      onClose();
      router.push('/library');
    }}
    onLogo={() => {
      onClose();
      // Logo tap means "back to a clean home view" — clear any active filters
      // so the user isn't stuck in a filtered state after navigating away.
      onFiltersChange(emptyFilters());
    }}
    onSavedFilters={() => {
      onClose();
      router.push('/saved-filters');
    }}
    onTriage={() => {
      onClose();
      router.push('/triage');
    }}
    onSettings={() => {
      onClose();
      router.push('/settings');
    }}
    onSignOut={() => {
      onClose();
      void signOut();
    }}
  />
);

const makeStyles = (c: Palette, f: FontSet) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.parchment },
    center: { alignItems: 'center', justifyContent: 'center', padding: 32 },
    title: { fontFamily: f.displayMedium, fontSize: 44, color: c.ink, letterSpacing: -0.5 },
    subtitle: {
      fontSize: 11,
      letterSpacing: 2,
      textTransform: 'uppercase',
      color: c.inkMuted,
      marginTop: 6,
      marginBottom: 24,
    },
    emptyHero: {
      marginBottom: 24,
      opacity: 0.92,
    },
    emptyBody: {
      fontFamily: f.italic,
      fontSize: 16,
      color: c.inkSoft,
      textAlign: 'center',
      maxWidth: 280,
      lineHeight: 24,
      marginBottom: 36,
    },
    demoLink: {
      fontSize: 11,
      letterSpacing: 1.4,
      textTransform: 'uppercase',
      color: c.inkMuted,
      textDecorationLine: 'underline',
      textDecorationStyle: 'dashed',
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
    header: {
      flexDirection: 'row',
      // Text items bottom-align so the "all" link sits flush with the
      // baseline of the Overlook wordmark; the iris is overridden below
      // to vertically center against the wordmark.
      alignItems: 'flex-end',
      paddingHorizontal: 20,
      paddingTop: 52,
      paddingBottom: 20,
      gap: 12,
    },
    headerTitleWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    headerTitle: {
      fontFamily: f.displayMedium,
      fontSize: 26,
      lineHeight: 26,
      color: c.ink,
      letterSpacing: -0.4,
      includeFontPadding: false,
    },
    headerLink: {
      fontSize: 11,
      lineHeight: 11,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
      color: c.inkMuted,
      textDecorationLine: 'underline',
      includeFontPadding: false,
    },
    whatsNextWrap: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 12 },
    reorderBlock: {
      marginVertical: 8,
      paddingVertical: 8,
      backgroundColor: c.parchmentSoft,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: c.divider,
    },
    rowActive: {
      backgroundColor: c.parchmentSoft,
      elevation: 6,
      shadowColor: '#000',
      shadowOpacity: 0.18,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
    },
    reorderHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingBottom: 8,
    },
    reorderHint: {
      flex: 1,
      fontFamily: f.italic,
      fontSize: 13,
      color: c.inkSoft,
    },
    reorderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingVertical: 18,
      paddingHorizontal: 20,
      backgroundColor: c.parchment,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderColor: c.divider,
    },
    reorderRowActive: {
      backgroundColor: c.parchmentSoft,
      elevation: 6,
      shadowColor: '#000',
      shadowOpacity: 0.18,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
    },
    reorderRowTitle: {
      flex: 1,
      fontFamily: f.displayMedium,
      fontSize: 18,
      color: c.ink,
      letterSpacing: -0.2,
    },
    reorderRowCount: {
      fontFamily: f.italic,
      fontSize: 14,
      color: c.inkMuted,
    },
    whatsNextLabel: {
      fontSize: 11,
      letterSpacing: 1.4,
      textTransform: 'uppercase',
      color: c.inkMuted,
      textDecorationLine: 'underline',
      textDecorationStyle: 'dashed',
    },
    batchBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: c.ink,
      paddingHorizontal: 16,
      paddingVertical: 14,
      marginHorizontal: 20,
      marginTop: 56,
      borderRadius: 4,
    },
    batchBannerText: {
      flex: 1,
      color: c.parchment,
      fontSize: 12,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
    },
  });
