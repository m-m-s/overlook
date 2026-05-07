import * as FileSystem from 'expo-file-system/legacy';

import { resolveDeviceAsset } from './deviceUri';
import { isSupabaseConfigured, supabase } from './supabase';
import type { TypedTag } from './screenshots';

export type AnalyzeResult = {
  category: string | null;
  subject: string | null;
  typed_tags: TypedTag[];
  suggested_subjects: string[];
  urgency: string | null;
  urgency_date: string | null;
  source_url?: string | null;
  action_url?: string | null;
  action_url_type?: string | null;
};

const VERCEL_URL = process.env.EXPO_PUBLIC_VERCEL_URL;
const SHARED_SECRET = process.env.EXPO_PUBLIC_OVERLOOK_SECRET;

export const isAnalyzeConfigured = Boolean(VERCEL_URL);

const guessMime = (uri: string): 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif' => {
  const ext = uri.toLowerCase().match(/\.(jpg|jpeg|png|webp|gif)(\?|$)/)?.[1];
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  return 'image/jpeg';
};

/** Read URI as base64. Supports:
 *   file://   — picker / MediaLibrary localUri, read directly
 *   https://  — signed Storage URLs (legacy data only), download then read
 *   content:// — Android MediaLibrary public URIs; we resolve to localUri
 *                via the deviceUri cache before reading
 */
const readAsBase64 = async (uri: string): Promise<string> => {
  // content:// URIs aren't directly readable by FileSystem on Android.
  // Caller should pass the file:// localUri; if it's content://, fail loudly
  // so we update the call site instead of silently returning bad bytes.
  if (uri.startsWith('content://')) {
    throw new Error(
      'analyzeImage was passed a content:// URI. Resolve it to a file:// localUri via resolveDeviceAsset() first.',
    );
  }
  if (uri.startsWith('http://') || uri.startsWith('https://')) {
    const tmp = `${FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? ''}analyze-${Date.now()}.bin`;
    const { uri: localUri } = await FileSystem.downloadAsync(uri, tmp);
    const data = await FileSystem.readAsStringAsync(localUri, { encoding: FileSystem.EncodingType.Base64 });
    try {
      await FileSystem.deleteAsync(localUri, { idempotent: true });
    } catch {
      // ignore
    }
    return data;
  }
  return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
};

/** Send an image to the Vercel function for vision analysis.
 *
 *  Optionally accepts a deviceAssetId — if present, we resolve via
 *  MediaLibrary to get a file:// localUri (more reliable than the asset's
 *  raw uri, which can be content:// on Android).
 */
export const analyzeImage = async (
  uri: string,
  deviceAssetId?: string | null,
): Promise<AnalyzeResult | null> => {
  if (!VERCEL_URL) return null;

  // Prefer resolved localUri for device assets to avoid content:// pitfalls.
  let readUri = uri;
  if (deviceAssetId) {
    const resolved = await resolveDeviceAsset(deviceAssetId);
    if (resolved?.localUri) readUri = resolved.localUri;
  }

  const base64 = await readAsBase64(readUri);
  const mime = guessMime(readUri);

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (SHARED_SECRET) headers['x-overlook-secret'] = SHARED_SECRET;

    const r = await fetch(`${VERCEL_URL}/api/analyze`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ image_base64: base64, mime_type: mime }),
    });

    if (!r.ok) {
      // eslint-disable-next-line no-console
      console.warn('[analyze] non-OK response', r.status, await r.text());
      return null;
    }
    const json = (await r.json()) as AnalyzeResult;
    return json;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[analyze] fetch failed', err);
    return null;
  }
};

// Categories that default to local-only (per CLAUDE.md privacy model).
const LOCAL_ONLY_CATEGORIES = new Set(['documents', 'messages']);

/** Write AI-analysis results back to the screenshots row. */
export const persistAnalyzeResult = async (
  screenshotId: string,
  result: AnalyzeResult,
): Promise<void> => {
  if (!isSupabaseConfigured) return;
  // Auto-flag local-only when AI detects a sensitive category. User can
  // override in the detail sheet.
  const autoLocalOnly = result.category && LOCAL_ONLY_CATEGORIES.has(result.category);

  const update: Record<string, unknown> = {
    analyzed: true,
    ai_typed_tags: result.typed_tags,
    ai_suggested_subjects: result.suggested_subjects,
    ai_suggested_category: result.category,
    category: result.category,
    subject: result.subject,
    urgency: result.urgency,
    urgency_date: result.urgency_date,
    source_url: result.source_url ?? null,
    action_url: result.action_url ?? null,
    action_url_type: result.action_url_type ?? null,
  };
  if (autoLocalOnly) update.local_only = true;

  const { error } = await supabase.from('screenshots').update(update).eq('id', screenshotId);
  if (error) {
    console.warn('[analyze] persist failed', error);
  }
};

/**
 * Convenience: run analysis + persist + return a UI-friendly patch.
 * Returns null when analysis is not configured or failed.
 *
 * Accepts deviceAssetId so we can resolve to a file:// localUri for the
 * actual byte read (more reliable on Android than content:// URIs).
 */
export const analyzeAndPersist = async (
  uri: string,
  screenshotId: string,
  deviceAssetId?: string | null,
): Promise<{ category: string | null; subject: string | null; urgency: string | null } | null> => {
  const result = await analyzeImage(uri, deviceAssetId);
  if (!result) return null;
  await persistAnalyzeResult(screenshotId, result);
  return {
    category: result.category,
    subject: result.subject,
    urgency: result.urgency,
  };
};
