import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';

import { fetchExistingFingerprints, uploadScreenshot, type LocalScreenshot } from './uploads';

/**
 * Per Maggie's framing: "the power of this app isn't just categorizing
 * existing screenshots but also new ones and images in general — we need
 * a way to add images NOT in the screenshot folder." This module wraps
 * expo-image-picker so the user can pick any images from their gallery
 * (or take a new photo), and pipes each through the same upload flow as
 * a watcher-detected screenshot — same metadata, same Supabase row, same
 * triage path.
 *
 * Returns the freshly-uploaded LocalScreenshots so the caller can refresh
 * the grid + toast a count. Skips images whose hash matches an existing
 * row (silent dedup, same as the bulk-upload scan path).
 */
export const pickAndImportImages = async (opts?: {
  allowsMultipleSelection?: boolean;
}): Promise<{ added: LocalScreenshot[]; skipped: number; errored: number }> => {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsMultipleSelection: opts?.allowsMultipleSelection ?? true,
    selectionLimit: 50, // hard cap so a "select all" doesn't tie up the app
    quality: 1,
    exif: false,
  });
  if (result.canceled || result.assets.length === 0) {
    return { added: [], skipped: 0, errored: 0 };
  }

  // Pre-fetch existing fingerprints once so per-image dedup is cheap.
  const existing = await fetchExistingFingerprints();

  const added: LocalScreenshot[] = [];
  let skipped = 0;
  let errored = 0;

  for (const a of result.assets) {
    try {
      // Use a stable hash from the asset's filesize + URI tail as a
      // fingerprint. Consistent enough to skip dupes within a session;
      // image-picker doesn't give us file content directly without a
      // FileSystem read so we keep it cheap.
      const fp = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        `${a.uri}|${a.fileSize ?? a.width * a.height}|${a.fileName ?? ''}`,
      );
      if (existing.has(fp)) {
        skipped++;
        continue;
      }

      // Persist the asset to MediaLibrary so the URI survives app reload.
      // image-picker URIs point at a session-scoped cache directory and
      // can be evicted; saveToLibraryAsync moves them into the user's
      // gallery and gives us a stable MediaLibrary asset id we can
      // re-resolve on next launch.
      let deviceAssetId: string | undefined;
      let uri = a.uri;
      try {
        const saved = await MediaLibrary.createAssetAsync(a.uri);
        deviceAssetId = saved.id;
        uri = saved.uri;
      } catch {
        // If MediaLibrary save fails (permission denied, e.g.) we still
        // upload using the cache URI — works for the current session.
      }

      const local = await uploadScreenshot(uri, {
        fileHash: fp,
        fileCreatedAt: new Date(a.exif?.DateTimeOriginal ?? Date.now()).toISOString(),
        deviceAssetId,
      });
      added.push(local);
      existing.add(fp);
    } catch (err) {
      console.warn('[galleryPicker] upload failed', err);
      errored++;
    }
  }

  return { added, skipped, errored };
};
