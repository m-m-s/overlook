import AsyncStorage from '@react-native-async-storage/async-storage';

import { analyzeAndPersist } from './analyze';

/**
 * Persistent queue of screenshots that failed AI analysis. We retry on app
 * foreground / network reachability.
 *
 * Per CLAUDE.md offline behavior: "AI analysis requests queue locally when
 * offline. Queue processes automatically when internet returns."
 */

const KEY = 'overlook.analysis_queue';

type QueueItem = {
  /** Supabase row id. */
  screenshotId: string;
  /** URI to read for analysis. May be a local file:// or remote https:// URL. */
  uri: string;
  /** When this item was first enqueued (epoch ms). */
  queuedAt: number;
  /** Number of failed retry attempts so far. */
  attempts: number;
};

const read = async (): Promise<QueueItem[]> => {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueueItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const write = async (queue: QueueItem[]): Promise<void> => {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(queue));
  } catch {
    // best effort
  }
};

export const enqueueAnalysis = async (screenshotId: string, uri: string): Promise<void> => {
  const queue = await read();
  // Avoid duplicates
  if (queue.some((q) => q.screenshotId === screenshotId)) return;
  queue.push({ screenshotId, uri, queuedAt: Date.now(), attempts: 0 });
  await write(queue);
};

export const queueLength = async (): Promise<number> => {
  return (await read()).length;
};

let draining = false;

/**
 * Try to drain the queue: process each pending item, remove on success,
 * leave on failure (and increment attempts). Returns counts.
 *
 * Skips items with attempts >= 5 (give up — those probably need user action).
 */
export const drainAnalysisQueue = async (): Promise<{ done: number; failed: number; remaining: number }> => {
  if (draining) return { done: 0, failed: 0, remaining: (await read()).length };
  draining = true;

  let done = 0;
  let failed = 0;
  try {
    const queue = await read();
    if (queue.length === 0) return { done, failed, remaining: 0 };

    const remaining: QueueItem[] = [];
    for (const item of queue) {
      if (item.attempts >= 5) {
        // Give up — probably permanent (auth issue, deleted item, etc.)
        continue;
      }
      try {
        const patch = await analyzeAndPersist(item.uri, item.screenshotId);
        if (patch) {
          done++;
        } else {
          failed++;
          remaining.push({ ...item, attempts: item.attempts + 1 });
        }
      } catch {
        failed++;
        remaining.push({ ...item, attempts: item.attempts + 1 });
      }
    }

    await write(remaining);
    return { done, failed, remaining: remaining.length };
  } finally {
    draining = false;
  }
};
