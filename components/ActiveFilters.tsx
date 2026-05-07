import { Ionicons } from '@expo/vector-icons';
import { LayoutAnimation, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Chip } from './Chip';
import { SaveFilterButton } from './SaveFilterButton';
import { colors, statusColors, urgencyColors } from '@/lib/colors';
import { emptyFilters, filtersActive, type Filters } from '@/lib/filters';
import { STATUSES, URGENCIES } from '@/lib/options';

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
  const active = filtersActive(filters);
  const showCount = typeof totalCount === 'number';
  const isFiltered = showCount && active > 0 && filteredCount !== totalCount;

  return (
    <View style={styles.wrap}>
      <View style={styles.topRow}>
        <Pressable onPress={onOpenSidebar} hitSlop={10} style={styles.menuBtn}>
          <Ionicons name="menu" size={22} color={colors.ink} />
        </Pressable>
        {showCount && (
          <Text style={styles.count}>
            {isFiltered
              ? `showing ${filteredCount} of ${totalCount}`
              : `${totalCount} screenshot${totalCount === 1 ? '' : 's'}`}
          </Text>
        )}
        {active > 0 && (
          <Pressable onPress={() => onChange(emptyFilters())} hitSlop={6}>
            <Text style={styles.clearAll}>clear all</Text>
          </Pressable>
        )}
      </View>

      {active > 0 && (
        <View style={styles.saveRow}>
          <SaveFilterButton filters={filters} />
        </View>
      )}

      {active > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {Array.from(filters.urgencies).map((u) => (
            <Chip
              key={`u-${u}`}
              label={URGENCIES.find((x) => x.key === u)?.label ?? u}
              variant="meta"
              selected
              color={urgencyColors[u] ?? colors.ink}
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
              onRemove={() => {
                animateNext();
                onChange({ ...filters, statuses: removeFromSet(filters.statuses, s) });
              }}
            />
          ))}
          {Array.from(filters.categories).map((c) => (
            <Chip
              key={`c-${c}`}
              label={c}
              variant="meta"
              selected
              color={colors.ink}
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
              onRemove={() => {
                animateNext();
                onChange({ ...filters, resonances: removeFromSet(filters.resonances, r) });
              }}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingTop: 50, paddingBottom: 12 },
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
  chips: { flexDirection: 'row', gap: 6, paddingTop: 12 },
  saveRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 },
});
