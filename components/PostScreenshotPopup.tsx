import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CategoryIcon } from './CategoryIcon';
import { Chip } from './Chip';
import { Iris } from './Iris';
import { useToast } from './Toast';
import { tapHaptic } from '@/lib/haptics';
import { analyzeAndPersist, isAnalyzeConfigured } from '@/lib/analyze';
import { enqueueAnalysis } from '@/lib/analysisQueue';
import { urgencyColors, type Palette } from '@/lib/colors';
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
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);

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
      if (urgency) patch.urgency = urgency;
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
          <View style={[styles.scroll, { paddingBottom: 16 }]}>
            <View style={styles.previewWrap}>
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

              <Pressable
                onPress={() => handle('analyze')}
                disabled={busy || !isAnalyzeConfigured}
                style={[styles.primary, !isAnalyzeConfigured && { opacity: 0.4 }]}
              >
                <Ionicons name="sparkles" size={16} color={c.parchment} />
                <Text style={styles.primaryText}>{busy ? '…' : 'analyze & add'}</Text>
              </Pressable>

              <View style={styles.linkRow}>
                <Pressable onPress={() => handle('no-ai')} disabled={busy} hitSlop={8}>
                  <Text style={styles.link}>add without AI</Text>
                </Pressable>
                <Text style={styles.sep}>·</Text>
                <Pressable onPress={() => handle('dismiss')} disabled={busy} hitSlop={8}>
                  <Text style={styles.link}>dismiss</Text>
                </Pressable>
              </View>
            </View>
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
    scroll: { padding: 20, paddingBottom: 16, gap: 0, flex: 1 },
    previewWrap: {
      flex: 1,
      width: '100%',
      minHeight: 200,
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
      borderWidth: 1,
      borderStyle: 'dashed',
      borderColor: c.inkMuted,
      borderRadius: 4,
    },
    primary: {
      marginTop: 16,
      backgroundColor: c.ink,
      paddingVertical: 14,
      borderRadius: 4,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    primaryText: {
      color: c.parchment,
      fontSize: 14,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      fontWeight: '600',
    },
    linkRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 12,
      marginTop: 14,
    },
    link: {
      fontSize: 13,
      color: c.inkMuted,
      textDecorationLine: 'underline',
      letterSpacing: 0.4,
    },
    sep: { color: c.divider, fontSize: 13 },
  });
