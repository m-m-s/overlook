import * as MediaLibrary from 'expo-media-library';

export type ScannedAsset = {
  id: string;
  uri: string;
  filename: string;
  width: number;
  height: number;
  creationTime: number;
  modificationTime: number;
};

/**
 * Quick fingerprint for dedup. Per spec: "Hash fingerprint per image before
 * upload. Fingerprint match = greyed out in review grid."
 *
 * Using metadata-based fingerprint (size+timestamps+filename) instead of
 * SHA-256 of bytes because it's near-instant for thousands of files. Two
 * identical files copied to the same device with same metadata is rare; if
 * it happens, both get imported (acceptable v1 behavior).
 */
export const fingerprintAsset = (a: ScannedAsset): string =>
  `${a.width}x${a.height}_${a.creationTime}_${a.modificationTime}_${a.filename}`;

/**
 * Find the device's Screenshots album. On Android most phones name this
 * "Screenshots". On iOS, screenshots have a media subtype that we filter
 * separately.
 *
 * Wrapped in try/catch because Expo Go on Android no longer grants full
 * MEDIA_LIBRARY access — getAlbumAsync rejects with "Missing
 * MEDIA_LIBRARY permissions". A dev build is required for the real flow.
 */
export const findScreenshotsAlbum = async (): Promise<MediaLibrary.Album | null> => {
  try {
    const candidates = ['Screenshots', 'Screenshot'];
    for (const name of candidates) {
      const album = await MediaLibrary.getAlbumAsync(name);
      if (album) return album;
    }
    return null;
  } catch (err) {
    console.warn('[mediaLibrary] getAlbumAsync rejected (Expo Go limitation?)', err);
    return null;
  }
};

export const requestMediaPermission = async (): Promise<boolean> => {
  try {
    // Pass granularPermissions=['photo'] so we don't auto-request AUDIO
    // (which would crash because AUDIO isn't declared in our AndroidManifest).
    const { granted, canAskAgain, status } = await MediaLibrary.requestPermissionsAsync(false, [
      'photo',
    ]);
    if (granted) return true;
    if (!canAskAgain || status === 'denied') return false;
    return false;
  } catch (err) {
    console.warn('[mediaLibrary] requestPermissionsAsync rejected', err);
    return false;
  }
};

/**
 * Stream all assets in a given album (or full library if album is null).
 * Returns a flat array. Pages internally with `first: 100` to avoid
 * blocking. For an enormous library, the caller can show progress.
 */
export const scanAssets = async (
  album: MediaLibrary.Album | null,
  onProgress?: (count: number) => void,
): Promise<ScannedAsset[]> => {
  const out: ScannedAsset[] = [];
  let after: string | undefined;
  let safety = 0;
  while (safety++ < 200) {
    let page;
    try {
      page = await MediaLibrary.getAssetsAsync({
        album: album?.id,
        mediaType: 'photo',
        first: 100,
        after,
        sortBy: ['creationTime'],
      });
    } catch (err) {
      console.warn('[mediaLibrary] getAssetsAsync rejected (Expo Go limitation?)', err);
      break;
    }
    for (const a of page.assets) {
      out.push({
        id: a.id,
        uri: a.uri,
        filename: a.filename,
        width: a.width,
        height: a.height,
        creationTime: a.creationTime,
        modificationTime: a.modificationTime,
      });
    }
    onProgress?.(out.length);
    if (!page.hasNextPage || !page.endCursor) break;
    after = page.endCursor;
  }
  return out;
};
