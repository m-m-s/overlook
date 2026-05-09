import AsyncStorage from '@react-native-async-storage/async-storage';
import * as MediaLibrary from 'expo-media-library';
import * as Notifications from 'expo-notifications';
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

import { findScreenshotsAlbum, fingerprintAsset, requestMediaPermission, type ScannedAsset } from './mediaLibrary';
import { isScreenshotNotifyEnabled } from './settings';
import { fetchExistingFingerprints } from './uploads';

// One-time channel + permission setup. Android needs a channel before we can
// fire local notifications; permissions auto-grant for local-only on most
// installs but we ask anyway so it shows up in app settings.
const ensureNotificationChannel = async (): Promise<void> => {
  await Notifications.setNotificationChannelAsync('screenshot-capture', {
    name: 'Screenshot capture',
    importance: Notifications.AndroidImportance.DEFAULT,
    sound: null,
    vibrationPattern: null,
    lightColor: '#000000',
  });
};
const ensureNotificationPermission = async (): Promise<boolean> => {
  const { status } = await Notifications.getPermissionsAsync();
  if (status === 'granted') return true;
  const { status: req } = await Notifications.requestPermissionsAsync();
  return req === 'granted';
};

const LAST_SEEN_KEY = 'overlook.last_screenshot_seen';

type Ctx = {
  /** Next screenshot waiting for user decision, or null. */
  next: ScannedAsset | null;
  /** Pop the head of the queue (call after the user resolves it). */
  consume: () => void;
  /** Drop the entire queue. */
  clear: () => void;
  /** Push externally-sourced assets (gallery picker, share sheet, etc.)
   *  into the same queue so they flow through the same popup UX. */
  enqueue: (assets: ScannedAsset[]) => void;
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
      const granted = await requestMediaPermission();
       
      console.log('[watcher] permission granted:', granted);
      if (!granted) return;

      // Best-effort notification setup. If this fails or perms are denied,
      // the watcher still works — user just won't get a push when a
      // screenshot lands while the app is backgrounded.
      try {
        await ensureNotificationChannel();
        await ensureNotificationPermission();
      } catch (err) {
        console.warn('[watcher] notification setup failed', err);
      }

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
       
      console.log(
        '[watcher] mounted — albumId:',
        albumId.current,
        'lastSeen:',
        new Date(lastSeen.current).toISOString(),
        'knownFingerprints:',
        knownFingerprints.current.size,
      );

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
    if (knownFingerprints.current.has(fingerprintAsset(asset))) {
       
      console.log('[watcher] skipping — already imported (fingerprint match):', asset.filename);
      return;
    }
     
    console.log('[watcher] enqueueing:', asset.filename, asset.id);
    queuedIds.current.add(asset.id);
    setQueue((q) => [...q, asset]);

    // Fire a local notification so the user knows a new screenshot is
    // queued even if Overlook is backgrounded. Gated on the user's
    // preference (settings → screenshot notifications, default ON).
    void (async () => {
      if (!(await isScreenshotNotifyEnabled())) return;
      try {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: 'New screenshot',
            body: 'Tap to tag in Overlook',
            data: { assetId: asset.id },
          },
          trigger: null, // fire immediately
        });
      } catch (err) {
        console.warn('[watcher] notify failed', err);
      }
    })();
  }, []);

  const scan = useCallback(async () => {
    // Re-resolve album each scan — some Android distros only create the
    // Screenshots album AFTER the user's first screenshot.
    if (!albumId.current) {
      const album = await findScreenshotsAlbum();
      albumId.current = album?.id ?? null;
    }
    try {
      // If album-based scan fails or returns nothing, fall back to scanning
      // recent assets across the whole library and filter by filename pattern.
      const page = albumId.current
        ? await MediaLibrary.getAssetsAsync({
            album: albumId.current,
            mediaType: 'photo',
            first: 20,
            sortBy: [['creationTime', false]],
          })
        : await MediaLibrary.getAssetsAsync({
            mediaType: 'photo',
            first: 30,
            sortBy: [['creationTime', false]],
          });

      // Two filters:
      //  1. Fresher than last-seen (ms timestamp)
      //  2. Looks like a screenshot — by album OR by filename heuristic
      const looksLikeScreenshot = (a: MediaLibrary.Asset): boolean => {
        if (albumId.current) return true; // already filtered by album
        return /screenshot/i.test(a.filename);
      };
      const fresh = page.assets
        .filter((a) => a.creationTime > lastSeen.current)
        .filter(looksLikeScreenshot);
       
      console.log(
        '[watcher] scan: total',
        page.assets.length,
        'fresh',
        fresh.length,
        'lastSeen',
        new Date(lastSeen.current).toISOString(),
      );
      if (fresh.length === 0) return;
      const newest = Math.max(...fresh.map((a) => a.creationTime));
      lastSeen.current = newest;
      await AsyncStorage.setItem(LAST_SEEN_KEY, String(newest));
      for (const a of fresh.slice().reverse()) enqueueAsset(a);
    } catch (err) {
      console.warn('[screenshotWatcher] scan failed', err);
    }
  }, [enqueueAsset]);

  // Notification deep-link: when the user taps the screenshot-capture
  // notification, surface that specific asset by moving it to the head
  // of the queue. The popup auto-presents from queue[0] so the user
  // lands on the right card. If the asset isn't in the queue (e.g.,
  // already consumed), no-op; the popup just shows the next pending one.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((res) => {
      const assetId = res.notification.request.content.data?.assetId as string | undefined;
      if (!assetId) return;
      setQueue((q) => {
        const idx = q.findIndex((a) => a.id === assetId);
        if (idx <= 0) return q; // already at head or not present
        const reordered = [q[idx], ...q.slice(0, idx), ...q.slice(idx + 1)];
        return reordered;
      });
    });
    return () => sub.remove();
  }, []);

  // Real-time: listen for media-library changes (works in Expo Go).
  useEffect(() => {
    const sub = MediaLibrary.addListener(() => {
       
      console.log('[watcher] MediaLibrary listener fired');
      void scan();
    });
    return () => sub.remove();
  }, [scan]);

  // Re-scan on app foreground.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
       
      console.log('[watcher] AppState ->', state);
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

  const enqueue = useCallback((assets: ScannedAsset[]) => {
    setQueue((q) => {
      const fresh = assets.filter((a) => !queuedIds.current.has(a.id));
      for (const a of fresh) queuedIds.current.add(a.id);
      return [...q, ...fresh];
    });
  }, []);

  const value: Ctx = {
    next: queue[0] ?? null,
    consume,
    clear,
    enqueue,
  };

  return <WatcherContext.Provider value={value}>{children}</WatcherContext.Provider>;
};
