import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Animated, BackHandler, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { CategoryIcon } from './CategoryIcon';
import { Chip } from './Chip';
import { Iris } from './Iris';
import { useReduceMotion } from '@/lib/a11y';
import { statusColors, urgencyColors, type FontSet, type Palette } from '@/lib/colors';
import { emptyFilters, filtersActive, type Filters } from '@/lib/filters';
import { useFilters } from '@/lib/filtersContext';
import { tapHaptic } from '@/lib/haptics';
import { capitalize, CATEGORIES, DIFFICULTIES, RESONANCE_LEVELS, STATUSES, TIMES_TO_COMPLETE, URGENCIES } from '@/lib/options';
import { fetchScreenshots } from '@/lib/screenshots';
import { useColors, useFonts } from '@/lib/themeContext';
import { useSidebarAnimation } from '@/lib/useSidebarAnimation';

type Props = {
  open: boolean;
  onClose: () => void;
  filters: Filters;
  onFiltersChange: (f: Filters) => void;
  onUpload: () => void;
  onPickFromGallery?: () => void;
  onLibrary: () => void;
  onApplyFilters?: () => void;
  onLogo?: () => void;
  onTriage?: () => void;
  onSavedFilters?: () => void;
  onSettings?: () => void;
  onSignOut?: () => void;
  userEmail?: string | null;
};

const toggleSet = <T,>(s: Set<T>, v: T): Set<T> => {
  const next = new Set(s);
  if (next.has(v)) next.delete(v); else next.add(v);
  return next;
};

const FilterSection = ({ label, children }: { label: string; children: React.ReactNode }) => {
  const c = useColors();
  const f = useFonts();
  const s = useMemo(() => makeStyles(c, f), [c, f]);
  return (
    <>
      <Text style={s.label}>{label}</Text>
      <View style={[s.chipWrap, s.row]}>{children}</View>
    </>
  );
};

const FilterPanel = ({ filters, onFiltersChange }: { filters: Filters; onFiltersChange: (f: Filters) => void }) => {
  const c = useColors();
  const f = useFonts();
  const s = useMemo(() => makeStyles(c, f), [c, f]);
  const active = filtersActive(filters);

  return (
    <>
      <View style={s.statusRow}>
        <Text style={s.statusText}>{active === 0 ? 'select filters' : `${active} active`}</Text>
        {active > 0 && (
          <Pressable onPress={() => onFiltersChange(emptyFilters())} hitSlop={6}>
            <Text style={s.clearAll}>clear all</Text>
          </Pressable>
        )}
      </View>

      <FilterSection label="category">
        {CATEGORIES.map((cat) => {
          const selected = filters.categories.has(cat);
          return (
            <Pressable
              key={cat}
              onPress={() => { void tapHaptic(); onFiltersChange({ ...filters, categories: toggleSet(filters.categories, cat) }); }}
              style={[s.iconChip, selected && s.iconChipOn]}
              accessibilityLabel={`Filter by ${cat}`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              <CategoryIcon category={cat} size={18} color={selected ? c.parchment : c.ink} />
              <Text style={[s.iconChipText, { color: selected ? c.parchment : c.ink }]}>{capitalize(cat)}</Text>
            </Pressable>
          );
        })}
      </FilterSection>

      <FilterSection label="urgency">
        {URGENCIES.map((u) => {
          const selected = filters.urgencies.has(u.key);
          return (
            <Chip key={u.key} label={u.label} variant="meta" selected={selected}
              color={selected ? urgencyColors[u.key] : c.inkMuted}
              onPress={() => onFiltersChange({ ...filters, urgencies: toggleSet(filters.urgencies, u.key) })}
            />
          );
        })}
      </FilterSection>

      <FilterSection label="resonance">
        {RESONANCE_LEVELS.map((r) => {
          const selected = filters.resonances.has(r);
          return (
            <Pressable key={r}
              onPress={() => onFiltersChange({ ...filters, resonances: toggleSet(filters.resonances, r) })}
              style={[s.iconChip, selected && s.iconChipOn]}
              accessibilityLabel={`Filter by resonance level ${r}`}
              accessibilityRole="button" accessibilityState={{ selected }}
            >
              <Iris level={r} size={22} color={selected ? c.parchment : c.ink} />
            </Pressable>
          );
        })}
      </FilterSection>

      <FilterSection label="status">
        {STATUSES.map((s_) => {
          const selected = filters.statuses.has(s_.key);
          return (
            <Chip key={s_.key} label={s_.label} variant="meta" selected={selected}
              color={selected ? statusColors[s_.key] : c.inkMuted}
              onPress={() => onFiltersChange({ ...filters, statuses: toggleSet(filters.statuses, s_.key) })}
            />
          );
        })}
      </FilterSection>

      <FilterSection label="difficulty">
        {DIFFICULTIES.map((d) => {
          const selected = filters.difficulties.has(d.key);
          return (
            <Chip key={d.key} label={d.label} variant="meta" selected={selected}
              color={selected ? c.ink : c.inkMuted}
              onPress={() => onFiltersChange({ ...filters, difficulties: toggleSet(filters.difficulties, d.key) })}
            />
          );
        })}
      </FilterSection>

      <FilterSection label="time to complete">
        {TIMES_TO_COMPLETE.map((t) => {
          const selected = filters.timesToComplete.has(t.key);
          return (
            <Chip key={t.key} label={t.label} variant="meta" selected={selected}
              color={selected ? c.ink : c.inkMuted}
              onPress={() => onFiltersChange({ ...filters, timesToComplete: toggleSet(filters.timesToComplete, t.key) })}
            />
          );
        })}
      </FilterSection>
    </>
  );
};

export const Sidebar = ({
  open, onClose, filters, onFiltersChange, onUpload, onPickFromGallery,
  onLibrary, onApplyFilters, onLogo, onTriage, onSavedFilters,
  onSettings, onSignOut, userEmail,
}: Props) => {
  const { searchQuery, setSearchQuery } = useFilters();
  const reduceMotion = useReduceMotion();
  const { width: windowWidth } = useWindowDimensions();
  const SIDEBAR_WIDTH = Math.round(windowWidth * 0.82);
  const [triageCount, setTriageCount] = useState<number | null>(null);
  const c = useColors();
  const f = useFonts();
  const styles = useMemo(() => makeStyles(c, f), [c, f]);

  const { translateX, backdropOpacity } = useSidebarAnimation(open, SIDEBAR_WIDTH, reduceMotion);

  const active = filtersActive(filters);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void fetchScreenshots().then((rows) => {
      if (cancelled) return;
      const count = rows.filter(
        (r) => !r.category ||
          (r.category && (!r.resonance || !r.urgency || !r.status)) ||
          ((r.aiTags?.length ?? 0) > 0 && r.aiReviewed === false),
      ).length;
      setTriageCount(count);
    });
    return () => { cancelled = true; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true; });
    return () => sub.remove();
  }, [open, onClose]);

  return (
    <View
      style={[StyleSheet.absoluteFill, open && { zIndex: 100, elevation: 100 }]}
      pointerEvents={open ? 'auto' : 'box-none'}
    >
      {open && (
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdropOpacity }]}
        />
      )}
      {open && (
        <Pressable onPress={onClose} accessibilityLabel="Close sidebar" style={StyleSheet.absoluteFill} />
      )}

      <GestureDetector
        gesture={Gesture.Pan()
          .activeOffsetX([-15, 1000])
          .failOffsetY([-20, 20])
          .runOnJS(true)
          .onEnd((e) => { if (e.translationX < -40) onClose(); })}
      >
        <Animated.View style={[styles.panel, { width: SIDEBAR_WIDTH, transform: [{ translateX }] }]}>
          <ScrollView
            contentContainerStyle={styles.content}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
          >
            <Pressable
              onPress={onLogo} disabled={!onLogo}
              style={({ pressed }) => [styles.headerRow, pressed && { opacity: 0.7 }]}
              hitSlop={6} accessibilityLabel="Go to home"
              accessibilityRole={onLogo ? 'button' : undefined}
            >
              <Iris level={3} size={32} color={c.ink} />
              <Text style={styles.title}>Overlook</Text>
            </Pressable>
            {userEmail && <Text style={styles.email}>signed in · {userEmail}</Text>}

            <View style={styles.searchRow}>
              <Ionicons name="search-outline" size={16} color={c.inkMuted} />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                onSubmitEditing={() => {
                  const v = searchQuery.trim();
                  if (!v) return;
                  onFiltersChange({ ...filters, tagQueries: new Set([...filters.tagQueries, v]) });
                  setSearchQuery('');
                }}
                returnKeyType="done"
                placeholder="search…"
                placeholderTextColor={c.inkMuted}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.searchInput}
              />
              {searchQuery.length > 0 && (
                <>
                  <Pressable onPress={() => setSearchQuery('')} hitSlop={8} accessibilityLabel="Clear search">
                    <Ionicons name="close" size={16} color={c.inkMuted} />
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      const v = searchQuery.trim();
                      if (!v) return;
                      void tapHaptic();
                      onFiltersChange({ ...filters, tagQueries: new Set([...filters.tagQueries, v]) });
                      setSearchQuery('');
                    }}
                    hitSlop={8}
                    style={({ pressed }) => [styles.searchAddBtn, pressed && { opacity: 0.75 }]}
                    accessibilityLabel="Add as filter"
                  >
                    <Ionicons name="add" size={14} color={c.parchment} />
                    <Text style={styles.searchAddText}>add</Text>
                  </Pressable>
                </>
              )}
            </View>

            {filters.tagQueries.size > 0 && (
              <View style={styles.searchTagsRow}>
                {Array.from(filters.tagQueries).map((q) => (
                  <Chip key={`q-${q}`} label={q} variant="meta" selected color={c.ink}
                    onRemove={() => {
                      const next = new Set(filters.tagQueries);
                      next.delete(q);
                      onFiltersChange({ ...filters, tagQueries: next });
                    }}
                  />
                ))}
              </View>
            )}

            <FilterPanel filters={filters} onFiltersChange={onFiltersChange} />

            <View style={styles.divider} />

            {onTriage && (
              <Pressable onPress={onTriage}
                style={({ pressed }) => [styles.navRow, pressed && styles.navRowPressed]}
                android_ripple={{ color: c.divider }}
              >
                <Ionicons name="swap-vertical-outline" size={18} color={c.inkMuted} />
                <Text style={styles.navLink}>triage</Text>
                {triageCount !== null && triageCount > 0 && (
                  <Text style={styles.navHint}>{triageCount} waiting</Text>
                )}
              </Pressable>
            )}
            {onSavedFilters && (
              <Pressable onPress={onSavedFilters}
                style={({ pressed }) => [styles.navRow, pressed && styles.navRowPressed]}
                android_ripple={{ color: c.divider }}
              >
                <Ionicons name="bookmark-outline" size={18} color={c.inkMuted} />
                <Text style={styles.navLink}>saved filters</Text>
              </Pressable>
            )}

            {active > 0 ? (
              <Pressable onPress={onApplyFilters ?? onLibrary} style={styles.primaryBtn}>
                <Text style={styles.primaryBtnText}>view filtered results</Text>
              </Pressable>
            ) : (
              <Pressable onPress={onUpload} style={styles.primaryBtn}>
                <Text style={styles.primaryBtnText}>upload screenshots</Text>
              </Pressable>
            )}
            {onPickFromGallery && (
              <Pressable onPress={onPickFromGallery} style={styles.secondaryBtn}>
                <Text style={styles.secondaryBtnText}>pick from gallery</Text>
              </Pressable>
            )}
            <Pressable onPress={onLibrary} style={styles.secondaryBtn}>
              <Text style={styles.secondaryBtnText}>view full library</Text>
            </Pressable>

            {onSettings && (
              <Pressable onPress={onSettings} style={styles.signOutRow} hitSlop={8}>
                <Ionicons name="settings-outline" size={16} color={c.inkMuted} />
                <Text style={styles.signOutText}>settings</Text>
              </Pressable>
            )}
            {onSignOut && (
              <Pressable onPress={onSignOut} style={styles.signOutRow} hitSlop={8}>
                <Ionicons name="log-out-outline" size={16} color={c.inkMuted} />
                <Text style={styles.signOutText}>sign out</Text>
              </Pressable>
            )}
          </ScrollView>
        </Animated.View>
      </GestureDetector>

      {open && (
        <GestureDetector gesture={Gesture.Tap().runOnJS(true).onEnd(onClose)}>
          <View
            accessibilityLabel="Close sidebar"
            style={{ position: 'absolute', top: 0, bottom: 0, left: SIDEBAR_WIDTH, right: 0 }}
          />
        </GestureDetector>
      )}
    </View>
  );
};

const makeStyles = (c: Palette, f: FontSet) =>
  StyleSheet.create({
    backdrop: { backgroundColor: 'rgba(0,0,0,1)' },
    panel: {
      position: 'absolute', top: 0, bottom: 0, left: 0,
      backgroundColor: c.parchment,
      borderRightWidth: StyleSheet.hairlineWidth, borderColor: c.divider,
    },
    content: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 60 },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    title: { fontFamily: f.displayMedium, fontSize: 32, color: c.ink, letterSpacing: -0.5 },
    email: {
      fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase', color: c.inkMuted,
      marginTop: 8, paddingBottom: 10, borderBottomWidth: 1, borderColor: c.inkMuted,
    },
    searchRow: {
      flexDirection: 'row', alignItems: 'center', marginTop: 22,
      paddingVertical: 8, paddingHorizontal: 10, gap: 8,
      borderWidth: StyleSheet.hairlineWidth, borderStyle: 'dashed',
      borderColor: c.ink, borderRadius: 4,
    },
    searchInput: { flex: 1, fontSize: 14, color: c.ink, padding: 0 },
    searchAddBtn: {
      paddingHorizontal: 10, paddingVertical: 6, borderRadius: 3,
      backgroundColor: c.ink, alignItems: 'center', justifyContent: 'center',
      flexDirection: 'row', gap: 4,
    },
    searchAddText: {
      color: c.parchment, fontSize: 11, letterSpacing: 1.2,
      textTransform: 'uppercase', fontWeight: '600',
    },
    searchTagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
    statusRow: {
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      marginTop: 28, marginBottom: 6,
    },
    statusText: { fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', color: c.inkMuted },
    clearAll: {
      fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase',
      color: c.inkMuted, textDecorationLine: 'underline',
    },
    label: {
      fontSize: 10, letterSpacing: 1.4, textTransform: 'uppercase',
      color: c.inkMuted, marginTop: 18, marginBottom: 6,
    },
    row: { flexWrap: 'wrap', gap: 4, rowGap: 6 },
    chipWrap: { flexDirection: 'row' },
    divider: { marginTop: 22, marginBottom: 6, borderTopWidth: 1, borderColor: c.inkMuted },
    iconChip: {
      flexDirection: 'row', alignItems: 'center', gap: 4,
      paddingHorizontal: 7, paddingVertical: 5, borderRadius: 3,
      borderWidth: 1, borderColor: c.inkMuted, minHeight: 28,
    },
    iconChipOn: { backgroundColor: c.ink, borderColor: c.ink },
    iconChipText: { fontSize: 12, letterSpacing: 0.2, textTransform: 'capitalize' },
    navRow: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingVertical: 12, paddingHorizontal: 4, marginHorizontal: -4, borderRadius: 4,
    },
    navRowPressed: { backgroundColor: c.divider, opacity: 0.7 },
    navLink: { fontSize: 14, color: c.ink, flex: 1 },
    navHint: { fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase', color: c.inkMuted },
    primaryBtn: {
      backgroundColor: c.ink, paddingVertical: 9, borderRadius: 4,
      alignItems: 'center', marginTop: 12,
    },
    primaryBtnText: {
      color: c.parchment, fontSize: 12, letterSpacing: 1.2,
      textTransform: 'uppercase', fontWeight: '600',
    },
    secondaryBtn: {
      borderWidth: 1, borderColor: c.ink, paddingVertical: 9,
      borderRadius: 4, alignItems: 'center', marginTop: 6,
    },
    secondaryBtnText: {
      color: c.ink, fontSize: 12, letterSpacing: 1.2,
      textTransform: 'uppercase', fontWeight: '600',
    },
    signOutRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 22, paddingVertical: 8 },
    signOutText: { fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', color: c.inkMuted },
  });
