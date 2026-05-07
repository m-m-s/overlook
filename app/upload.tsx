import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { useToast } from '@/components/Toast';
import { analyzeAndPersist, isAnalyzeConfigured } from '@/lib/analyze';
import { useSession } from '@/lib/auth';
import { colors } from '@/lib/colors';
import {
  fingerprintAsset,
  findScreenshotsAlbum,
  requestMediaPermission,
  scanAssets,
  type ScannedAsset,
} from '@/lib/mediaLibrary';
import { fetchExistingFingerprints, uploadScreenshot } from '@/lib/uploads';

type Phase = 'idle' | 'scanning' | 'review' | 'processing' | 'done';

type ReviewState = 'include' | 'exclude' | 'duplicate';

const BATCH_OPTIONS = [25, 50, 100, 250, 500] as const;

export default function UploadScreen() {
  const { session } = useSession();
  const toast = useToast();

  const [phase, setPhase] = useState<Phase>('idle');
  const [scanProgress, setScanProgress] = useState(0);
  const [allAssets, setAllAssets] = useState<ScannedAsset[]>([]);
  const [duplicates, setDuplicates] = useState<Set<string>>(new Set()); // asset IDs already uploaded
  const [stateMap, setStateMap] = useState<Map<string, ReviewState>>(new Map());
  const [batchSize, setBatchSize] = useState<number>(50);
  const [analyzeWithAI, setAnalyzeWithAI] = useState(false);

  // Processing state
  const [doneCount, setDoneCount] = useState(0);
  const [failCount, setFailCount] = useState(0);
  const [totalToProcess, setTotalToProcess] = useState(0);

  const newAssets = useMemo(
    () => allAssets.filter((a) => !duplicates.has(a.id)),
    [allAssets, duplicates],
  );

  const reviewBatch = useMemo(
    () => newAssets.slice(0, batchSize),
    [newAssets, batchSize],
  );

  const includedCount = useMemo(
    () =>
      reviewBatch.filter((a) => (stateMap.get(a.id) ?? 'include') === 'include').length,
    [reviewBatch, stateMap],
  );

  // Auto-trigger scan on entry if signed in.
  useEffect(() => {
    if (phase !== 'idle' || !session) return;
    void runScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, phase]);

  const runScan = async () => {
    setPhase('scanning');
    setScanProgress(0);

    const granted = await requestMediaPermission();
    if (!granted) {
      Alert.alert(
        'Photo permission needed',
        'Overlook needs permission to read your photo library so it can find screenshots.',
      );
      setPhase('idle');
      return;
    }

    try {
      const album = await findScreenshotsAlbum();
      const assets = await scanAssets(album, (n) => setScanProgress(n));
      setAllAssets(assets);

      // Compare against already-imported fingerprints
      const existing = await fetchExistingFingerprints();
      const dups = new Set<string>();
      for (const a of assets) {
        if (existing.has(fingerprintAsset(a))) dups.add(a.id);
      }
      setDuplicates(dups);
      setStateMap(new Map());
      setPhase('review');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`scan failed: ${msg.slice(0, 100)}`);
      setPhase('idle');
    }
  };

  const cycleState = (id: string) => {
    setStateMap((prev) => {
      const next = new Map(prev);
      const cur = next.get(id) ?? 'include';
      // include → exclude → include
      next.set(id, cur === 'include' ? 'exclude' : 'include');
      return next;
    });
  };

  const startProcessing = (analyze: boolean) => {
    const toUpload = reviewBatch.filter((a) => (stateMap.get(a.id) ?? 'include') === 'include');
    if (toUpload.length === 0) {
      toast.info('nothing selected to process');
      return;
    }
    setAnalyzeWithAI(analyze);
    setTotalToProcess(toUpload.length);
    setDoneCount(0);
    setFailCount(0);
    setPhase('processing');
    void runProcessing(toUpload, analyze);
  };

  const runProcessing = async (assets: ScannedAsset[], analyze: boolean) => {
    for (const asset of assets) {
      try {
        const fp = fingerprintAsset(asset);
        const fileCreatedAt = new Date(asset.creationTime).toISOString();
        const local = await uploadScreenshot(asset.uri, {
          fileHash: fp,
          fileCreatedAt,
          deviceAssetId: asset.id,
        });
        if (analyze && isAnalyzeConfigured) {
          await analyzeAndPersist(asset.uri, local.id);
        }
        setDoneCount((c) => c + 1);
      } catch (err) {
        console.warn('[upload]', err);
        setFailCount((c) => c + 1);
      }
    }
    setPhase('done');
  };

  // ---- RENDER ----

  if (!session) {
    return (
      <View style={[styles.center, { flex: 1, padding: 32 }]}>
        <Text style={styles.h1}>Bulk upload</Text>
        <Text style={styles.body}>Sign in to import screenshots from your library.</Text>
      </View>
    );
  }

  if (phase === 'idle' || phase === 'scanning') {
    return (
      <View style={[styles.center, { flex: 1, padding: 32 }]}>
        <BackButton />
        <Text style={styles.h1}>scanning library</Text>
        <ActivityIndicator color={colors.ink} size="small" style={{ marginTop: 16 }} />
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>found</Text>
          <Text style={styles.statValue}>{scanProgress}</Text>
        </View>
      </View>
    );
  }

  if (phase === 'review') {
    return (
      <View style={{ flex: 1 }}>
        <View style={styles.reviewHeader}>
          <BackButton />
          <Text style={styles.h2}>{newAssets.length} new of {allAssets.length}</Text>
          <Text style={styles.subtle}>
            {duplicates.size > 0 ? `${duplicates.size} already imported` : ''}
          </Text>
        </View>

        {/* Batch size picker — stepped per spec rather than free-slider */}
        <View style={styles.batchBox}>
          <Text style={styles.batchTitle}>batch size</Text>
          <Text style={styles.batchValue}>{Math.min(batchSize, newAssets.length)}</Text>
          <Text style={styles.batchSub}>screenshots per batch</Text>
          <View style={styles.batchSteps}>
            {BATCH_OPTIONS.map((n) => (
              <Pressable
                key={n}
                onPress={() => setBatchSize(n)}
                style={[styles.batchStep, batchSize === n && styles.batchStepOn]}
              >
                <Text style={[styles.batchStepText, batchSize === n && styles.batchStepTextOn]}>
                  {n}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* 4-col review grid: default = include (full color); tap = exclude (X overlay) */}
        <FlatList
          style={{ flex: 1 }}
          data={reviewBatch}
          keyExtractor={(a) => a.id}
          numColumns={4}
          columnWrapperStyle={{ gap: 2 }}
          ItemSeparatorComponent={() => <View style={{ height: 2 }} />}
          renderItem={({ item }) => {
            const state = stateMap.get(item.id) ?? 'include';
            return (
              <Pressable onPress={() => cycleState(item.id)} style={styles.reviewCell}>
                <Image source={{ uri: item.uri }} style={styles.reviewImg} contentFit="cover" />
                {state === 'exclude' && (
                  <View style={styles.reviewOverlay}>
                    <Ionicons name="close" size={28} color={colors.parchment} />
                  </View>
                )}
              </Pressable>
            );
          }}
          ListFooterComponent={<View style={{ height: 200 }} />}
        />

        <View style={styles.reviewFooter}>
          <Text style={styles.footerCount}>{includedCount} selected</Text>
          <View style={styles.footerBtnRow}>
            <Pressable
              onPress={() => startProcessing(false)}
              style={[styles.btn, styles.btnSecondary]}
            >
              <Text style={styles.btnSecondaryText}>add without AI</Text>
            </Pressable>
            <Pressable
              onPress={() => startProcessing(true)}
              style={[styles.btn, styles.btnPrimary, !isAnalyzeConfigured && { opacity: 0.4 }]}
              disabled={!isAnalyzeConfigured}
            >
              <Text style={styles.btnPrimaryText}>analyze with AI</Text>
            </Pressable>
          </View>
        </View>
      </View>
    );
  }

  if (phase === 'processing') {
    const pct = totalToProcess > 0 ? ((doneCount + failCount) / totalToProcess) * 100 : 0;
    return (
      <View style={[styles.center, { flex: 1, padding: 32 }]}>
        <Text style={styles.h2}>processing</Text>
        <Text style={styles.subtle}>{analyzeWithAI ? 'with AI tagging' : 'no AI tagging'}</Text>

        <View style={styles.statRow}>
          <Text style={styles.statLabel}>processed</Text>
          <Text style={styles.statValue}>
            {doneCount + failCount} / {totalToProcess}
          </Text>
        </View>
        {failCount > 0 && (
          <View style={styles.statRow}>
            <Text style={[styles.statLabel, { color: '#C0392B' }]}>failed</Text>
            <Text style={[styles.statValue, { color: '#C0392B' }]}>{failCount}</Text>
          </View>
        )}

        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${pct}%` }]} />
        </View>

        <Text style={styles.subtleSmall}>you can leave this screen &mdash; it&apos;ll keep going</Text>
      </View>
    );
  }

  // 'done'
  return (
    <View style={[styles.center, { flex: 1, padding: 32 }]}>
      <Text style={styles.h2}>imported {doneCount}</Text>
      {failCount > 0 && <Text style={styles.subtle}>{failCount} failed</Text>}
      <Pressable
        onPress={() => router.replace('/')}
        style={[styles.btn, styles.btnPrimary, { marginTop: 24 }]}
      >
        <Text style={styles.btnPrimaryText}>back to library</Text>
      </Pressable>
      {newAssets.length > batchSize && (
        <Pressable
          onPress={() => setPhase('review')}
          style={[styles.btn, styles.btnSecondary, { marginTop: 12 }]}
        >
          <Text style={styles.btnSecondaryText}>review next batch</Text>
        </Pressable>
      )}
    </View>
  );
}

const BackButton = () => (
  <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={12}>
    <Ionicons name="arrow-back" size={22} color={colors.ink} />
  </Pressable>
);

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.parchment },
  backBtn: { position: 'absolute', top: 56, left: 20, zIndex: 5, padding: 4 },

  h1: { fontFamily: 'Georgia', fontSize: 32, color: colors.ink, letterSpacing: -0.4 },
  h2: { fontFamily: 'Georgia', fontSize: 26, color: colors.ink, letterSpacing: -0.4 },
  body: { fontSize: 14, color: colors.ink, marginTop: 12, textAlign: 'center' },
  subtle: { fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', color: colors.inkMuted, marginTop: 6 },
  subtleSmall: { fontSize: 11, color: colors.inkMuted, marginTop: 24, fontStyle: 'italic' },

  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    width: '100%',
    maxWidth: 320,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.divider,
    marginTop: 18,
  },
  statLabel: { fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', color: colors.inkMuted },
  statValue: { fontFamily: 'Georgia', fontSize: 28, color: colors.ink },

  reviewHeader: {
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 12,
    backgroundColor: colors.parchment,
  },

  batchBox: {
    marginHorizontal: 20,
    marginBottom: 12,
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: colors.ink,
    borderRadius: 12,
    alignItems: 'center',
  },
  batchTitle: {
    fontSize: 11,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: colors.inkMuted,
  },
  batchValue: {
    fontFamily: 'Georgia',
    fontSize: 32,
    color: colors.ink,
    marginTop: 2,
  },
  batchSub: {
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.inkMuted,
    marginBottom: 10,
  },
  batchSteps: { flexDirection: 'row', gap: 6 },
  batchStep: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 3,
    borderWidth: 1,
    borderColor: colors.divider,
  },
  batchStepOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  batchStepText: { fontSize: 12, color: colors.inkMuted },
  batchStepTextOn: { color: colors.parchment, fontWeight: '600' },

  reviewCell: { flex: 1 / 4, aspectRatio: 1, backgroundColor: colors.divider },
  reviewImg: { width: '100%', height: '100%' },
  reviewOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  reviewFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.parchment,
    paddingTop: 12,
    paddingBottom: 24,
    paddingHorizontal: 20,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: colors.divider,
  },
  footerCount: {
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.inkMuted,
    marginBottom: 10,
    textAlign: 'center',
  },
  footerBtnRow: { flexDirection: 'row', gap: 10 },

  btn: { flex: 1, paddingVertical: 14, alignItems: 'center', borderRadius: 4 },
  btnPrimary: { backgroundColor: colors.ink },
  btnPrimaryText: {
    color: colors.parchment,
    fontSize: 13,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontWeight: '600',
  },
  btnSecondary: { borderWidth: 1, borderColor: colors.ink },
  btnSecondaryText: {
    color: colors.ink,
    fontSize: 13,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontWeight: '600',
  },

  progressTrack: {
    marginTop: 24,
    width: '100%',
    maxWidth: 320,
    height: 4,
    backgroundColor: colors.divider,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: colors.ink },
});
