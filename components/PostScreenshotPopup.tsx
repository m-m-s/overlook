import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CategoryIcon } from './CategoryIcon';
import { Chip } from './Chip';
import { Iris } from './Iris';
import { useToast } from './Toast';
import { tapHaptic } from '@/lib/haptics';
import { analyzeAndPersist, isAnalyzeConfigured } from '@/lib/analyze';
import { enqueueAnalysis } from '@/lib/analysisQueue';
import { urgencyColors, type Palette } from '@/lib/colors';
import { computeUrgencyDate } from '@/lib/urgency';
import { fingerprintAsset } from '@/lib/mediaLibrary';
import { capitalize, CATEGORIES, RESONANCE_LEVELS, URGENCIES } from '@/lib/options';
import { useScreenshotWatcher } from '@/lib/screenshotWatcher';
import { updateScreenshot } from '@/lib/screenshots';
import { buildTagFromValue } from '@/lib/tagDictionary';
import { useColors } from '@/lib/themeContext';
import { uploadScreenshot } from '@/lib/uploads';

/**
 * Per CLAUDE.md "Post-screenshot popup":
 * - Image preview
 * - Resonance iris chips
 * - Urgency chips
 * - Quick tag text input
 * - Three buttons: Analyze & Add / Add without AI / Dismiss
 *
 * Auto-presents whenever the watcher's queue has an item; auto-dismisses when
 * the queue empties.
 */
export const PostScreenshotPopup = () => {
  const toast = useToast();
  const { next, consume } = useScreenshotWatcher();
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const imageHeight = Math.round(screenHeight * 0.28);

  const [resonance, setResonance] = useState<1 | 2 | 3 | null>(null);
  const [urgency, setUrgency] = useState<string | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [quickTag, setQuickTag] = useState('');
  const [busy, setBusy] = useState(false);

  // Reset transient state whenever a new asset arrives.
  useEffect(() => {
    setResonance(null);
    setUrgency(null);
    setCategories([]);
    setQuickTag('');
    setBusy(false);
  }, [next?.id]);

  const handle = async (mode: 'analyze' | 'no-ai' | 'dismiss') => {
    if (!next) return;
    tapHaptic();
    if (mode === 'dismiss') {
      consume();
      return;
    }
    setBusy(true);
    try {
      const fp = fingerprintAsset(next);
      const fileCreatedAt = new Date(next.creationTime).toISOString();
      const local = await uploadScreenshot(next.uri, {
        fileHash: fp,
        fileCreatedAt,
        deviceAssetId: next.id,
      });

      const patch: Record<string, unknown> = {};
      if (resonance) patch.resonance = resonance;
      if (urgency) {
        patch.urgency = urgency;
        patch.urgency_date = computeUrgencyDate(urgency);
      }
      if (categories.length > 0) {
        patch.categories = categories;
        patch.category = categories[0];
      }
      if (Object.keys(patch).length > 0) {
        await updateScreenshot(local.id, patch as Parameters<typeof updateScreenshot>[1]);
      }
      if (quickTag.trim()) {
        const tag = await buildTagFromValue(quickTag.trim());
        const t = 'ambiguous' in tag ? { value: tag.value } : tag;
        await updateScreenshot(local.id, { manual_typed_tags: [t] } as Parameters<typeof updateScreenshot>[1]);
      }

      if (mode === 'analyze' && isAnalyzeConfigured) {
        void analyzeAndPersist(next.uri, local.id, next.id).then((patch) => {
          if (!patch) void enqueueAnalysis(local.id, next.uri, next.id);
        });
      }

      toast.show(mode === 'analyze' ? 'Added — analyzing' : 'Added');
      consume();
    } catch (err) {
      console.warn('[post-screenshot] failed', err);
      toast.error('Upload failed.');
      setBusy(false);
    }
  };

  return (
    <Modal
      visible={!!next}
      animationType="slide"
      onRequestClose={() => handle('dismiss')}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={[styles.fullscreen, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12 }]}
      >
        {next && (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={{ paddingBottom: 24 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={[styles.previewWrap, { height: imageHeight }]}>
              <Image source={{ uri: next.uri }} style={styles.preview} contentFit="contain" />
            </View>

              <Text style={styles.label}>category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {CATEGORIES.map((cat) => {
                  const active = categories.includes(cat);
                  return (
                    <Chip
                      key={cat}
                      label={capitalize(cat)}
                      variant="meta"
                      selected={active}
                      color={active ? c.ink : c.inkMuted}
                      onPress={() =>
                        setCategories((prev) =>
                          prev.includes(cat) ? prev.filter((x) => x !== cat) : [...prev, cat],
                        )
                      }
                      leading={
                        <CategoryIcon
                          category={cat}
                          size={14}
                          color={active ? c.parchment : c.inkMuted}
                        />
                      }
                    />
                  );
                })}
              </ScrollView>

              <Text style={styles.label}>resonance</Text>
              <View style={styles.row}>
                {RESONANCE_LEVELS.map((r) => {
                  const active = resonance === r;
                  return (
                    <Pressable
                      key={r}
                      onPress={() => {
                        tapHaptic();
                        setResonance(active ? null : r);
                      }}
                      style={[styles.irisBtn, active && styles.irisBtnActive]}
                    >
                      <Iris level={r} size={22} color={c.ink} filled={active} />
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.label}>urgency</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {URGENCIES.map((u) => {
                  const active = urgency === u.key;
                  return (
                    <Chip
                      key={u.key}
                      label={u.label}
                      variant="meta"
                      selected={active}
                      color={active ? urgencyColors[u.key] : c.inkMuted}
                      onPress={() => setUrgency(active ? null : u.key)}
                    />
                  );
                })}
              </ScrollView>

              <Text style={styles.label}>quick tag (optional)</Text>
              <TextInput
                value={quickTag}
                onChangeText={setQuickTag}
                placeholder="e.g. Anton, gift idea"
                placeholderTextColor={c.inkMuted}
                autoCapitalize="none"
                style={styles.tagInput}
              />

              <View style={styles.btnRow}>
                <Pressable
                  onPress={() => handle('analyze')}
                  disabled={busy || !isAnalyzeConfigured}
                  style={({ pressed }) => [styles.primary, !isAnalyzeConfigured && { opacity: 0.4 }, pressed && { opacity: 0.75 }]}
                >
                  <Ionicons name="sparkles" size={15} color={c.parchment} />
                  <Text style={styles.primaryText}>{busy ? '…' : 'analyze & add'}</Text>
                </Pressable>
                <Pressable
                  onPress={() => handle('no-ai')}
                  disabled={busy}
                  style={({ pressed }) => [styles.secondary, pressed && { opacity: 0.75 }]}
                >
                  <Text style={styles.secondaryText}>add</Text>
                </Pressable>
              </View>
              <Pressable onPress={() => handle('dismiss')} disabled={busy} hitSlop={8} style={({ pressed }) => [styles.dismissRow, pressed && { opacity: 0.75 }]}>
                <Text style={styles.dismissText}>dismiss</Text>
              </Pressable>
          </ScrollView>
          )}
      </KeyboardAvoidingView>
    </Modal>
  );
};

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    fullscreen: {
      flex: 1,
      backgroundColor: c.parchment,
    },
    scroll: { padding: 20 },
    previewWrap: {
      width: '100%',
      backgroundColor: c.parchment,
      marginBottom: 4,
    },
    preview: { width: '100%', height: '100%' },
    label: {
      fontSize: 11,
      letterSpacing: 1.4,
      textTransform: 'uppercase',
      color: c.inkMuted,
      marginTop: 12,
      marginBottom: 6,
    },
    row: { flexDirection: 'row', gap: 8 },
    irisBtn: {
      width: 44,
      height: 44,
      borderWidth: 1,
      borderColor: c.ink,
      borderRadius: 4,
      alignItems: 'center',
      justifyContent: 'center',
    },
    irisBtnActive: { borderWidth: 2 },
    chips: { flexDirection: 'row', gap: 6, paddingRight: 16 },
    tagInput: {
      fontSize: 14,
      color: c.ink,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderStyle: 'dashed',
      borderColor: c.ink,
      borderRadius: 4,
    },
    btnRow: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 16,
    },
    primary: {
      flex: 2,
      backgroundColor: c.ink,
      paddingVertical: 13,
      borderRadius: 4,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
    },
    primaryText: {
      color: c.parchment,
      fontSize: 13,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      fontWeight: '600',
    },
    secondary: {
      flex: 1,
      borderWidth: 1,
      borderColor: c.ink,
      paddingVertical: 13,
      borderRadius: 4,
      alignItems: 'center',
      justifyContent: 'center',
    },
    secondaryText: {
      color: c.ink,
      fontSize: 13,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      fontWeight: '600',
    },
    dismissRow: {
      alignItems: 'center',
      paddingVertical: 12,
    },
    dismissText: {
      fontSize: 12,
      color: c.inkMuted,
      textDecorationLine: 'underline',
      letterSpacing: 0.4,
    },
  });
