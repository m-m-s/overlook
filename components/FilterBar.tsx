import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Chip } from './Chip';
import { colors, statusColors, urgencyColors } from '@/lib/colors';
import { CATEGORIES, RESONANCE_LEVELS, STATUSES, URGENCIES } from '@/lib/options';

export type Filters = {
  categories: Set<string>;
  urgencies: Set<string>;
  statuses: Set<string>;
  resonances: Set<1 | 2 | 3>;
};

export const emptyFilters = (): Filters => ({
  categories: new Set(),
  urgencies: new Set(),
  statuses: new Set(),
  resonances: new Set(),
});

export const filtersActive = (f: Filters): number =>
  f.categories.size + f.urgencies.size + f.statuses.size + f.resonances.size;

const toggleSet = <T,>(s: Set<T>, v: T): Set<T> => {
  const next = new Set(s);
  if (next.has(v)) next.delete(v);
  else next.add(v);
  return next;
};

type Props = {
  filters: Filters;
  onChange: (f: Filters) => void;
  /** Total items in the library (unfiltered). */
  totalCount?: number;
  /** Items remaining after filters applied. */
  filteredCount?: number;
};

const Row = ({ children }: { children: React.ReactNode }) => (
  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
    {children}
  </ScrollView>
);

const Label = ({ children }: { children: string }) => (
  <Text style={styles.label}>{children}</Text>
);

export const FilterBar = ({ filters, onChange, totalCount, filteredCount }: Props) => {
  const active = filtersActive(filters);
  const showCount = typeof totalCount === 'number';
  const isFiltered = showCount && active > 0 && filteredCount !== totalCount;

  return (
    <View style={styles.wrap}>
      <View style={styles.headRow}>
        <View>
          <Text style={styles.head}>filters</Text>
          {showCount && (
            <Text style={styles.count}>
              {isFiltered
                ? `showing ${filteredCount} of ${totalCount}`
                : `${totalCount} screenshot${totalCount === 1 ? '' : 's'}`}
            </Text>
          )}
        </View>
        {active > 0 && (
          <Chip
            label="clear all"
            variant="meta"
            color={colors.inkMuted}
            onPress={() => onChange(emptyFilters())}
          />
        )}
      </View>

      <Label>category</Label>
      <Row>
        {CATEGORIES.map((cat) => {
          const selected = filters.categories.has(cat);
          return (
            <Chip
              key={cat}
              label={cat}
              variant="meta"
              selected={selected}
              color={selected ? colors.ink : colors.inkMuted}
              onPress={() => onChange({ ...filters, categories: toggleSet(filters.categories, cat) })}
            />
          );
        })}
      </Row>

      <Label>urgency</Label>
      <Row>
        {URGENCIES.map((u) => {
          const selected = filters.urgencies.has(u.key);
          return (
            <Chip
              key={u.key}
              label={u.label}
              variant="meta"
              selected={selected}
              color={selected ? urgencyColors[u.key] : colors.inkMuted}
              onPress={() => onChange({ ...filters, urgencies: toggleSet(filters.urgencies, u.key) })}
            />
          );
        })}
      </Row>

      <Label>status</Label>
      <Row>
        {STATUSES.map((s) => {
          const selected = filters.statuses.has(s.key);
          return (
            <Chip
              key={s.key}
              label={s.label}
              variant="meta"
              selected={selected}
              color={selected ? statusColors[s.key] : colors.inkMuted}
              onPress={() => onChange({ ...filters, statuses: toggleSet(filters.statuses, s.key) })}
            />
          );
        })}
      </Row>

      <Label>resonance</Label>
      <Row>
        {RESONANCE_LEVELS.map((r) => {
          const selected = filters.resonances.has(r);
          return (
            <Chip
              key={r}
              label={`level ${r}`}
              variant="meta"
              selected={selected}
              color={selected ? colors.ink : colors.inkMuted}
              onPress={() => onChange({ ...filters, resonances: toggleSet(filters.resonances, r) })}
            />
          );
        })}
      </Row>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  headRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  head: {
    fontSize: 11,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: colors.ink,
  },
  count: {
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.inkMuted,
    marginTop: 2,
  },
  label: {
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: colors.inkMuted,
    marginTop: 12,
    marginBottom: 6,
  },
  row: { gap: 6, paddingRight: 16 },
});

export const applyFilters = <
  T extends {
    category?: string | null;
    urgency?: string | null;
    status?: string | null;
    resonance?: 1 | 2 | 3 | null;
  },
>(
  items: T[],
  f: Filters,
): T[] => {
  if (filtersActive(f) === 0) return items;
  return items.filter((it) => {
    if (f.categories.size > 0 && (!it.category || !f.categories.has(it.category))) return false;
    if (f.urgencies.size > 0 && (!it.urgency || !f.urgencies.has(it.urgency))) return false;
    if (f.statuses.size > 0 && (!it.status || !f.statuses.has(it.status))) return false;
    if (f.resonances.size > 0 && (!it.resonance || !f.resonances.has(it.resonance))) return false;
    return true;
  });
};
