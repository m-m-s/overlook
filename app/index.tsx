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
import type { FontSet, Palette } from '@/lib/colors';
import { signOut } from '@/lib/auth';
import { setBatchState } from '@/lib/batchState';
import { useDemoMode } from '@/lib/demoMode';
import { applyFilters as applyFiltersToItems, emptyFilters, filtersActive, type Filters } from '@/lib/filters';
import { useFilters } from '@/lib/filtersContext';
import { pickGalleryImages } from '@/lib/galleryPicker';
import { useScreenshotWatcher } from '@/lib/screenshotWatcher';
import { capitalize, CATEGORIES } from '@/lib/options';
import type { Category } from '@/components/CategoryIcon';
import { useColors, useFonts } from '@/lib/themeContext';
import { useHomeData } from '@/lib/useHomeData';
import { useHomeHints } from '@/lib/useHomeHints';
import { useHomeReorder, type ReorderItem } from '@/lib/useHomeReorder';
import { useUndoableDelete } from '@/lib/useUndoableDelete';
import type { SavedFilter } from '@/lib/savedFilters';
import type { LocalScreenshot } from '@/lib/uploads';

const SCREEN_WIDTH = Dimensions.get('window').width;
const ROW_GAP = 3;

export default function HomeScreen() {
  const c = useColors();
  const f = useFonts();
  const styles = useMemo(() => makeStyles(c, f), [c, f]);
  const insets = useSafeAreaInsets();
  const [demoOn, setDemoOn] = useDemoMode();
  const { filters, setFilters, applyFilters: applyFilterCtx, setSearchQuery } = useFilters();

  const {
    session, items, setItems, queuedIds, pinnedFilters, setPinnedFilters,
    refreshing, loaded, loadItems, onRefresh, batchState,
    urgent, whatsNext, recent, untagged,
  } = useHomeData();

  const {
    reorderMode, enterReorder, exitReorder,
    categoryRows, orderedPinnedFilters, mergedReorderItems,
    onMergedReorderEnd, hideCategory, unpinFilter,
  } = useHomeReorder(items, pinnedFilters, setPinnedFilters);

  const { showSwipeHint, setShowSwipeHint, showPinchHint, setShowPinchHint,
          showSelectHint, setShowSelectHint } = useHomeHints(loaded, items.length);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { remove: undoableRemove } = useUndoableDelete(setItems);
  const sheetHostRef = useRef<DetailSheetHostHandle>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const [homeCols, setHomeCols] = useState<2 | 3 | 4>(3);
  const [zoomActive, setZoomActive] = useState(false);
  const cellWidth = Math.floor((SCREEN_WIDTH - ROW_GAP * (homeCols - 1)) / homeCols);

  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .runOnJS(true)
        .onStart(() => setZoomActive(true))
        .onEnd((e) => {
          setZoomActive(false);
          if (e.scale > 1.3) {
            setHomeCols((col) => (col === 4 ? 3 : col === 3 ? 2 : 2));
          } else if (e.scale < 0.75) {
            setHomeCols((col) => (col === 2 ? 3 : col === 3 ? 4 : 4));
          }
        })
        .onFinalize(() => setZoomActive(false)),
    [],
  );

  const pathname = usePathname();
  useEffect(() => {
    if (pathname === '/') {
      setSidebarOpen(false);
      exitReorder();
    }
  }, [pathname]);

  useFocusEffect(
    useCallback(() => {
      setSidebarOpen(false);
      exitReorder();
      void loadItems();
    }, [loadItems]),
  );

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (sheetOpen) { sheetHostRef.current?.dismiss(); return true; }
      if (sidebarOpen) { setSidebarOpen(false); return true; }
      if (reorderMode) { exitReorder(); return true; }
      return false;
    });
    return () => sub.remove();
  }, [sheetOpen, sidebarOpen, reorderMode]);

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

  const { enqueue: enqueueAssets } = useScreenshotWatcher();
  const onPickFromGallery = useCallback(async () => {
    setSidebarOpen(false);
    const assets = await pickGalleryImages({ allowsMultipleSelection: true });
    if (assets.length === 0) return;
    enqueueAssets(assets);
  }, [enqueueAssets]);

  if (!loaded && session) {
    return (
      <View style={[styles.container, styles.center]}>
        <Iris level={3} size={36} color={c.ink} spinning />
      </View>
    );
  }

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
                    { text: 'Cancel', style: 'destructive', onPress: () => { void setBatchState(null); } },
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
          onClose={() => {
            setSidebarOpen(false);
            if (filtersActive(filters) > 0) router.push('/library');
          }}
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
      >
        {batchState && batchState.processed < batchState.total && (
          <Pressable onPress={() => router.push('/upload')} style={styles.batchBanner}>
            <Ionicons name="arrow-forward" size={16} color={c.parchment} />
            <Text style={styles.batchBannerText}>
              importing · {batchState.processed} of {batchState.total} done · tap to view
            </Text>
          </Pressable>
        )}

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
            style={({ pressed }) => [pressed && { opacity: 0.7 }]}
            accessibilityLabel="Go to home"
          >
            <Text style={styles.headerTitle}>Overlook</Text>
          </Pressable>
          <View style={{ flex: 1 }} />
          {reorderMode ? (
            <Pressable onPress={exitReorder} hitSlop={10}>
              <Text style={styles.headerLink}>done</Text>
            </Pressable>
          ) : (
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
              for (const k of ['overdue', 'today', 'expires_soon', 'this_week']) next.urgencies.add(k);
              applyFilterCtx(next);
              router.push('/library');
            }}
          />
        )}
        {!reorderMode && urgent.length === 0 && whatsNext.length > 0 && (
          <HomeRow
            title="coming up"
            count={whatsNext.length}
            items={whatsNext}
            cellWidth={cellWidth}
            queuedIds={queuedIds}
            onCardPress={open}
            scrollLocked={zoomActive}
            onSeeAll={() => {
              const next = emptyFilters();
              for (const k of ['this_month', 'this_spring', 'this_summer', 'this_autumn', 'this_winter']) next.urgencies.add(k);
              applyFilterCtx(next);
              router.push('/library');
            }}
          />
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
                      onCardPress={() => {}}
                      onSeeAll={() => {}}
                      onTitleLongPress={drag}
                      reorderMode
                      emptyMessage="No matches yet"
                      onHide={
                        item.kind === 'cat'
                          ? () => hideCategory(item.row.category)
                          : () => void unpinFilter(item.pf.id)
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
              iconCategory={row.category as Category}
              count={row.items.length}
              items={row.items}
              maxItems={30}
              cellWidth={cellWidth}
              queuedIds={queuedIds}
              onCardPress={open}
              scrollLocked={zoomActive}
              onTitleLongPress={enterReorder}
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
          const iconIsCategory = pf.icon && (CATEGORIES as readonly string[]).includes(pf.icon);
          return (
            <HomeRow
              key={pf.id}
              title={pf.name}
              iconCategory={iconIsCategory ? (pf.icon as Category) : undefined}
              iconEmoji={!iconIsCategory ? pf.icon : undefined}
              count={matched.length}
              items={matched}
              maxItems={30}
              cellWidth={cellWidth}
              queuedIds={queuedIds}
              onCardPress={open}
              scrollLocked={zoomActive}
              emptyMessage="No matches yet"
              onTitleLongPress={enterReorder}
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
          <>
            <Pressable
              onPress={() => router.push('/triage')}
              style={({ pressed }) => [styles.triageCta, pressed && { opacity: 0.75 }]}
            >
              <Text style={styles.triageCtaCount}>{untagged.length} untagged</Text>
              <Text style={styles.triageCtaLink}>triage →</Text>
            </Pressable>
            <HomeRow
              title="untagged"
              count={untagged.length}
              items={untagged}
              cellWidth={cellWidth}
              queuedIds={queuedIds}
              onCardPress={open}
              scrollLocked={zoomActive}
              dimmed
              onSeeAll={() => {
                applyFilterCtx(emptyFilters());
                router.push('/library');
              }}
            />
          </>
        )}
      </ScrollView>
      </GestureDetector>

      <EdgeSwipe onOpen={() => setSidebarOpen(true)} />

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
      <GhostHint
        visible={showSelectHint}
        variant="tap"
        label="Long press to select multiple"
        onDismiss={() => setShowSelectHint(false)}
        topOffset="65%"
      />
    </View>
  );
}

const SidebarRender = ({
  open, onClose, filters, onFiltersChange, email, onPickFromGallery,
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
    onUpload={() => { onClose(); router.push('/upload'); }}
    onLibrary={() => { onClose(); router.push('/library'); }}
    onApplyFilters={() => { onClose(); router.push('/library'); }}
    onLogo={() => { onClose(); onFiltersChange(emptyFilters()); }}
    onSavedFilters={() => { onClose(); router.push('/saved-filters'); }}
    onTriage={() => { onClose(); router.push('/triage'); }}
    onSettings={() => { onClose(); router.push('/settings'); }}
    onSignOut={() => { onClose(); void signOut(); }}
  />
);

const makeStyles = (c: Palette, f: FontSet) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.parchment },
    center: { alignItems: 'center', justifyContent: 'center', padding: 32 },
    title: { fontFamily: f.displayMedium, fontSize: 44, color: c.ink, letterSpacing: -0.5 },
    subtitle: {
      fontSize: 11, letterSpacing: 2, textTransform: 'uppercase',
      color: c.inkMuted, marginTop: 6, marginBottom: 24,
    },
    emptyHero: { marginBottom: 24, opacity: 0.92 },
    emptyBody: {
      fontFamily: f.italic, fontSize: 16, color: c.inkSoft,
      textAlign: 'center', maxWidth: 280, lineHeight: 24, marginBottom: 36,
    },
    demoLink: {
      fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase',
      color: c.inkMuted, textDecorationLine: 'underline', textDecorationStyle: 'dashed',
    },
    bigBtn: { backgroundColor: c.ink, paddingHorizontal: 28, paddingVertical: 16, borderRadius: 4 },
    bigBtnText: {
      color: c.parchment, fontSize: 16, letterSpacing: 1.4,
      textTransform: 'uppercase', fontWeight: '600',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      paddingHorizontal: 20, paddingTop: 52, paddingBottom: 20, gap: 8,
    },
    headerTitle: {
      fontFamily: f.displayMedium, fontSize: 26, lineHeight: 26,
      color: c.ink, letterSpacing: -0.4, includeFontPadding: false,
    },
    headerLink: {
      fontSize: 11, lineHeight: 11, letterSpacing: 1.5, textTransform: 'uppercase',
      color: c.inkMuted, textDecorationLine: 'underline', includeFontPadding: false,
    },
    rowActive: {
      backgroundColor: c.parchmentSoft, elevation: 6,
      shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
    },
    triageCta: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      marginHorizontal: 20, marginBottom: 10, paddingHorizontal: 16, paddingVertical: 12,
      borderWidth: 1, borderStyle: 'dashed', borderColor: c.inkMuted, borderRadius: 4,
    },
    triageCtaCount: { fontSize: 13, color: c.ink, letterSpacing: 0.2 },
    triageCtaLink: {
      fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase',
      color: c.inkMuted, textDecorationLine: 'underline',
    },
    batchBanner: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      backgroundColor: c.ink, paddingHorizontal: 16, paddingVertical: 14,
      marginHorizontal: 20, marginTop: 56, borderRadius: 4,
    },
    batchBannerText: {
      flex: 1, color: c.parchment, fontSize: 12,
      letterSpacing: 1.2, textTransform: 'uppercase',
    },
  });
