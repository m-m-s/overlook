import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Iris } from '@/components/Iris';
import { useToast } from '@/components/Toast';
import { analyzeAndPersist, isAnalyzeConfigured } from '@/lib/analyze';
import { enqueueAnalysis } from '@/lib/analysisQueue';
import { getBatchState, setBatchState } from '@/lib/batchState';
import { setDemoMode } from '@/lib/demoMode';
import { useSession } from '@/lib/auth';
import type { FontSet, Palette } from '@/lib/colors';
import { useColors, useFonts } from '@/lib/themeContext';
import {
  fingerprintAsset,
  findScreenshotsAlbum,
  requestMediaPermission,
  scanAssets,
  type ScannedAsset,
} from '@/lib/mediaLibrary';
import { fetchExistingFingerprints, uploadScreenshot } from '@/lib/uploads';

type Phase = 'idle' | 'scanning' | 'pick-batch' | 'review' | 'processing' | 'done';

type ReviewState = 'include' | 'no-ai' | 'exclude' | 'duplicate';

const BATCH_OPTIONS = [25, 50, 100, 250, 500] as const;
const BATCH_KEY = 'overlook.upload_batch_size';

// Module-level flag: is a runProcessing loop currently alive in this JS
// session? Survives across re-mounts of UploadScreen but is reset by app
// reload (because the JS context is fresh). Lets us tell the difference
// between "user navigated away and is observing" (flag = true) vs "app
// reloaded mid-batch and the loop is dead" (flag = false → resume).
let activelyProcessing = false;

export default function UploadScreen() {
  const { session } = useSession();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const c = useColors();
  const f = useFonts();
  const styles = useMemo(() => makeStyles(c, f), [c, f]);

  const [phase, setPhase] = useState<Phase>('idle');
  const [scanProgress, setScanProgress] = useState(0);
  const [allAssets, setAllAssets] = useState<ScannedAsset[]>([]);
  const [duplicates, setDuplicates] = useState<Set<string>>(new Set()); // asset IDs already uploaded
  const [stateMap, setStateMap] = useState<Map<string, ReviewState>>(new Map());
  const [batchSize, setBatchSizeState] = useState<number>(50);
  const setBatchSize = (n: number) => {
    setBatchSizeState(n);
    AsyncStorage.setItem(BATCH_KEY, String(n)).catch(() => {});
  };
  const [analyzeWithAI, setAnalyzeWithAI] = useState(false);

  // Processing state
  const [doneCount, setDoneCount] = useState(0);
  const [failCount, setFailCount] = useState(0);
  const [totalToProcess, setTotalToProcess] = useState(0);
  const pausedRef = useRef(false);
  const [paused, setPaused] = useState(false);
  const stoppedRef = useRef(false);
  const failedAssetsRef = useRef<ScannedAsset[]>([]);
  // Re-entry guard: prevents the auto-scan effect from firing two parallel
  // runScan loops when the user navigates fast or remounts mid-flight.
  const scanInflightRef = useRef(false);
  const [hasFailures, setHasFailures] = useState(false);

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
      reviewBatch.filter((a) => {
        const s = stateMap.get(a.id) ?? 'include';
        return s === 'include' || s === 'no-ai';
      }).length,
    [reviewBatch, stateMap],
  );

  const setAllReviewState = (state: ReviewState) => {
    setStateMap(() => {
      const next = new Map<string, ReviewState>();
      for (const a of reviewBatch) next.set(a.id, state);
      return next;
    });
  };

  // Restore last-used batch size
  useEffect(() => {
    AsyncStorage.getItem(BATCH_KEY).then((v) => {
      if (!v) return;
      const n = parseInt(v, 10);
      if ((BATCH_OPTIONS as readonly number[]).includes(n)) setBatchSizeState(n);
    });
  }, []);

  // Auto-trigger scan on entry if signed in. If a batch is already in
  // progress AND that loop is still alive in this JS session, observe it.
  // If the loop is dead (app reload mid-batch), re-scan and resume the
  // remainder so the user doesn't get stranded with stale progress.
  // Re-entry guard: if the effect fires twice quickly (e.g. fast
  // navigation), the second invocation bails because phase is no longer
  // 'idle' by then. The ref-based double-check prevents a race where two
  // simultaneous async branches both reach setPhase before either completes.
  useEffect(() => {
    if (phase !== 'idle' || !session) return;
    if (scanInflightRef.current) return;
    scanInflightRef.current = true;
    void (async () => {
      const existing = await getBatchState();
      if (existing && existing.processed < existing.total) {
        if (activelyProcessing) {
          setTotalToProcess(existing.total);
          setDoneCount(existing.processed);
          setPhase('processing');
          scanInflightRef.current = false;
          return;
        }
        // Stale state — fall through to runScan, which will detect batch
        // state and auto-resume processing the remaining items.
      }
      try {
        await runScan();
      } finally {
        scanInflightRef.current = false;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, phase]);

  // While observing the processing screen, poll batchState so the counts
  // stay in sync with the running async loop (which may live in another
  // mount of this component, or has finished).
  useEffect(() => {
    if (phase !== 'processing') return;
    const id = setInterval(async () => {
      const s = await getBatchState();
      if (s) {
        setDoneCount(s.processed);
        setTotalToProcess(s.total);
      } else {
        // Batch cleared — processing finished. Move to done so we don't
        // hang on the processing screen forever.
        setPhase('done');
      }
    }, 1500);
    return () => clearInterval(id);
  }, [phase]);

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
      // If a batch is already in progress (banner-tap to resume), skip BOTH
      // pick-batch AND review and go straight to the processing screen with
      // the remaining unimported assets queued up. Matches the user's mental
      // model of "I was processing — bring me back to processing."
      const resuming = await getBatchState();
      if (resuming && resuming.processed < resuming.total) {
        const remainingAssets = assets.filter((a) => !dups.has(a.id));
        if (remainingAssets.length > 0) {
          const queue = remainingAssets.map((asset) => ({ asset, analyze: true }));
          setAnalyzeWithAI(true);
          setTotalToProcess(queue.length);
          setDoneCount(0);
          setFailCount(0);
          setPhase('processing');
          void runProcessing(queue);
          return;
        }
      }
      setPhase('pick-batch');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Scan failed: ${msg.slice(0, 100)}`);
      setPhase('idle');
    }
  };

  const cycleState = (id: string) => {
    setStateMap((prev) => {
      const next = new Map(prev);
      const cur = next.get(id) ?? 'include';
      // include → no-ai → exclude → include  (per spec 3 review states)
      const order: ReviewState[] = ['include', 'no-ai', 'exclude'];
      const idx = order.indexOf(cur);
      next.set(id, order[(idx + 1) % order.length]);
      return next;
    });
  };

  const startProcessing = (defaultAnalyze: boolean) => {
    // Build the work queue: items with state 'include' run with defaultAnalyze;
    // items with state 'no-ai' upload but skip AI regardless; 'exclude' is dropped.
    const queue: { asset: ScannedAsset; analyze: boolean }[] = [];
    for (const a of reviewBatch) {
      const s = stateMap.get(a.id) ?? 'include';
      if (s === 'exclude') continue;
      queue.push({ asset: a, analyze: s === 'no-ai' ? false : defaultAnalyze });
    }
    if (queue.length === 0) {
      toast.info('Nothing selected to process.');
      return;
    }
    setAnalyzeWithAI(defaultAnalyze);
    setTotalToProcess(queue.length);
    setDoneCount(0);
    setFailCount(0);
    setPhase('processing');
    void setBatchState({ total: queue.length, processed: 0, startedAt: Date.now() });
    // Turn off demo mode the moment real uploads begin — otherwise the demo
    // dataset hides the real rows fetchScreenshots returns.
    void setDemoMode(false);
    void runProcessing(queue);
  };

  const runProcessing = async (queue: { asset: ScannedAsset; analyze: boolean }[]) => {
    activelyProcessing = true;
    let processed = 0;
    const total = queue.length;
    const startedAt = Date.now();
    failedAssetsRef.current = [];
    setHasFailures(false);
    stoppedRef.current = false;
    for (const { asset, analyze } of queue) {
      if (stoppedRef.current) break;
      // Pause loop: if user pressed pause, wait until unpaused (or stopped).
      while (pausedRef.current && !stoppedRef.current) {
        await new Promise((r) => setTimeout(r, 300));
      }
      if (stoppedRef.current) break;
      try {
        const fp = fingerprintAsset(asset);
        const fileCreatedAt = new Date(asset.creationTime).toISOString();
        const local = await uploadScreenshot(asset.uri, {
          fileHash: fp,
          fileCreatedAt,
          deviceAssetId: asset.id,
        });
        if (analyze && isAnalyzeConfigured) {
          const patch = await analyzeAndPersist(asset.uri, local.id, asset.id);
          if (!patch) {
            // AI analysis failed BUT the upload succeeded — the row is in
            // Supabase, just missing AI tags. Queue for background retry.
            // Do NOT add to failedAssetsRef: the "retry failed" button is
            // for re-uploading, and we don't want a duplicate row.
            await enqueueAnalysis(local.id, asset.uri, asset.id);
          }
        }
        setDoneCount((c) => c + 1);
      } catch (err) {
        // Actual upload failure — row never landed. Safe to re-upload via
        // the retry button.
        console.warn('[upload]', err);
        setFailCount((c) => c + 1);
        failedAssetsRef.current.push(asset);
        setHasFailures(true);
      } finally {
        processed++;
        void setBatchState({ total, processed, startedAt });
      }
    }
    activelyProcessing = false;
    void setBatchState(null);
    setPhase('done');
  };

  const onRetryFailed = () => {
    const failed = failedAssetsRef.current;
    if (failed.length === 0) return;
    failedAssetsRef.current = [];
    setHasFailures(false);
    const queue = failed.map((asset) => ({ asset, analyze: true }));
    setAnalyzeWithAI(true);
    setTotalToProcess(queue.length);
    setDoneCount(0);
    setFailCount(0);
    setPhase('processing');
    void runProcessing(queue);
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
        <PageHeader title="" onBack={() => router.replace('/')} />
        <View style={{ marginBottom: 16 }}>
          <Iris level={3} size={56} color={c.ink} spinning />
        </View>
        <Text style={styles.h1}>scanning library</Text>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>found</Text>
          <Text style={styles.statValue}>{scanProgress}</Text>
        </View>
        <Text style={styles.batteryHint}>
          Large libraries can take a minute. Plug in if you have thousands of screenshots.
        </Text>

        {/* Explicit cancel — easier to find than the back arrow alone. */}
        <Pressable
          onPress={() => router.replace('/')}
          hitSlop={8}
          style={{ marginTop: 32 }}
        >
          <Text style={styles.cancelLink}>cancel scan</Text>
        </Pressable>
      </View>
    );
  }

  // SCREEN 1 — Gallery scan results + batch size picker. Per spec.
  if (phase === 'pick-batch') {
    return (
      <View style={{ flex: 1, backgroundColor: c.parchment }}>
        <PageHeader title="Bulk upload" onBack={() => router.back()} />

        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>new</Text>
            <Text style={styles.statValue}>{newAssets.length}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>already imported</Text>
            <Text style={styles.statValue}>{duplicates.size}</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>total in album</Text>
            <Text style={styles.statValue}>{allAssets.length}</Text>
          </View>

          {/* Batch slider — discrete-stop slider with dot notches per spec */}
          <View style={styles.batchBox}>
            <Text style={styles.batchTitle}>batch size</Text>
            <Text style={styles.batchValue}>{Math.min(batchSize, newAssets.length)}</Text>
            <Text style={styles.batchSub}>screenshots per batch</Text>
            <BatchSlider value={batchSize} onChange={setBatchSize} options={BATCH_OPTIONS} />
          </View>

          <Text style={styles.batteryHint}>
            Larger batches = longer to process. Plug in for batches over 100.
          </Text>

          <View style={{ marginTop: 32, gap: 10 }}>
            <Pressable
              onPress={() => setPhase('review')}
              style={({ pressed }) => [styles.btn, styles.btnPrimary, pressed && { opacity: 0.85 }]}
              disabled={newAssets.length === 0}
            >
              <Text style={styles.btnPrimaryText}>review batch</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                // Process all included by default, with AI
                setStateMap(new Map());
                setTimeout(() => startProcessing(true), 0);
              }}
              style={({ pressed }) => [
                styles.btn,
                styles.btnSecondary,
                (!isAnalyzeConfigured || newAssets.length === 0) && { opacity: 0.4 },
                pressed && { opacity: 0.85 },
              ]}
              disabled={!isAnalyzeConfigured || newAssets.length === 0}
            >
              <Text style={styles.btnSecondaryText}>process all without review</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                setStateMap(new Map());
                setTimeout(() => startProcessing(false), 0);
              }}
              style={({ pressed }) => [
                styles.btn,
                styles.btnGhost,
                newAssets.length === 0 && { opacity: 0.4 },
                pressed && { opacity: 0.85 },
              ]}
              disabled={newAssets.length === 0}
            >
              <Text style={styles.btnGhostText}>add all without AI</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    );
  }

  // SCREEN 2 — Per-card review grid (4-col, 3 states per spec).
  if (phase === 'review') {
    return (
      <View style={{ flex: 1, backgroundColor: c.parchment }}>
        <PageHeader
          title="Review batch"
          subtitle={
            includedCount > 0
              ? `${includedCount} ready · ${reviewBatch.length - includedCount} excluded`
              : 'pick what to import'
          }
          onBack={() => setPhase('pick-batch')}
        />

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
                {state === 'no-ai' && (
                  <View style={[styles.reviewOverlay, { backgroundColor: 'rgba(0,0,0,0.35)' }]}>
                    <Ionicons name="pricetag-outline" size={26} color={c.parchment} />
                  </View>
                )}
                {state === 'exclude' && (
                  <View style={styles.reviewOverlay}>
                    <Ionicons name="close" size={28} color={c.parchment} />
                  </View>
                )}
              </Pressable>
            );
          }}
          ListFooterComponent={<View style={{ height: 200 }} />}
        />

        <View style={[styles.reviewFooter, { paddingBottom: insets.bottom + 24 }]}>
          <View style={styles.selectAllRow}>
            <Pressable onPress={() => setAllReviewState('include')} hitSlop={6}>
              <Text style={styles.selectAllLink}>select all</Text>
            </Pressable>
            <Text style={styles.selectAllSep}>·</Text>
            <Pressable onPress={() => setAllReviewState('exclude')} hitSlop={6}>
              <Text style={styles.selectAllLink}>deselect all</Text>
            </Pressable>
            <Text style={styles.selectAllSep}>·</Text>
            <Pressable onPress={() => setAllReviewState('no-ai')} hitSlop={6}>
              <Text style={styles.selectAllLink}>all → no AI</Text>
            </Pressable>
          </View>
          {(() => {
            const aiCount = reviewBatch.filter((a) => (stateMap.get(a.id) ?? 'include') === 'include').length;
            const noAiCount = reviewBatch.filter((a) => stateMap.get(a.id) === 'no-ai').length;
            const total = aiCount + noAiCount;
            const summary =
              total === 0
                ? 'tap a card to cycle: include → no AI → exclude'
                : noAiCount === 0
                  ? `${aiCount} with AI`
                  : aiCount === 0
                    ? `${noAiCount} without AI`
                    : `${aiCount} with AI · ${noAiCount} without`;
            return (
              <>
                <Text style={styles.footerCount}>{summary}</Text>
                <View style={styles.footerBtnRow}>
                  <Pressable
                    onPress={() => startProcessing(true)}
                    style={({ pressed }) => [
                      styles.btn,
                      styles.btnPrimary,
                      total === 0 && { opacity: 0.4 },
                      pressed && { opacity: 0.85 },
                    ]}
                    disabled={total === 0}
                  >
                    <Text style={styles.btnPrimaryText}>
                      process {total > 0 ? total : ''}
                    </Text>
                  </Pressable>
                </View>
              </>
            );
          })()}
        </View>
      </View>
    );
  }

  if (phase === 'processing') {
    const remaining = Math.max(0, totalToProcess - doneCount - failCount);
    const pct = totalToProcess > 0 ? ((doneCount + failCount) / totalToProcess) * 100 : 0;
    return (
      <View style={[styles.center, { flex: 1, padding: 32 }]}>
        {/* Back to home — processing keeps running in the background per
            "you can leave this screen — it'll keep going" hint below. */}
        <Pressable
          onPress={() => router.replace('/')}
          hitSlop={12}
          style={{ position: 'absolute', top: 56, left: 20, padding: 4 }}
          accessibilityLabel="Back to home"
        >
          <Ionicons name="arrow-back" size={22} color={c.ink} />
        </Pressable>

        {/* Iris spins while running, freezes when paused for clear feedback. */}
        <View style={{ marginBottom: 16, opacity: paused ? 0.4 : 1 }}>
          <Iris level={3} size={56} color={c.ink} spinning={!paused} />
        </View>
        <Text style={styles.h2}>{paused ? 'paused' : 'processing'}</Text>
        <Text style={styles.subtle}>{analyzeWithAI ? 'with AI tagging' : 'no AI tagging'}</Text>

        <View style={styles.statRow}>
          <Text style={styles.statLabel}>total</Text>
          <Text style={styles.statValue}>{totalToProcess}</Text>
        </View>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>processed</Text>
          <Text style={styles.statValue}>{doneCount}</Text>
        </View>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>remaining</Text>
          <Text style={styles.statValue}>{remaining}</Text>
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

        {/* Big primary pause/resume button — single tap, prominent. */}
        <Pressable
          onPress={() => {
            const next = !paused;
            pausedRef.current = next;
            setPaused(next);
          }}
          style={({ pressed }) => [
            styles.pauseBtn,
            paused && styles.pauseBtnResume,
            pressed && { opacity: 0.85 },
          ]}
          accessibilityLabel={paused ? 'Resume processing' : 'Pause processing'}
        >
          <Ionicons
            name={paused ? 'play' : 'pause'}
            size={22}
            color={paused ? c.parchment : c.ink}
            style={{ marginRight: 8 }}
          />
          <Text style={[styles.pauseBtnText, paused && styles.pauseBtnTextOn]}>
            {paused ? 'resume' : 'pause'}
          </Text>
        </Pressable>

        {/* Stop only appears while paused — avoids accidental aborts mid-batch. */}
        {paused && (
          <Pressable
            onPress={() => {
              Alert.alert(
                'Stop processing?',
                `${remaining} screenshot${remaining === 1 ? '' : 's'} won't be processed. You can re-scan later to pick up where you left off.`,
                [
                  { text: 'Keep paused', style: 'cancel' },
                  {
                    text: 'Stop',
                    style: 'destructive',
                    onPress: () => {
                      stoppedRef.current = true;
                      pausedRef.current = false;
                      setPaused(false);
                    },
                  },
                ],
              );
            }}
            hitSlop={8}
            style={{ marginTop: 14 }}
          >
            <Text style={styles.stopLink}>stop and exit</Text>
          </Pressable>
        )}

        {!paused && (
          <Text style={styles.subtleSmall}>You can leave this screen &mdash; it&apos;ll keep going</Text>
        )}
      </View>
    );
  }

  // 'done'
  return (
    <View style={[styles.center, { flex: 1, padding: 32 }]}>
      <Text style={styles.h2}>imported {doneCount}</Text>
      {failCount > 0 && <Text style={styles.subtle}>{failCount} failed</Text>}
      {hasFailures && failedAssetsRef.current.length > 0 && (
        <Pressable
          onPress={onRetryFailed}
          style={[styles.btn, styles.btnSecondary, styles.doneBtn]}
        >
          <Text style={styles.btnSecondaryText}>
            retry {failedAssetsRef.current.length} failed
          </Text>
        </Pressable>
      )}
      <Pressable
        onPress={() => router.replace('/')}
        style={[styles.btn, styles.btnPrimary, styles.doneBtn]}
      >
        <Text style={styles.btnPrimaryText}>back to library</Text>
      </Pressable>
      {newAssets.length > batchSize && (
        <Pressable
          onPress={() => setPhase('review')}
          style={[styles.btn, styles.btnSecondary, styles.doneBtn]}
        >
          <Text style={styles.btnSecondaryText}>review next batch</Text>
        </Pressable>
      )}
    </View>
  );
}

/** Inline page header used by upload phase 1+2 — flex-row prevents the
 *  back arrow from sitting on top of the title (was an absolute-position
 *  overlap before). */
const PageHeader = ({
  title,
  subtitle,
  onBack,
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
}) => {
  const c = useColors();
  const f = useFonts();
  const styles = useMemo(() => makeStyles(c, f), [c, f]);
  return (
    <View style={styles.pageHeader}>
      <Pressable onPress={onBack} hitSlop={12} style={{ padding: 4 }}>
        <Ionicons name="arrow-back" size={22} color={c.ink} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={styles.h2}>{title}</Text>
        {subtitle ? <Text style={styles.reviewSub}>{subtitle}</Text> : null}
      </View>
    </View>
  );
};

/** Discrete-stop slider with dot notches per spec. Tap a notch to set value;
 *  pan the thumb to drag-snap. */
const BatchSlider = ({
  value,
  onChange,
  options,
}: {
  value: number;
  onChange: (n: number) => void;
  options: readonly number[];
}) => {
  const idx = Math.max(0, options.indexOf(value));
  const c = useColors();
  const f = useFonts();
  const styles = useMemo(() => makeStyles(c, f), [c, f]);
  return (
    <View style={styles.sliderWrap}>
      <View style={styles.sliderTrack} />
      <View
        style={[
          styles.sliderFill,
          { width: `${(idx / (options.length - 1)) * 100}%` },
        ]}
      />
      <View style={styles.sliderDots}>
        {options.map((n, i) => {
          const selected = i === idx;
          return (
            <Pressable
              key={n}
              onPress={() => onChange(n)}
              hitSlop={16}
              style={styles.sliderDotHit}
            >
              <View style={[styles.sliderDot, selected && styles.sliderDotOn]} />
              <Text style={[styles.sliderDotLabel, selected && styles.sliderDotLabelOn]}>
                {n}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

const makeStyles = (c: Palette, f: FontSet) =>
  StyleSheet.create({
    center: { alignItems: 'center', justifyContent: 'center', backgroundColor: c.parchment },
    backBtn: { position: 'absolute', top: 56, left: 20, zIndex: 5, padding: 4 },

    h1: { fontFamily: f.displayMedium, fontSize: 26, color: c.ink, letterSpacing: -0.4 },
    h2: { fontFamily: f.displayMedium, fontSize: 26, color: c.ink, letterSpacing: -0.4 },
    body: { fontSize: 14, color: c.ink, marginTop: 12, textAlign: 'center' },
    subtle: { fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', color: c.inkMuted, marginTop: 6 },
    subtleSmall: { fontSize: 11, color: c.inkMuted, marginTop: 24, fontStyle: 'italic' },
    batteryHint: { fontSize: 11, color: c.inkMuted, marginTop: 28, fontStyle: 'italic', textAlign: 'center' },

    statRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      width: '100%',
      paddingVertical: 10,
      borderBottomWidth: 2,
      borderStyle: 'dashed',
      borderColor: c.divider,
      marginTop: 18,
    },
    statLabel: { fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', color: c.inkMuted },
    statValue: { fontFamily: f.displayMedium, fontSize: 28, color: c.ink },

    pageHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingTop: 56,
      paddingBottom: 12,
      gap: 14,
      backgroundColor: c.parchment,
    },

    // Slider — discrete dots with a track behind, fill on the left of selection.
    sliderWrap: {
      height: 56,
      width: '100%',
      marginTop: 16,
      justifyContent: 'center',
    },
    sliderTrack: {
      position: 'absolute',
      left: 8,
      right: 8,
      top: 18,
      height: 2,
      backgroundColor: c.divider,
    },
    sliderFill: {
      position: 'absolute',
      left: 8,
      top: 18,
      height: 2,
      backgroundColor: c.ink,
    },
    sliderDots: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 0,
    },
    sliderDotHit: {
      width: 36,
      alignItems: 'center',
      paddingVertical: 8,
    },
    sliderDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      borderWidth: 1.5,
      borderColor: c.ink,
      backgroundColor: c.parchment,
    },
    sliderDotOn: {
      backgroundColor: c.ink,
      transform: [{ scale: 1.3 }],
    },
    sliderDotLabel: {
      marginTop: 6,
      fontSize: 11,
      color: c.inkMuted,
    },
    sliderDotLabelOn: {
      color: c.ink,
      fontWeight: '600',
    },

    // Ghost button — for tertiary actions like "add all without AI"
    btnGhost: {
      paddingVertical: 14,
      alignItems: 'center',
    },
    btnGhostText: {
      color: c.inkMuted,
      fontSize: 12,
      letterSpacing: 1.4,
      textTransform: 'uppercase',
      textDecorationLine: 'underline',
    },
    cancelLink: {
      fontSize: 11,
      letterSpacing: 1.4,
      textTransform: 'uppercase',
      color: c.inkMuted,
      textDecorationLine: 'underline',
    },
    // Override on done-phase buttons — base .btn has flex:1 (for the review
    // footer's row layout) which makes them stretch huge in the centered
    // done view. These are stand-alone, non-flex buttons.
    doneBtn: {
      flex: 0,
      alignSelf: 'center',
      marginTop: 14,
      paddingHorizontal: 32,
      minWidth: 220,
    },
    reviewSub: {
      fontFamily: f.italic,
      fontSize: 13,
      color: c.inkMuted,
      marginTop: 6,
      marginBottom: 8,
    },

    batchBox: {
      marginTop: 28,
      marginBottom: 12,
      paddingVertical: 16,
      paddingHorizontal: 18,
      borderWidth: 1,
      borderColor: c.ink,
      borderRadius: 12,
      alignItems: 'center',
    },
    batchTitle: {
      fontSize: 11,
      letterSpacing: 1.6,
      textTransform: 'uppercase',
      color: c.inkMuted,
    },
    batchValue: {
      fontFamily: f.displayMedium,
      fontSize: 32,
      color: c.ink,
      marginTop: 2,
    },
    batchSub: {
      fontSize: 11,
      letterSpacing: 1.4,
      textTransform: 'uppercase',
      color: c.inkMuted,
      marginBottom: 10,
    },
    reviewCell: { flex: 1 / 4, aspectRatio: 1, backgroundColor: c.divider },
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
      backgroundColor: c.parchment,
      paddingTop: 12,
      paddingHorizontal: 20,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderColor: c.divider,
    },
    selectAllRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 8 },
    selectAllLink: {
      fontSize: 11,
      letterSpacing: 1.4,
      textTransform: 'uppercase',
      color: c.inkMuted,
      textDecorationLine: 'underline',
    },
    selectAllSep: { color: c.divider, fontSize: 11 },
    footerCount: {
      fontSize: 11,
      letterSpacing: 1.4,
      textTransform: 'uppercase',
      color: c.inkMuted,
      marginBottom: 10,
      textAlign: 'center',
    },
    footerBtnRow: { flexDirection: 'row', gap: 10 },

    btn: { flex: 1, paddingVertical: 14, alignItems: 'center', borderRadius: 4 },
    btnPrimary: { backgroundColor: c.ink },
    btnPrimaryText: {
      color: c.parchment,
      fontSize: 15,
      letterSpacing: 1.4,
      textTransform: 'uppercase',
      fontWeight: '600',
    },
    btnSecondary: { borderWidth: 1, borderColor: c.ink },
    btnSecondaryText: {
      color: c.ink,
      fontSize: 15,
      letterSpacing: 1.4,
      textTransform: 'uppercase',
      fontWeight: '600',
    },

    progressTrack: {
      marginTop: 24,
      width: '100%',
      maxWidth: 320,
      height: 4,
      backgroundColor: c.divider,
      borderRadius: 2,
      overflow: 'hidden',
    },
    progressFill: { height: '100%', backgroundColor: c.ink },

    pauseBtn: {
      marginTop: 28,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 36,
      paddingVertical: 14,
      borderRadius: 4,
      borderWidth: 1.5,
      borderColor: c.ink,
      minWidth: 200,
    },
    pauseBtnResume: {
      backgroundColor: c.ink,
    },
    pauseBtnText: {
      color: c.ink,
      fontSize: 16,
      letterSpacing: 1.4,
      textTransform: 'uppercase',
      fontWeight: '700',
    },
    pauseBtnTextOn: {
      color: c.parchment,
    },
    stopLink: {
      fontSize: 11,
      letterSpacing: 1.4,
      textTransform: 'uppercase',
      color: '#C0392B',
      textDecorationLine: 'underline',
    },
  });
