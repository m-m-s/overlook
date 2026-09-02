import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';

import type { ScannedAsset } from './mediaLibrary';

/**
 * Open the system image picker and convert the chosen images into
 * ScannedAssets ready to be enqueued into the post-screenshot popup.
 *
 * Per Maggie: gallery-picked images should flow through the SAME popup
 * UX as watcher-detected screenshots (resonance + urgency + quick tag
 * → Analyze & Add / Add without AI / Dismiss). No bulk batching, no
 * separate review screen — the popup auto-iterates one image at a time.
 *
 * For each picked image we save to MediaLibrary so the URI survives
 * across app launches (image-picker URIs are cache-scoped). Returns the
 * resulting ScannedAssets; the caller passes them to the watcher's
 * enqueue() to surface the popup.
 */
export const pickGalleryImages = async (opts?: {
  allowsMultipleSelection?: boolean;
}): Promise<ScannedAsset[]> => {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: opts?.allowsMultipleSelection ?? true,
    selectionLimit: 50,
    quality: 1,
    exif: false,
  });
  if (result.canceled || result.assets.length === 0) return [];

  const out: ScannedAsset[] = [];
  for (const a of result.assets) {
    try {
      // Save into MediaLibrary so the asset has a stable id and survives
      // cache eviction. Falls back to the picker's cache URI if save
      // fails (e.g. permission denied) — still works for the session.
      let id: string | null = a.assetId ?? null;
      let uri = a.uri;
      let creationTime = a.exif?.DateTimeOriginal
        ? Date.parse(a.exif.DateTimeOriginal)
        : Date.now();
      let modificationTime = creationTime;
      try {
        const saved = await MediaLibrary.createAssetAsync(a.uri);
        id = saved.id;
        uri = saved.uri;
        creationTime = saved.creationTime ?? creationTime;
        modificationTime = saved.modificationTime ?? modificationTime;
      } catch {
        // best-effort
      }
      if (!id) continue; // can't track without an asset id
      out.push({
        id,
        uri,
        filename: a.fileName ?? `gallery-${id}.jpg`,
        width: a.width,
        height: a.height,
        creationTime,
        modificationTime,
      });
    } catch (err) {
      console.warn('[galleryPicker] convert failed', err);
    }
  }
  return out;
};
