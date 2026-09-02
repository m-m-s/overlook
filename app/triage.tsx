import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useMemo } from 'react';
import {
  Animated, BackHandler, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CategoryIcon } from '@/components/CategoryIcon';
import { Chip } from '@/components/Chip';
import { GhostHint } from '@/components/GhostHint';
import { Iris } from '@/components/Iris';
import { TriageQueues } from '@/components/TriageQueues';
import { isAnalyzeConfigured } from '@/lib/analyze';
import { statusColors, urgencyColors, type FontSet, type Palette } from '@/lib/colors';
import { computeUrgencyDate } from '@/lib/urgency';
import { useColors, useFonts } from '@/lib/themeContext';
import { tapHaptic } from '@/lib/haptics';
import { capitalize, CATEGORIES, RESONANCE_LEVELS, STATUSES, URGENCIES } from '@/lib/options';
import { useTriageQueue } from '@/lib/useTriageQueue';

export default function TriageScreen() {
  const c = useColors();
  const f = useFonts();
  const styles = useMemo(() => makeStyles(c, f), [c, f]);
  const insets = useSafeAreaInsets();

  const {
    session, items, loading, activeQueue, cursor, analyzing,
    tagInput, setTagInput, showActionsHint, setShowActionsHint,
    counts, current, total,
    enterQueue, exitQueue, patchCurrent, toggleCategory,
    onDelete, onSave, onSkip, onAnalyze, onCommitTag,
    cardSwipe, cardOpacity, cardSlide,
  } = useTriageQueue();

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (activeQueue) { exitQueue(); return true; }
      return false;
    });
    return () => sub.remove();
  }, [activeQueue]);

  if (!session) return null;

  if (loading) {
    return (
      <View style={[styles.center, { flex: 1 }]}>
        <Iris level={3} size={36} color={c.ink} spinning />
      </View>
    );
  }

  if (!activeQueue) {
    return (
      <TriageQueues
        counts={counts}
        totalItems={items.length}
        onEnterQueue={enterQueue}
        onBack={() => router.back()}
      />
    );
  }

  if (!current) {
    return (
      <View style={[styles.center, { flex: 1 }]}>
        <Text style={styles.title}>Nothing here</Text>
        <Pressable
          onPress={exitQueue}
          style={({ pressed }) => [styles.btn, styles.btnPrimary, { marginTop: 18 }, pressed && { opacity: 0.75 }]}
        >
          <Text style={styles.btnPrimaryText}>back to triage</Text>
        </Pressable>
      </View>
    );
  }

  const currentCats = current.categories?.length
    ? current.categories
    : current.category ? [current.category] : [];

  return (
    <View style={styles.container}>
      <View style={styles.swipeHeader}>
        <Pressable onPress={exitQueue} hitSlop={12} style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.75 }]}>
          <Ionicons name="close" size={22} color={c.ink} />
        </Pressable>
        <Text style={styles.swipeProgress}>{cursor + 1} / {total}</Text>
        <Pressable
          onPress={() => setShowActionsHint(true)}
          hitSlop={12}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.75 }]}
          accessibilityLabel="Show triage hints"
        >
          <Ionicons name="help-circle-outline" size={22} color={c.inkMuted} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Animated.View style={{ opacity: cardOpacity, transform: [{ translateX: cardSlide }] }}>
          <GestureDetector gesture={cardSwipe}>
            <Image source={{ uri: current.uri }} style={styles.image} contentFit="contain" />
          </GestureDetector>

          {(current.aiTags?.length ?? 0) === 0 && !current.localOnly && isAnalyzeConfigured && (
            <View style={styles.fieldRow}>
              <Pressable
                onPress={onAnalyze}
                disabled={analyzing}
                style={({ pressed }) => [styles.analyzeBtn, analyzing && { opacity: 0.5 }, pressed && !analyzing && { opacity: 0.75 }]}
                accessibilityState={{ busy: analyzing }}
              >
                {analyzing ? (
                  <Iris level={3} size={16} color={c.parchment} spinning />
                ) : (
                  <Ionicons name="sparkles" size={14} color={c.parchment} />
                )}
                <Text style={styles.analyzeBtnText}>{analyzing ? 'Analyzing…' : 'Analyze with AI'}</Text>
              </Pressable>
            </View>
          )}

          {activeQueue === 'untagged' && (
            <FieldRow label="category">
              {CATEGORIES.map((cat) => {
                const active = currentCats.includes(cat);
                return (
                  <Chip
                    key={cat}
                    label={capitalize(cat)}
                    variant="meta"
                    selected={active}
                    color={active ? c.ink : c.inkMuted}
                    onPress={() => toggleCategory(cat)}
                    leading={<CategoryIcon category={cat} size={14} color={active ? c.parchment : c.inkMuted} />}
                  />
                );
              })}
            </FieldRow>
          )}

          {activeQueue === 'untagged' && (
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>add tag</Text>
              <View style={styles.tagInputRow}>
                <TextInput
                  value={tagInput}
                  onChangeText={setTagInput}
                  onSubmitEditing={onCommitTag}
                  placeholder="e.g. Anton, gift idea"
                  placeholderTextColor={c.inkMuted}
                  autoCapitalize="none"
                  returnKeyType="done"
                  style={styles.tagInput}
                />
                <Pressable
                  onPress={onCommitTag}
                  disabled={!tagInput.trim()}
                  style={[styles.tagAddBtn, !tagInput.trim() && { opacity: 0.4 }]}
                >
                  <Text style={styles.tagAddBtnText}>add</Text>
                </Pressable>
              </View>
              {(current.manualTags?.length ?? 0) > 0 && (
                <View style={[styles.chips, { marginTop: 8 }]}>
                  {current.manualTags!.map((t, i) => (
                    <Chip key={`${t.value}-${i}`} label={t.value} variant="manual" selected color={c.ink} />
                  ))}
                </View>
              )}
            </View>
          )}

          {(activeQueue === 'untagged' || activeQueue === 'incomplete' ||
            activeQueue === 'incomplete-resonance' || activeQueue === 'ai-unreviewed') && (
            <FieldRow label="resonance">
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {RESONANCE_LEVELS.map((r) => {
                  const active = current.resonance === r;
                  return (
                    <Pressable
                      key={r}
                      onPress={() => { tapHaptic(); void patchCurrent({ resonance: active ? null : r }); }}
                      style={({ pressed }) => [styles.irisBtn, active && styles.irisBtnActive, pressed && { opacity: 0.75 }]}
                    >
                      <Iris level={r} size={22} color={c.ink} filled={active} />
                    </Pressable>
                  );
                })}
              </View>
            </FieldRow>
          )}

          {(activeQueue === 'overdue' || activeQueue === 'untagged' || activeQueue === 'incomplete' ||
            activeQueue === 'incomplete-urgency' || activeQueue === 'ai-unreviewed') && (
            <FieldRow label="urgency">
              {URGENCIES.map((u) => {
                const active = current.urgency === u.key;
                return (
                  <Chip
                    key={u.key}
                    label={u.label}
                    variant="meta"
                    selected={active}
                    color={active ? (urgencyColors[u.key] ?? c.ink) : c.inkMuted}
                    onPress={() => {
                      const next = active ? null : u.key;
                      void patchCurrent({ urgency: next, urgencyDate: next ? computeUrgencyDate(next) : null });
                    }}
                  />
                );
              })}
            </FieldRow>
          )}

          {(activeQueue === 'untagged' || activeQueue === 'incomplete' ||
            activeQueue === 'incomplete-status') && (
            <FieldRow label="status">
              {STATUSES.map((s) => {
                const active = current.status === s.key;
                return (
                  <Chip
                    key={s.key}
                    label={s.label}
                    variant="meta"
                    selected={active}
                    color={active ? (statusColors[s.key] ?? c.ink) : c.inkMuted}
                    onPress={() => void patchCurrent({ status: active ? null : s.key })}
                  />
                );
              })}
            </FieldRow>
          )}
        </Animated.View>
      </ScrollView>

      <View style={[styles.actions, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable onPress={onDelete} style={({ pressed }) => [styles.actionBtn, styles.deleteBtn, pressed && { opacity: 0.75 }]}>
          <Ionicons name="trash-outline" size={18} color="#C0392B" />
          <Text style={[styles.actionText, { color: '#C0392B' }]}>Delete</Text>
        </Pressable>
        <Pressable onPress={onSkip} style={({ pressed }) => [styles.actionBtn, styles.skipBtn, pressed && { opacity: 0.75 }]}>
          <Ionicons name="arrow-forward" size={18} color={c.inkMuted} />
          <Text style={[styles.actionText, { color: c.inkMuted }]}>Skip</Text>
        </Pressable>
        <Pressable onPress={onSave} style={({ pressed }) => [styles.actionBtn, styles.saveBtn, pressed && { opacity: 0.75 }]}>
          <Ionicons name="checkmark" size={18} color={c.parchment} />
          <Text style={[styles.actionText, { color: c.parchment }]}>Save</Text>
        </Pressable>
      </View>

      <GhostHint
        visible={showActionsHint}
        variant="triage-actions"
        label="Tap Save · Skip · Delete"
        topOffset="35%"
        onDismiss={() => setShowActionsHint(false)}
      />
    </View>
  );
}

const FieldRow = ({ label, children }: { label: string; children: React.ReactNode }) => {
  const c = useColors();
  const f = useFonts();
  const styles = useMemo(() => makeStyles(c, f), [c, f]);
  return (
    <View style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {children}
      </ScrollView>
    </View>
  );
};

const makeStyles = (c: Palette, f: FontSet) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: c.parchment },
    center: { alignItems: 'center', justifyContent: 'center', backgroundColor: c.parchment },
    swipeHeader: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingTop: 56, paddingHorizontal: 20, paddingBottom: 8,
    },
    swipeProgress: { fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', color: c.inkMuted },
    backBtn: { padding: 4 },
    title: { fontFamily: f.displayMedium, fontSize: 26, color: c.ink, letterSpacing: -0.4 },
    image: { width: '100%', height: 380, backgroundColor: c.parchment, marginVertical: 12 },
    fieldRow: { paddingHorizontal: 20, paddingVertical: 10 },
    fieldLabel: {
      fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase',
      color: c.inkMuted, marginBottom: 8,
    },
    chips: { flexDirection: 'row', gap: 6 },
    irisBtn: {
      width: 44, height: 44, borderWidth: 1, borderColor: c.ink,
      borderRadius: 4, alignItems: 'center', justifyContent: 'center',
    },
    irisBtnActive: { borderWidth: 2 },
    analyzeBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      alignSelf: 'flex-start', gap: 6, paddingVertical: 10, paddingHorizontal: 14,
      backgroundColor: c.ink, borderRadius: 4,
    },
    analyzeBtnText: {
      color: c.parchment, fontSize: 13, letterSpacing: 0.8,
      textTransform: 'uppercase', fontWeight: '600',
    },
    tagInputRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    tagInput: {
      flex: 1, fontSize: 14, color: c.ink, paddingVertical: 10, paddingHorizontal: 12,
      borderWidth: StyleSheet.hairlineWidth, borderStyle: 'dashed',
      borderColor: c.ink, borderRadius: 4,
    },
    tagAddBtn: { paddingVertical: 10, paddingHorizontal: 14, backgroundColor: c.ink, borderRadius: 4 },
    tagAddBtnText: {
      color: c.parchment, fontSize: 12, letterSpacing: 1.0,
      textTransform: 'uppercase', fontWeight: '600',
    },
    actions: {
      flexDirection: 'row', gap: 8, paddingHorizontal: 20,
      paddingTop: 12, paddingBottom: 24,
      borderTopWidth: StyleSheet.hairlineWidth, borderColor: c.divider,
    },
    actionBtn: {
      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
      paddingVertical: 14, borderRadius: 4, gap: 6,
    },
    deleteBtn: { borderWidth: 1, borderColor: '#C0392B' },
    skipBtn: { borderWidth: 1, borderColor: c.inkMuted },
    saveBtn: { backgroundColor: c.ink },
    actionText: { fontSize: 12, letterSpacing: 1.4, textTransform: 'uppercase', fontWeight: '600' },
    btn: { paddingHorizontal: 24, paddingVertical: 14, borderRadius: 4 },
    btnPrimary: { backgroundColor: c.ink },
    btnPrimaryText: { color: c.parchment, fontSize: 13, letterSpacing: 1.5, textTransform: 'uppercase', fontWeight: '600' },
  });
