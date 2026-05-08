import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { LayoutAnimation, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Chip } from './Chip';
import { Iris } from './Iris';
import { SaveFilterButton } from './SaveFilterButton';
import { colors, statusColors, urgencyColors } from '@/lib/colors';
import { emptyFilters, filtersActive, type Filters } from '@/lib/filters';
import { useFilters } from '@/lib/filtersContext';
import { capitalize, STATUSES, URGENCIES } from '@/lib/options';

type Props = {
  filters: Filters;
  onChange: (f: Filters) => void;
  totalCount?: number;
  filteredCount?: number;
  /** Callback to open the sidebar (where filters are set). */
  onOpenSidebar: () => void;
};

const removeFromSet = <T,>(s: Set<T>, v: T): Set<T> => {
  const next = new Set(s);
  next.delete(v);
  return next;
};

const animateNext = () => {
  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
};

/**
 * Header above the grid showing only ACTIVE filter chips (each with an X to
 * remove). Plus a hamburger to open the sidebar. Matches spec for the
 * filtered-grid header pattern.
 */
export const ActiveFilters = ({
  filters,
  onChange,
  totalCount,
  filteredCount,
  onOpenSidebar,
}: Props) => {
  const { searchQuery, setSearchQuery } = useFilters();
  const trimmedSearch = searchQuery.trim();
  const hasSearch = trimmedSearch.length > 0;
  const active = filtersActive(filters) + (hasSearch ? 1 : 0);
  const showCount = typeof totalCount === 'number';
  const isFiltered = showCount && active > 0 && filteredCount !== totalCount;

  return (
    <View style={styles.wrap}>
      {/* Row 0 — Overlook wordmark + hamburger. Tap wordmark to return home,
          tap hamburger to open the sidebar (left-edge swipe also works). */}
      <View style={styles.brandRow}>
        <Pressable
          onPress={onOpenSidebar}
          hitSlop={6}
          style={({ pressed }) => [styles.brand, pressed && { opacity: 0.7 }]}
          accessibilityLabel="Open sidebar"
        >
          <Iris level={3} size={26} color={colors.ink} />
          <Text style={styles.brandText}>Overlook</Text>
        </Pressable>
        <View style={{ flex: 1 }} />
      </View>

      {/* Row 1 — chips + count. */}
      <View style={styles.topRow}>

        {active > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chips}
            style={styles.chipScroll}
          >
            {hasSearch && (
              <Chip
                key="search"
                label={`"${trimmedSearch}"`}
                variant="meta"
                selected
                color={colors.ink}
                onPress={onOpenSidebar}
                onRemove={() => {
                  animateNext();
                  setSearchQuery('');
                }}
              />
            )}
            {Array.from(filters.tagQueries).map((q) => (
              <Chip
                key={`q-${q}`}
                label={q}
                variant="meta"
                selected
                color={colors.ink}
                onPress={onOpenSidebar}
                onRemove={() => {
                  animateNext();
                  const next = new Set(filters.tagQueries);
                  next.delete(q);
                  onChange({ ...filters, tagQueries: next });
                }}
              />
            ))}
            {Array.from(filters.urgencies).map((u) => (
              <Chip
                key={`u-${u}`}
                label={URGENCIES.find((x) => x.key === u)?.label ?? u}
                variant="meta"
                selected
                color={urgencyColors[u] ?? colors.ink}
                onPress={onOpenSidebar}
                onRemove={() => {
                  animateNext();
                  onChange({ ...filters, urgencies: removeFromSet(filters.urgencies, u) });
                }}
              />
            ))}
            {Array.from(filters.statuses).map((s) => (
              <Chip
                key={`s-${s}`}
                label={STATUSES.find((x) => x.key === s)?.label ?? s}
                variant="meta"
                selected
                color={statusColors[s] ?? colors.ink}
                onPress={onOpenSidebar}
                onRemove={() => {
                  animateNext();
                  onChange({ ...filters, statuses: removeFromSet(filters.statuses, s) });
                }}
              />
            ))}
            {Array.from(filters.categories).map((c) => (
              <Chip
                key={`c-${c}`}
                label={capitalize(c)}
                variant="meta"
                selected
                color={colors.ink}
                onPress={onOpenSidebar}
                onRemove={() => {
                  animateNext();
                  onChange({ ...filters, categories: removeFromSet(filters.categories, c) });
                }}
              />
            ))}
            {Array.from(filters.resonances).map((r) => (
              <Chip
                key={`r-${r}`}
                label={`level ${r}`}
                variant="meta"
                selected
                color={colors.ink}
                onPress={onOpenSidebar}
                onRemove={() => {
                  animateNext();
                  onChange({ ...filters, resonances: removeFromSet(filters.resonances, r) });
                }}
              />
            ))}
          </ScrollView>
        ) : (
          <Text style={styles.totalLabel}>
            {showCount
              ? `${totalCount} screenshot${totalCount === 1 ? '' : 's'}`
              : ''}
          </Text>
        )}
      </View>

      {/* Row 2 — small editorial action row: count · save · clear, all as
          underlined links. Only shows when filters are active. */}
      {active > 0 && (
        <View style={styles.metaRow}>
          {showCount && (
            <Text style={styles.metaText}>
              {isFiltered ? `${filteredCount} of ${totalCount}` : `${totalCount}`} results
            </Text>
          )}
          <View style={styles.metaSpacer} />
          <SaveFilterButton filters={filters} compact />
          <Text style={styles.metaSep}>·</Text>
          <Pressable
            onPress={() => {
              onChange(emptyFilters());
              setSearchQuery('');
            }}
            hitSlop={6}
          >
            <Text style={styles.metaLink}>clear all</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 20, paddingTop: 52, paddingBottom: 20 },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    marginBottom: 10,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandText: {
    fontFamily: 'PlayfairDisplay_500Medium',
    fontSize: 26,
    lineHeight: 26,
    includeFontPadding: false,
    color: colors.ink,
    letterSpacing: -0.4,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  menuBtn: { padding: 4 },
  count: {
    flex: 1,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.inkMuted,
  },
  clearAll: {
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.inkMuted,
    textDecorationLine: 'underline',
  },
  chipScroll: { flex: 1 },
  chips: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  totalLabel: {
    flex: 1,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.inkMuted,
    textAlign: 'right',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 10,
    gap: 6,
  },
  metaText: {
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.inkMuted,
  },
  metaSpacer: { flex: 1 },
  metaSep: { color: colors.divider, fontSize: 11 },
  metaLink: {
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.inkMuted,
    textDecorationLine: 'underline',
  },
});
