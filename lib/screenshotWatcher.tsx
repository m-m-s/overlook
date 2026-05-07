import AsyncStorage from '@react-native-async-storage/async-storage';
import * as MediaLibrary from 'expo-media-library';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState } from 'react-native';

import { findScreenshotsAlbum, fingerprintAsset, type ScannedAsset } from './mediaLibrary';
import { fetchExistingFingerprints } from './uploads';

const LAST_SEEN_KEY = 'overlook.last_screenshot_seen';

type Ctx = {
  /** Next screenshot waiting for user decision, or null. */
  next: ScannedAsset | null;
  /** Pop the head of the queue (call after the user resolves it). */
  consume: () => void;
  /** Drop the entire queue. */
  clear: () => void;
};

const WatcherContext = createContext<Ctx | null>(null);

export const useScreenshotWatcher = (): Ctx => {
  const ctx = useContext(WatcherContext);
  if (!ctx) throw new Error('useScreenshotWatcher inside ScreenshotWatcherProvider');
  return ctx;
};

/**
 * Watches the device's Screenshots album for new images and queues them for
 * the post-screenshot popup. Per CLAUDE.md privacy model: nothing auto-sends
 * — the popup just surfaces newly-taken screenshots; the user explicitly
 * picks an action.
 *
 * In Expo Go, real-time push is via expo-media-library's addListener (no
 * Android FileObserver). When the app is in foreground and a screenshot is
 * taken, the listener fires shortly after. We also do a "since last seen"
 * scan on app foreground so we catch screenshots taken while the app was
 * fully closed.
 */
export const ScreenshotWatcherProvider = ({ children }: { children: ReactNode }) => {
  const [queue, setQueue] = useState<ScannedAsset[]>([]);
  const lastSeen = useRef<number>(Date.now());
  const albumId = useRef<string | null>(null);
  const knownFingerprints = useRef<Set<string>>(new Set());
  const queuedIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    let mounted = true;

    void (async () => {
      // Hydrate "last seen" — default to now so we don't pop up for everything ever.
      const raw = await AsyncStorage.getItem(LAST_SEEN_KEY);
      if (raw) {
        const v = parseInt(raw, 10);
        if (!isNaN(v)) lastSeen.current = v;
      } else {
        await AsyncStorage.setItem(LAST_SEEN_KEY, String(Date.now()));
      }

      const album = await findScreenshotsAlbum();
      albumId.current = album?.id ?? null;
      knownFingerprints.current = await fetchExistingFingerprints();

      // Initial since-last-seen scan (catches screenshots while app was closed).
      if (mounted) await scan();
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const enqueueAsset = useCallback((a: MediaLibrary.Asset) => {
    if (queuedIds.current.has(a.id)) return;
    const asset: ScannedAsset = {
      id: a.id,
      uri: a.uri,
      filename: a.filename,
      width: a.width,
      height: a.height,
      creationTime: a.creationTime,
      modificationTime: a.modificationTime,
    };
    if (knownFingerprints.current.has(fingerprintAsset(asset))) return; // already imported
    queuedIds.current.add(asset.id);
    setQueue((q) => [...q, asset]);
  }, []);

  const scan = useCallback(async () => {
    if (!albumId.current) {
      const album = await findScreenshotsAlbum();
      albumId.current = album?.id ?? null;
      if (!albumId.current) return;
    }
    try {
      const page = await MediaLibrary.getAssetsAsync({
        album: albumId.current,
        mediaType: 'photo',
        first: 10,
        sortBy: [['creationTime', false]], // DESC: newest first
      });
      const fresh = page.assets.filter((a) => a.creationTime > lastSeen.current);
      if (fresh.length === 0) return;
      const newest = Math.max(...fresh.map((a) => a.creationTime));
      lastSeen.current = newest;
      await AsyncStorage.setItem(LAST_SEEN_KEY, String(newest));
      // Queue oldest-first so the popup walks them in order
      for (const a of fresh.slice().reverse()) enqueueAsset(a);
    } catch (err) {
      console.warn('[screenshotWatcher] scan failed', err);
    }
  }, [enqueueAsset]);

  // Real-time: listen for media-library changes (works in Expo Go).
  useEffect(() => {
    const sub = MediaLibrary.addListener(() => {
      void scan();
    });
    return () => sub.remove();
  }, [scan]);

  // Re-scan on app foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void scan();
    });
    return () => sub.remove();
  }, [scan]);

  const consume = useCallback(() => {
    setQueue((q) => {
      const [first, ...rest] = q;
      if (first) queuedIds.current.delete(first.id);
      return rest;
    });
  }, []);

  const clear = useCallback(() => {
    queuedIds.current.clear();
    setQueue([]);
  }, []);

  const value: Ctx = {
    next: queue[0] ?? null,
    consume,
    clear,
  };

  return <WatcherContext.Provider value={value}>{children}</WatcherContext.Provider>;
};
