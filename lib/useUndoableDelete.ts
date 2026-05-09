import * as MediaLibrary from 'expo-media-library';
import { Alert } from 'react-native';

import { useToast } from '@/components/Toast';
import { deleteScreenshot, deleteScreenshots } from './screenshots';
import type { LocalScreenshot } from './uploads';

/** After commit, ask user if they want to delete the original from device. */
const offerDeleteFromDevice = async (assetIds: string[]): Promise<void> => {
  if (assetIds.length === 0) return;
  Alert.alert(
    `Also delete from device?`,
    assetIds.length === 1
      ? "Removes the original from your phone's gallery. The Overlook copy is already gone."
      : `Removes ${assetIds.length} originals from your phone's gallery. Overlook copies are already gone.`,
    [
      { text: 'Keep on device', style: 'cancel' },
      {
        text: 'Delete from device',
        style: 'destructive',
        onPress: async () => {
          try {
            const perm = await MediaLibrary.requestPermissionsAsync(true, ['photo']);
            if (!perm.granted) {
              return;
            }
            await MediaLibrary.deleteAssetsAsync(assetIds);
          } catch (err) {
            console.warn('[delete from device] failed', err);
          }
        },
      },
    ],
  );
};

/**
 * Soft-delete with a 5-second undo window per CLAUDE.md.
 *
 * Flow: optimistic remove from UI → toast with 'undo' action → after 5s,
 * commit to Supabase. If undo tapped, restore to UI and don't commit.
 *
 * This is a hook because it needs the toast context. Caller passes setItems
 * so the same hook can be used by Home, Library, or any other screen that
 * holds an items list.
 */
export const useUndoableDelete = (
  setItems: (updater: (prev: LocalScreenshot[]) => LocalScreenshot[]) => void,
) => {
  const toast = useToast();

  const remove = (item: LocalScreenshot) => {
    let undone = false;

    // 1. Optimistic remove from UI
    setItems((prev) => prev.filter((i) => i.id !== item.id));

    // 2. Toast with undo
    toast.show(`deleted ${item.subject ? `"${item.subject}"` : 'screenshot'}`, {
      durationMs: 5000,
      action: {
        label: 'undo',
        onPress: () => {
          undone = true;
          // Restore — preserve roughly its position by prepending (newest-first sort)
          setItems((prev) => {
            // Avoid duplicates if somehow already there
            if (prev.some((p) => p.id === item.id)) return prev;
            return [item, ...prev];
          });
        },
      },
    });

    // 3. Commit after 5s if not undone, then offer device-delete
    setTimeout(async () => {
      if (undone) return;
      await deleteScreenshot(item.id, item.storagePath);
      if (item.deviceAssetId) {
        await offerDeleteFromDevice([item.deviceAssetId]);
      }
    }, 5000);
  };

  /**
   * Bulk variant: same pattern, but for many items at once.
   */
  const removeMany = (items: LocalScreenshot[]) => {
    if (items.length === 0) return;
    let undone = false;
    const ids = new Set(items.map((i) => i.id));

    setItems((prev) => prev.filter((i) => !ids.has(i.id)));

    toast.show(`deleted ${items.length} screenshot${items.length === 1 ? '' : 's'}`, {
      durationMs: 5000,
      action: {
        label: 'undo',
        onPress: () => {
          undone = true;
          setItems((prev) => {
            const existing = new Set(prev.map((p) => p.id));
            const restoreList = items.filter((i) => !existing.has(i.id));
            return [...restoreList, ...prev];
          });
        },
      },
    });

    setTimeout(async () => {
      if (undone) return;
      await deleteScreenshots(items.map((i) => ({ id: i.id, storagePath: i.storagePath })));
      const assetIds = items
        .map((i) => i.deviceAssetId)
        .filter((x): x is string => Boolean(x));
      if (assetIds.length > 0) {
        await offerDeleteFromDevice(assetIds);
      }
    }, 5000);
  };

  return { remove, removeMany };
};
