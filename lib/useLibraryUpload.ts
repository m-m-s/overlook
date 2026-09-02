import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Alert } from 'react-native';
import { analyzeAndPersist, isAnalyzeConfigured } from './analyze';
import { enqueueAnalysis, getQueuedIds } from './analysisQueue';
import { useToast } from '@/components/Toast';
import { uploadScreenshot, type LocalScreenshot } from './uploads';

type SetItems = React.Dispatch<React.SetStateAction<LocalScreenshot[]>>;
type SetQueuedIds = React.Dispatch<React.SetStateAction<Set<string>>>;

export const useLibraryUpload = (
  session: { user: { email?: string } } | null,
  setItems: SetItems,
  setQueuedIds: SetQueuedIds,
  setDemoOn: (val: boolean) => unknown,
) => {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [analyzingIds, setAnalyzingIds] = useState<Set<string>>(new Set());

  const runUpload = async (assets: ImagePicker.ImagePickerAsset[], analyze: boolean) => {
    const skipped = assets.filter((a) => !a.assetId).length;
    const usable = assets.filter((a) => a.assetId);
    if (skipped > 0) {
      toast.error(
        `${skipped} image${skipped === 1 ? '' : 's'} skipped (camera-only — must come from your Photos library to import).`,
      );
    }
    if (usable.length === 0) return;

    void setDemoOn(false);

    const uploads = await Promise.all(
      usable.map((a) => uploadScreenshot(a.uri, { deviceAssetId: a.assetId ?? undefined })),
    );

    setItems((prev) => [...uploads, ...prev]);

    if (!analyze || !isAnalyzeConfigured) return;

    setAnalyzingIds((prev) => {
      const next = new Set(prev);
      for (const u of uploads) next.add(u.id);
      return next;
    });

    const results = await Promise.allSettled(
      uploads.map(async (u) => ({
        id: u.id,
        patch: await analyzeAndPersist(u.uri, u.id, u.deviceAssetId ?? undefined),
      })),
    );

    let failures = 0;
    const successPatches: { id: string; patch: NonNullable<Awaited<ReturnType<typeof analyzeAndPersist>>> }[] = [];
    const failedIds: { id: string; uri: string }[] = [];
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const upload = uploads[i];
      if (r.status === 'fulfilled' && r.value.patch) {
        successPatches.push({ id: r.value.id, patch: r.value.patch });
      } else {
        failures++;
        failedIds.push({ id: upload.id, uri: upload.uri });
      }
    }
    for (const f of failedIds) {
      const u = uploads.find((x) => x.id === f.id);
      await enqueueAnalysis(f.id, f.uri, u?.deviceAssetId ?? undefined);
    }

    setAnalyzingIds((prev) => {
      const next = new Set(prev);
      for (const u of uploads) next.delete(u.id);
      return next;
    });

    if (successPatches.length > 0) {
      setItems((prev) =>
        prev.map((it) => {
          const found = successPatches.find((s) => s.id === it.id);
          return found ? { ...it, ...found.patch } : it;
        }),
      );
    }
    if (failures > 0) {
      toast.show(
        `${failures} of ${uploads.length} couldn't be AI-tagged — queued for retry when online.`,
        { kind: 'error' },
      );
    }
    void getQueuedIds().then(setQueuedIds);
  };

  const onPick = async () => {
    setBusy(true);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          'Photo permission needed',
          'Overlook needs access to your gallery to add screenshots. Open Settings → Apps → Overlook → Permissions to enable.',
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: 10,
        quality: 0.9,
      });
      if (result.canceled || result.assets.length === 0) return;

      const { assets } = result;
      if (isAnalyzeConfigured) {
        Alert.alert(
          `Add ${assets.length} screenshot${assets.length === 1 ? '' : 's'}?`,
          'Choose how to add them. AI tagging sends each image to Claude for analysis (~$0.003/image). "Add without AI" keeps them local-only — you can tag manually or analyze later from the card detail view.',
          [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Add without AI', onPress: () => void runUpload(assets, false) },
            { text: 'Analyze with AI', style: 'default', onPress: () => void runUpload(assets, true) },
          ],
        );
      } else {
        await runUpload(assets, false);
      }
    } finally {
      setBusy(false);
    }
  };

  return { busy, analyzingIds, onPick };
};
