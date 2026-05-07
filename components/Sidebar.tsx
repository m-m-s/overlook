import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, Dimensions, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Chip } from './Chip';
import { Iris } from './Iris';
import { colors, statusColors, urgencyColors } from '@/lib/colors';
import { emptyFilters, filtersActive, type Filters } from '@/lib/filters';
import { useFilters } from '@/lib/filtersContext';
import { CATEGORIES, RESONANCE_LEVELS, STATUSES, URGENCIES } from '@/lib/options';

const SCREEN = Dimensions.get('window');
const SIDEBAR_WIDTH = Math.round(SCREEN.width * 0.82);

type Props = {
  open: boolean;
  onClose: () => void;
  filters: Filters;
  onFiltersChange: (f: Filters) => void;
  onUpload: () => void;
  onLibrary: () => void;
  onTriage?: () => void;
  onSavedFilters?: () => void;
  onSignOut?: () => void;
  userEmail?: string | null;
};

const toggleSet = <T,>(s: Set<T>, v: T): Set<T> => {
  const next = new Set(s);
  if (next.has(v)) next.delete(v);
  else next.add(v);
  return next;
};

/**
 * Primary nav per spec: swipe-from-left or tap-edge-bar opens. Hosts the
 * filter selector + nav buttons (upload, view library, triage, saved
 * filters). Closing returns to whatever screen was open.
 */
export const Sidebar = ({
  open,
  onClose,
  filters,
  onFiltersChange,
  onUpload,
  onLibrary,
  onTriage,
  onSavedFilters,
  onSignOut,
  userEmail,
}: Props) => {
  const { searchQuery, setSearchQuery } = useFilters();
  const translateX = useRef(new Animated.Value(-SIDEBAR_WIDTH)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateX, {
        toValue: open ? 0 : -SIDEBAR_WIDTH,
        duration: 240,
        useNativeDriver: true,
      }),
      Animated.timing(backdropOpacity, {
        toValue: open ? 0.45 : 0,
        duration: 240,
        useNativeDriver: true,
      }),
    ]).start();
  }, [open, translateX, backdropOpacity]);

  const active = filtersActive(filters);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={open ? 'auto' : 'box-none'}>
      {/* Backdrop — only intercepts taps when open */}
      {open && (
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdropOpacity }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>
      )}

      <Animated.View style={[styles.panel, { transform: [{ translateX }] }]}>
        <ScrollView contentContainerStyle={styles.content}>
          {/* Logo / title */}
          <View style={styles.headerRow}>
            <Iris level={3} size={28} color={colors.ink} />
            <Text style={styles.title}>Overlook</Text>
          </View>
          {userEmail && <Text style={styles.email}>{userEmail}</Text>}

          {/* Search bar — fuzzy across subject, tags, category, status, notes */}
          <View style={styles.searchRow}>
            <Ionicons name="search-outline" size={16} color={colors.inkMuted} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="search…"
              placeholderTextColor={colors.inkMuted}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.searchInput}
            />
            {searchQuery.length > 0 && (
              <Pressable onPress={() => setSearchQuery('')} hitSlop={8}>
                <Ionicons name="close-circle" size={16} color={colors.inkMuted} />
              </Pressable>
            )}
          </View>

          {/* Filter status */}
          <View style={styles.statusRow}>
            <Text style={styles.statusText}>
              {active === 0 ? 'select filters' : `${active} active`}
            </Text>
            {active > 0 && (
              <Pressable onPress={() => onFiltersChange(emptyFilters())} hitSlop={6}>
                <Text style={styles.clearAll}>clear all</Text>
              </Pressable>
            )}
          </View>

          {/* Urgency (per spec: higher than status) */}
          <Text style={styles.label}>urgency</Text>
          <View style={[styles.chipWrap, styles.row]}>
            {URGENCIES.map((u) => {
              const selected = filters.urgencies.has(u.key);
              return (
                <Chip
                  key={u.key}
                  label={u.label}
                  variant="meta"
                  selected={selected}
                  color={selected ? urgencyColors[u.key] : colors.inkMuted}
                  onPress={() => onFiltersChange({ ...filters, urgencies: toggleSet(filters.urgencies, u.key) })}
                />
              );
            })}
          </View>

          {/* Status */}
          <Text style={styles.label}>status</Text>
          <View style={[styles.chipWrap, styles.row]}>
            {STATUSES.map((s) => {
              const selected = filters.statuses.has(s.key);
              return (
                <Chip
                  key={s.key}
                  label={s.label}
                  variant="meta"
                  selected={selected}
                  color={selected ? statusColors[s.key] : colors.inkMuted}
                  onPress={() => onFiltersChange({ ...filters, statuses: toggleSet(filters.statuses, s.key) })}
                />
              );
            })}
          </View>

          {/* Category */}
          <Text style={styles.label}>category</Text>
          <View style={[styles.chipWrap, styles.row]}>
            {CATEGORIES.map((cat) => {
              const selected = filters.categories.has(cat);
              return (
                <Chip
                  key={cat}
                  label={cat}
                  variant="meta"
                  selected={selected}
                  color={selected ? colors.ink : colors.inkMuted}
                  onPress={() => onFiltersChange({ ...filters, categories: toggleSet(filters.categories, cat) })}
                />
              );
            })}
          </View>

          {/* Resonance */}
          <Text style={styles.label}>resonance</Text>
          <View style={[styles.chipWrap, styles.row]}>
            {RESONANCE_LEVELS.map((r) => {
              const selected = filters.resonances.has(r);
              return (
                <Chip
                  key={r}
                  label={`level ${r}`}
                  variant="meta"
                  selected={selected}
                  color={selected ? colors.ink : colors.inkMuted}
                  onPress={() => onFiltersChange({ ...filters, resonances: toggleSet(filters.resonances, r) })}
                />
              );
            })}
          </View>

          <View style={styles.divider} />

          {/* Nav links */}
          {onTriage && (
            <Pressable onPress={onTriage} style={styles.navRow}>
              <Ionicons name="swap-vertical-outline" size={18} color={colors.inkMuted} />
              <Text style={styles.navLink}>triage</Text>
              <Text style={styles.navHint}>(coming soon)</Text>
            </Pressable>
          )}
          {onSavedFilters && (
            <Pressable onPress={onSavedFilters} style={styles.navRow}>
              <Ionicons name="bookmark-outline" size={18} color={colors.inkMuted} />
              <Text style={styles.navLink}>saved filters</Text>
              <Text style={styles.navHint}>(coming soon)</Text>
            </Pressable>
          )}

          {/* Primary CTAs */}
          <Pressable onPress={onUpload} style={styles.primaryBtn}>
            <Text style={styles.primaryBtnText}>upload screenshots</Text>
          </Pressable>
          <Pressable onPress={onLibrary} style={styles.secondaryBtn}>
            <Text style={styles.secondaryBtnText}>view full library</Text>
          </Pressable>

          {onSignOut && (
            <Pressable onPress={onSignOut} style={styles.signOutRow} hitSlop={8}>
              <Ionicons name="log-out-outline" size={16} color={colors.inkMuted} />
              <Text style={styles.signOutText}>sign out</Text>
            </Pressable>
          )}
        </ScrollView>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,1)' },
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: SIDEBAR_WIDTH,
    backgroundColor: colors.parchment,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: colors.divider,
  },
  content: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 60 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontFamily: 'Georgia', fontSize: 28, color: colors.ink, letterSpacing: -0.4 },
  email: { fontSize: 11, color: colors.inkMuted, marginTop: 4 },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 22,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.inkMuted,
    borderRadius: 4,
  },
  searchInput: { flex: 1, fontSize: 14, color: colors.ink, padding: 0 },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 28,
    marginBottom: 6,
  },
  statusText: {
    fontSize: 11,
    letterSpacing: 1.6,
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
  label: {
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.inkMuted,
    marginTop: 18,
    marginBottom: 6,
  },
  row: { flexWrap: 'wrap', gap: 6, rowGap: 8 },
  chipWrap: { flexDirection: 'row' },
  divider: {
    marginTop: 22,
    marginBottom: 6,
    borderTopWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.divider,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
  },
  navLink: { fontSize: 14, color: colors.ink, flex: 1 },
  navHint: { fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.inkMuted },
  primaryBtn: {
    backgroundColor: colors.ink,
    paddingVertical: 14,
    borderRadius: 4,
    alignItems: 'center',
    marginTop: 14,
  },
  primaryBtnText: {
    color: colors.parchment,
    fontSize: 13,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: colors.ink,
    paddingVertical: 14,
    borderRadius: 4,
    alignItems: 'center',
    marginTop: 8,
  },
  secondaryBtnText: {
    color: colors.ink,
    fontSize: 13,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  signOutRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 22, paddingVertical: 8 },
  signOutText: { fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', color: colors.inkMuted },
});
