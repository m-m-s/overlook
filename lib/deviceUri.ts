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
    if (!info?.uri) return null;
    const r: Resolved = {
      uri: info.uri,
      localUri: info.localUri ?? info.uri,
    };
    cache.set(assetId, r);
    return r;
  } catch {
    return null;
  }
};

/** Bulk version — resolves many at once. Order is preserved; nulls for assets that fail. */
export const resolveDeviceAssets = async (assetIds: string[]): Promise<(Resolved | null)[]> => {
  return Promise.all(assetIds.map(resolveDeviceAsset));
};

export const clearDeviceAssetCache = (): void => {
  cache.clear();
};
