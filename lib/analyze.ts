import * as FileSystem from 'expo-file-system/legacy';

import { isSupabaseConfigured, supabase } from './supabase';
import type { TypedTag } from './screenshots';

export type AnalyzeResult = {
  category: string | null;
  subject: string | null;
  typed_tags: TypedTag[];
  suggested_subjects: string[];
  urgency: string | null;
  urgency_date: string | null;
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

/** Send an image to the Vercel function for vision analysis. */
export const analyzeImage = async (uri: string): Promise<AnalyzeResult | null> => {
  if (!VERCEL_URL) return null;

  const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  const mime = guessMime(uri);

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

/** Write AI-analysis results back to the screenshots row. */
export const persistAnalyzeResult = async (
  screenshotId: string,
  result: AnalyzeResult,
): Promise<void> => {
  if (!isSupabaseConfigured) return;
  const { error } = await supabase
    .from('screenshots')
    .update({
      analyzed: true,
      ai_typed_tags: result.typed_tags,
      ai_suggested_subjects: result.suggested_subjects,
      ai_suggested_category: result.category,
      // Pre-fill user-set fields when AI is confident — user can override in the sheet.
      category: result.category,
      subject: result.subject,
      urgency: result.urgency,
      urgency_date: result.urgency_date,
    })
    .eq('id', screenshotId);
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[analyze] persist failed', error);
  }
};

/**
 * Convenience: run analysis + persist + return a UI-friendly patch.
 * Returns null when analysis is not configured or failed.
 */
export const analyzeAndPersist = async (
  uri: string,
  screenshotId: string,
): Promise<{ category: string | null; subject: string | null; urgency: string | null } | null> => {
  const result = await analyzeImage(uri);
  if (!result) return null;
  await persistAnalyzeResult(screenshotId, result);
  return {
    category: result.category,
    subject: result.subject,
    urgency: result.urgency,
  };
};
