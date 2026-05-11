import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { useToast } from '@/components/Toast';
import { analyzeAndPersist, isAnalyzeConfigured } from '@/lib/analyze';
import { enqueueAnalysis } from '@/lib/analysisQueue';
import { useSession } from '@/lib/auth';
import { getBatchState, setBatchState } from '@/lib/batchState';
import { setDemoMode } from '@/lib/demoMode';
import {
  fingerprintAsset,
  findScreenshotsAlbum,
  requestMediaPermission,
  scanAssets,
  type ScannedAsset,
} from '@/lib/mediaLibrary';
import { fetchExistingFingerprints, uploadScreenshot } from '@/lib/uploads';

export type Phase = 'idle' | 'scanning' | 'pick-batch' | 'review' | 'processing' | 'done';
export type ReviewState = 'include' | 'no-ai' | 'exclude' | 'duplicate';

export const BATCH_OPTIONS = [25, 50, 100, 250, 500] as const;
const BATCH_KEY = 'overlook.upload_batch_size';

// Module-level flag: is a runProcessing loop currently alive in this JS session?
// Survives remounts; reset by app reload (fresh JS context).
let activelyProcessing = false;

export function useUploadFlow() {
  const { session } = useSession();
  const toast = useToast();

  const [phase, setPhase] = useState<Phase>('idle');
  const [scanProgress, setScanProgress] = useState(0);
  const [allAssets, setAllAssets] = useState<ScannedAsset[]>([]);
  const [duplicates, setDuplicates] = useState<Set<string>>(new Set());
  const [stateMap, setStateMap] = useState<Map<string, ReviewState>>(new Map());
  const [batchSize, setBatchSizeState] = useState<number>(50);
  const [analyzeWithAI, setAnalyzeWithAI] = useState(false);
  const [doneCount, setDoneCount] = useState(0);
  const [failCount, setFailCount] = useState(0);
  const [totalToProcess, setTotalToProcess] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hasFailures, setHasFailures] = useState(false);

  const pausedRef = useRef(false);
  const stoppedRef = useRef(false);
  const failedAssetsRef = useRef<ScannedAsset[]>([]);
  const scanInflightRef = useRef(false);

  const setBatchSize = (n: number) => {
    setBatchSizeState(n);
    AsyncStorage.setItem(BATCH_KEY, String(n)).catch(() => {});
  };

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
            await enqueueAnalysis(local.id, asset.uri, asset.id);
          }
        }
        setDoneCount((c) => c + 1);
      } catch (err) {
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

      const existing = await fetchExistingFingerprints();
      const dups = new Set<string>();
      for (const a of assets) {
        if (existing.has(fingerprintAsset(a))) dups.add(a.id);
      }
      setDuplicates(dups);
      setStateMap(new Map());

      // If resuming a batch, skip pick-batch + review and go straight to processing.
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

  // Auto-trigger scan on entry. If the processing loop is still alive in this
  // JS session, observe it; otherwise re-scan and resume.
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
      }
      try {
        await runScan();
      } finally {
        scanInflightRef.current = false;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, phase]);

  // Poll batchState while observing the processing screen.
  useEffect(() => {
    if (phase !== 'processing') return;
    const id = setInterval(async () => {
      const s = await getBatchState();
      if (s) {
        setDoneCount(s.processed);
        setTotalToProcess(s.total);
      } else {
        setPhase('done');
      }
    }, 1500);
    return () => clearInterval(id);
  }, [phase]);

  const cycleState = (id: string) => {
    setStateMap((prev) => {
      const next = new Map(prev);
      const cur = next.get(id) ?? 'include';
      const order: ReviewState[] = ['include', 'no-ai', 'exclude'];
      const idx = order.indexOf(cur);
      next.set(id, order[(idx + 1) % order.length]);
      return next;
    });
  };

  const startProcessing = (defaultAnalyze: boolean) => {
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
    void setDemoMode(false);
    void runProcessing(queue);
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

  const togglePause = () => {
    const next = !paused;
    pausedRef.current = next;
    setPaused(next);
  };

  const stopProcessing = () => {
    stoppedRef.current = true;
    pausedRef.current = false;
    setPaused(false);
  };

  return {
    session,
    phase,
    setPhase,
    scanProgress,
    newAssets,
    duplicates,
    allAssets,
    reviewBatch,
    stateMap,
    includedCount,
    batchSize,
    setBatchSize,
    analyzeWithAI,
    doneCount,
    failCount,
    totalToProcess,
    paused,
    hasFailures,
    failedAssetsRef,
    setAllReviewState,
    cycleState,
    startProcessing,
    onRetryFailed,
    togglePause,
    stopProcessing,
  };
}
