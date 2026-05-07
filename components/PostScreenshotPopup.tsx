import { Ionicons } from '@expo/vector-icons';
import { BottomSheetBackdrop, BottomSheetModal, type BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { Image } from 'expo-image';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Chip } from './Chip';
import { Iris } from './Iris';
import { useToast } from './Toast';
import { analyzeAndPersist, isAnalyzeConfigured } from '@/lib/analyze';
import { enqueueAnalysis } from '@/lib/analysisQueue';
import { colors, urgencyColors } from '@/lib/colors';
import { fingerprintAsset } from '@/lib/mediaLibrary';
import { RESONANCE_LEVELS, URGENCIES } from '@/lib/options';
import { useScreenshotWatcher } from '@/lib/screenshotWatcher';
import { updateScreenshot } from '@/lib/screenshots';
import { buildTagFromValue } from '@/lib/tagDictionary';
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
  const ref = useRef<BottomSheetModal>(null);
  const snapPoints = useMemo(() => ['72%'], []);

  const [resonance, setResonance] = useState<1 | 2 | 3 | null>(null);
  const [urgency, setUrgency] = useState<string | null>(null);
  const [quickTag, setQuickTag] = useState('');
  const [busy, setBusy] = useState(false);

  // Reset transient state whenever a new asset arrives.
  useEffect(() => {
    setResonance(null);
    setUrgency(null);
    setQuickTag('');
    setBusy(false);
  }, [next?.id]);

  // Auto-present / dismiss based on queue.
  useEffect(() => {
    if (next) ref.current?.present();
    else ref.current?.dismiss();
  }, [next]);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.4} />
    ),
    [],
  );

  if (!next) {
    // Empty placeholder so the ref exists. BottomSheetModal needs children.
    return (
      <BottomSheetModal ref={ref} snapPoints={snapPoints} backdropComponent={renderBackdrop}>
        <View />
      </BottomSheetModal>
    );
  }

  const handle = async (mode: 'analyze' | 'no-ai' | 'dismiss') => {
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

      // Apply user picks (resonance / urgency) + optional quick tag.
      const patch: Record<string, unknown> = {};
      if (resonance) patch.resonance = resonance;
      if (urgency) patch.urgency = urgency;
      if (Object.keys(patch).length > 0) {
        await updateScreenshot(local.id, patch as Parameters<typeof updateScreenshot>[1]);
      }
      if (quickTag.trim()) {
        const tag = await buildTagFromValue(quickTag.trim());
        const t = 'ambiguous' in tag ? { value: tag.value } : tag;
        await updateScreenshot(local.id, { manual_typed_tags: [t] } as Parameters<typeof updateScreenshot>[1]);
      }

      if (mode === 'analyze' && isAnalyzeConfigured) {
        // Fire-and-forget; if it fails, queue for offline retry.
        void analyzeAndPersist(next.uri, local.id, next.id).then((patch) => {
          if (!patch) void enqueueAnalysis(local.id, next.uri, next.id);
        });
      }

      toast.show(mode === 'analyze' ? 'added — analyzing' : 'added');
      consume();
    } catch (err) {
      console.warn('[post-screenshot] failed', err);
      toast.error('upload failed');
      setBusy(false);
    }
  };

  return (
    <BottomSheetModal
      ref={ref}
      snapPoints={snapPoints}
      backdropComponent={renderBackdrop}
      backgroundStyle={{ backgroundColor: colors.parchment }}
      handleIndicatorStyle={{ backgroundColor: colors.inkMuted }}
      enablePanDownToClose={false}
    >
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.previewWrap}>
          <Image source={{ uri: next.uri }} style={styles.preview} contentFit="contain" />
        </View>

        <Text style={styles.label}>resonance</Text>
        <View style={styles.row}>
          {RESONANCE_LEVELS.map((r) => {
            const active = resonance === r;
            return (
              <Pressable
                key={r}
                onPress={() => setResonance(active ? null : r)}
                style={[styles.irisBtn, active && styles.irisBtnActive]}
              >
                <Iris level={r} size={22} color={active ? colors.parchment : colors.ink} />
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
                color={active ? urgencyColors[u.key] : colors.inkMuted}
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
          placeholderTextColor={colors.inkMuted}
          autoCapitalize="none"
          style={styles.tagInput}
        />

        <View style={styles.actions}>
          <Pressable
            onPress={() => handle('dismiss')}
            disabled={busy}
            style={[styles.btn, styles.btnGhost]}
          >
            <Text style={styles.btnGhostText}>dismiss</Text>
          </Pressable>
          <Pressable
            onPress={() => handle('no-ai')}
            disabled={busy}
            style={[styles.btn, styles.btnSecondary]}
          >
            <Text style={styles.btnSecondaryText}>add without AI</Text>
          </Pressable>
          <Pressable
            onPress={() => handle('analyze')}
            disabled={busy || !isAnalyzeConfigured}
            style={[styles.btn, styles.btnPrimary, !isAnalyzeConfigured && { opacity: 0.4 }]}
          >
            <Ionicons name="sparkles" size={14} color={colors.parchment} />
            <Text style={styles.btnPrimaryText}>{busy ? '…' : 'analyze & add'}</Text>
          </Pressable>
        </View>
      </ScrollView>
    </BottomSheetModal>
  );
};

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 24, gap: 4 },
  previewWrap: {
    width: '100%',
    height: 280,
    backgroundColor: colors.divider,
    marginBottom: 4,
  },
  preview: { width: '100%', height: '100%' },
  label: {
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.inkMuted,
    marginTop: 16,
    marginBottom: 8,
  },
  row: { flexDirection: 'row', gap: 8 },
  irisBtn: {
    width: 44,
    height: 44,
    borderWidth: 1,
    borderColor: colors.ink,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  irisBtnActive: { backgroundColor: colors.ink },
  chips: { flexDirection: 'row', gap: 6, paddingRight: 16 },
  tagInput: {
    fontSize: 14,
    color: colors.ink,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.inkMuted,
    borderRadius: 4,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 18,
  },
  btn: { flex: 1, paddingVertical: 14, alignItems: 'center', borderRadius: 4, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  btnPrimary: { backgroundColor: colors.ink, flex: 1.4 },
  btnPrimaryText: {
    color: colors.parchment,
    fontSize: 12,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  btnSecondary: { borderWidth: 1, borderColor: colors.ink },
  btnSecondaryText: {
    color: colors.ink,
    fontSize: 12,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  btnGhost: {},
  btnGhostText: {
    color: colors.inkMuted,
    fontSize: 12,
    letterSpacing: 1.3,
    textTransform: 'uppercase',
  },
});
