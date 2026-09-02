import * as MediaLibrary from 'expo-media-library';

/**
 * Resolve a MediaLibrary asset id to a renderable + readable URI.
 *
 * On Android, asset.uri is `content://media/...` which expo-image renders
 * directly but expo-file-system can't always read. The 'localUri' from
 * getAssetInfoAsync is the file:// path we pass to FileSystem for AI
 * analysis. We cache so we don't re-query on every render.
 */

type Resolved = {
  /** Best URI for rendering with expo-image. */
  uri: string;
  /** file:// path safe for FileSystem.readAsStringAsync. */
  localUri: string;
};

const cache = new Map<string, Resolved>();

export const resolveDeviceAsset = async (assetId: string): Promise<Resolved | null> => {
  const cached = cache.get(assetId);
  if (cached) return cached;
  try {
    const info = await MediaLibrary.getAssetInfoAsync(assetId);
    if (info?.uri) {
      const r: Resolved = {
        uri: info.uri,
        localUri: info.localUri ?? info.uri,
      };
      cache.set(assetId, r);
      return r;
    }
  } catch {
    // fall through to the content:// fallback
  }
  // Fallback for Android: construct the standard MediaStore content URI
  // directly from the asset id. expo-image can render it for grid display
  // even when getAssetInfoAsync rejects (which it does on some Samsung
  // devices / scoped-storage setups for assets the app didn't create).
  if (/^\d+$/.test(assetId)) {
    const uri = `content://media/external/images/media/${assetId}`;
    const r: Resolved = { uri, localUri: uri };
    cache.set(assetId, r);
    return r;
  }
  return null;
};

