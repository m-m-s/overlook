import { Ionicons } from '@expo/vector-icons';
import { BottomSheetBackdrop, BottomSheetModal, type BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card, type CardData } from '@/components/Card';
import { EdgeSwipe } from '@/components/EdgeSwipe';
import { ScreenshotDetail } from '@/components/ScreenshotDetail';
import { Sidebar } from '@/components/Sidebar';
import { signOut, useSession } from '@/lib/auth';
import { colors, statusColors, urgencyColors } from '@/lib/colors';
import { applyFilters as applyFiltersToItems, emptyFilters, type Filters } from '@/lib/filters';
import { useFilters } from '@/lib/filtersContext';
import { listPinnedFilters, type SavedFilter } from '@/lib/savedFilters';
import { fetchScreenshots } from '@/lib/screenshots';
import type { LocalScreenshot } from '@/lib/uploads';
import { useUndoableDelete } from '@/lib/useUndoableDelete';

const URGENT_KEYS = new Set(['today', 'expires_soon', 'this_week']);

const toCardData = (it: LocalScreenshot): CardData => ({
  id: it.id,
  uri: it.uri,
  category: it.category ?? null,
  status: (it.status as keyof typeof statusColors) ?? null,
  urgency: (it.urgency as keyof typeof urgencyColors) ?? null,
  resonance: it.resonance ?? null,
});

/**
 * Home screen per spec: urgent row, pinned filters (when present), recently
 * added grid, untagged row at bottom. Auto-surfaced category rows are
 * deferred per Maggie's call.
 */
export default function HomeScreen() {
  const { session } = useSession();
  const [items, setItems] = useState<LocalScreenshot[]>([]);
  const [pinnedFilters, setPinnedFilters] = useState<SavedFilter[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { filters, setFilters, applyFilters: applyFilterCtx } = useFilters();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { remove: undoableRemove } = useUndoableDelete(setItems);
  const [sheetIndex, setSheetIndex] = useState(0);
  const sheetRef = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ['60%', '85%', '100%'], []);

  const loadItems = useCallback(async () => {
    if (!session) return;
    const [rows, pinned] = await Promise.all([fetchScreenshots(), listPinnedFilters()]);
    setItems(rows);
    setPinnedFilters(pinned);
  }, [session]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadItems();
    } finally {
      setRefreshing(false);
    }
  };

  const urgent = useMemo(
    () => items.filter((it) => it.urgency && URGENT_KEYS.has(it.urgency)),
    [items],
  );
  const recent = useMemo(() => items.slice(0, 24), [items]);
  const untagged = useMemo(() => items.filter((it) => !it.category), [items]);

  // Auto-surfaced category rows: most populous categories first (top 5).
  // Spec also mentions user-reorderable; deferred — natural order by count for now.
  const categoryRows = useMemo(() => {
    const counts = new Map<string, number>();
    for (const it of items) {
      if (!it.category) continue;
      counts.set(it.category, (counts.get(it.category) ?? 0) + 1);
    }
    const sorted = Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    return sorted.map(([cat]) => ({
      category: cat,
      items: items.filter((it) => it.category === cat),
    }));
  }, [items]);

  const onItemDelete = () => {
    if (!selectedId) return;
    const item = items.find((it) => it.id === selectedId);
    sheetRef.current?.dismiss();
    if (item) undoableRemove(item);
  };

  const onItemChange = (patch: Partial<LocalScreenshot>) => {
    if (!selectedId) return;
    setItems((prev) => prev.map((it) => (it.id === selectedId ? { ...it, ...patch } : it)));
  };

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.4} />
    ),
    [],
  );

  const open = (it: LocalScreenshot) => {
    setSelectedId(it.id);
    sheetRef.current?.present();
  };

  const selected = items.find((it) => it.id === selectedId) ?? null;

  // Apply filters (from sidebar) → navigate to filtered grid page (which is /library for now;
  // dedicated /filtered route to be added). For sprint v2 simplicity we stay on home and
  // just route to /library when a filter is applied via the sidebar.

  // EMPTY STATE
  if (items.length === 0) {
    return (
      <View style={[styles.container, styles.center]}>
        <EdgeSwipe onOpen={() => setSidebarOpen(true)} />
        <Text style={styles.title}>Overlook</Text>
        <Text style={styles.subtitle}>your screenshot library</Text>
        <Pressable onPress={() => router.push('/upload')} style={styles.bigBtn}>
          <Text style={styles.bigBtnText}>upload screenshots</Text>
        </Pressable>
        <SidebarRender
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          filters={filters}
          onFiltersChange={(f) => {
            setFilters(f);
            setSidebarOpen(false);
            router.push('/library');
          }}
          email={session?.user.email ?? null}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <EdgeSwipe onOpen={() => setSidebarOpen(true)} />

      <ScrollView
        contentContainerStyle={{ paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.ink} />}
      >
        {/* Top header — sidebar trigger + title */}
        <View style={styles.header}>
          <Pressable onPress={() => setSidebarOpen(true)} hitSlop={10}>
            <Ionicons name="menu" size={24} color={colors.ink} />
          </Pressable>
          <Text style={styles.headerTitle}>Overlook</Text>
          <Pressable onPress={() => router.push('/library')} hitSlop={10}>
            <Text style={styles.headerLink}>all</Text>
          </Pressable>
        </View>

        {/* Urgent row — auto-hides when nothing urgent (per spec) */}
        {urgent.length > 0 && (
          <Row title="urgent" count={urgent.length} onSeeAll={() => router.push('/library')}>
            <FlatList
              horizontal
              data={urgent}
              keyExtractor={(it) => it.id}
              showsHorizontalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={{ width: 3 }} />}
              contentContainerStyle={styles.rowList}
              renderItem={({ item }) => (
                <View style={styles.rowCell}>
                  <Card data={toCardData(item)} onPress={() => open(item)} />
                </View>
              )}
            />
          </Row>
        )}

        {/* Auto-surfaced category rows (top 5 by count) */}
        {categoryRows.map((row) => (
          <Row
            key={`cat-${row.category}`}
            title={row.category}
            count={row.items.length}
            onSeeAll={() => {
              const next = emptyFilters();
              next.categories.add(row.category);
              applyFilterCtx(next);
              router.push('/library');
            }}
          >
            <FlatList
              horizontal
              data={row.items.slice(0, 30)}
              keyExtractor={(it) => it.id}
              showsHorizontalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={{ width: 3 }} />}
              contentContainerStyle={styles.rowList}
              renderItem={({ item }) => (
                <View style={styles.rowCell}>
                  <Card data={toCardData(item)} onPress={() => open(item)} />
                </View>
              )}
            />
          </Row>
        ))}

        {/* Pinned saved-filter rows — auto-update as items change */}
        {pinnedFilters.map((pf) => {
          const matched = applyFiltersToItems(items, pf.filters);
          if (matched.length === 0) return null;
          return (
            <Row
              key={pf.id}
              title={pf.name}
              count={matched.length}
              onSeeAll={() => {
                applyFilterCtx(pf.filters);
                router.push('/library');
              }}
            >
              <FlatList
                horizontal
                data={matched.slice(0, 30)}
                keyExtractor={(it) => it.id}
                showsHorizontalScrollIndicator={false}
                ItemSeparatorComponent={() => <View style={{ width: 3 }} />}
                contentContainerStyle={styles.rowList}
                renderItem={({ item }) => (
                  <View style={styles.rowCell}>
                    <Card data={toCardData(item)} onPress={() => open(item)} />
                  </View>
                )}
              />
            </Row>
          );
        })}

        {/* Recently added — full-bleed 3-col grid (12-24 items) */}
        <Row title="recently added" count={recent.length} onSeeAll={() => router.push('/library')}>
          <View style={styles.recentGrid}>
            {recent.map((item, idx) => (
              <View
                key={item.id}
                style={[
                  styles.recentCell,
                  // 3 cols, 3px gap
                  { marginRight: (idx + 1) % 3 === 0 ? 0 : 3, marginBottom: 3 },
                ]}
              >
                <Card data={toCardData(item)} onPress={() => open(item)} />
              </View>
            ))}
          </View>
        </Row>

        {/* Untagged row at bottom — bare dimmed cards */}
        {untagged.length > 0 && (
          <Row
            title="untagged"
            count={untagged.length}
            onSeeAll={() => {
              // Navigate to library and filter by untagged category? Sidebar approach:
              // For sprint v2: just go to library.
              router.push('/library');
            }}
          >
            <FlatList
              horizontal
              data={untagged}
              keyExtractor={(it) => it.id}
              showsHorizontalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={{ width: 3 }} />}
              contentContainerStyle={styles.rowList}
              renderItem={({ item }) => (
                <View style={[styles.rowCell, styles.untaggedDim]}>
                  <Card data={toCardData(item)} onPress={() => open(item)} />
                </View>
              )}
            />
          </Row>
        )}
      </ScrollView>

      {/* FAB to bulk-upload */}
      <Pressable onPress={() => router.push('/upload')} style={styles.fab}>
        <Ionicons name="add" size={28} color={colors.parchment} />
      </Pressable>

      {/* Bottom sheet detail */}
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
          <ScreenshotDetail item={selected} onChange={onItemChange} onDelete={onItemDelete} snapIndex={sheetIndex} />
        )}
      </BottomSheetModal>

      <SidebarRender
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        filters={filters}
        onFiltersChange={(f) => {
          setFilters(f);
          setSidebarOpen(false);
          router.push('/library');
        }}
        email={session?.user.email ?? null}
      />
    </View>
  );
}

// Row helper — title bar + see-all + children body
const Row = ({
  title,
  count,
  onSeeAll,
  children,
}: {
  title: string;
  count: number;
  onSeeAll: () => void;
  children: React.ReactNode;
}) => (
  <View style={styles.row}>
    <View style={styles.rowHeader}>
      <Text style={styles.rowTitle}>{title}</Text>
      <Text style={styles.rowCount}>({count})</Text>
      <View style={{ flex: 1 }} />
      <Pressable onPress={onSeeAll} hitSlop={6}>
        <Text style={styles.rowSeeAll}>see all ›</Text>
      </Pressable>
    </View>
    {children}
  </View>
);

// Wraps Sidebar with consistent nav callbacks
const SidebarRender = ({
  open,
  onClose,
  filters,
  onFiltersChange,
  email,
}: {
  open: boolean;
  onClose: () => void;
  filters: Filters;
  onFiltersChange: (f: Filters) => void;
  email: string | null;
}) => (
  <Sidebar
    open={open}
    onClose={onClose}
    filters={filters}
    onFiltersChange={onFiltersChange}
    userEmail={email}
    onUpload={() => {
      onClose();
      router.push('/upload');
    }}
    onLibrary={() => {
      onClose();
      router.push('/library');
    }}
    onSavedFilters={() => {
      onClose();
      router.push('/saved-filters');
    }}
    onTriage={() => {
      onClose();
      router.push('/triage');
    }}
    onSignOut={() => {
      onClose();
      void signOut();
    }}
  />
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.parchment },
  center: { alignItems: 'center', justifyContent: 'center', padding: 32 },
  title: { fontFamily: 'Georgia', fontSize: 44, color: colors.ink, letterSpacing: -0.5 },
  subtitle: {
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 16,
    gap: 12,
  },
  headerTitle: { fontFamily: 'Georgia', fontSize: 28, color: colors.ink, letterSpacing: -0.4 },
  headerLink: {
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: colors.inkMuted,
    textDecorationLine: 'underline',
  },
  row: { marginBottom: 28 },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingHorizontal: 20,
    paddingBottom: 10,
    gap: 6,
  },
  rowTitle: {
    fontFamily: 'Georgia',
    fontSize: 18,
    color: colors.ink,
  },
  rowCount: {
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.inkMuted,
  },
  rowSeeAll: {
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.inkMuted,
  },
  rowList: { paddingHorizontal: 20 },
  rowCell: { width: 140, aspectRatio: 1 },
  untaggedDim: { opacity: 0.65 },
  recentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  recentCell: { width: '33.0%', aspectRatio: 1 },
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
    zIndex: 6,
  },
});
