import * as Calendar from 'expo-calendar';
import { Linking, Platform } from 'react-native';

/**
 * Add a screenshot's date-bearing item to the user's calendar.
 *
 * On Android we use the system Intent path (`content://com.android.calendar/events`
 * via Linking). It opens the user's calendar app pre-filled — they pick
 * which calendar to save to and confirm. No write permission needed; the
 * decision lives in their app.
 *
 * On iOS we'd use Calendar.createEventAsync after requesting permissions
 * (left as a follow-up — sprint is Android-first).
 *
 * @param title  short event title (usually the screenshot's subject)
 * @param dateISO YYYY-MM-DD (from urgency_date)
 * @param notes  optional event notes — link back to the source URL or a
 *               short blurb so the user has context in their calendar.
 */
export const addToCalendar = async (
  title: string,
  dateISO: string,
  notes?: string,
): Promise<{ ok: boolean; error?: string }> => {
  // Parse the ISO date and treat as a full-day event in local time.
  const date = new Date(dateISO + 'T09:00:00');
  if (Number.isNaN(date.getTime())) {
    return { ok: false, error: 'Invalid date' };
  }
  const startMs = date.getTime();
  const endMs = startMs + 60 * 60 * 1000; // 1-hour default block

  if (Platform.OS === 'android') {
    // Android system intent for "create event" — opens the user's
    // chosen calendar app prefilled. The standard fields:
    //   beginTime / endTime → ms since epoch
    //   title, description
    // The intent: vnd.android.cursor.item/event
    const params = new URLSearchParams({
      title,
      beginTime: String(startMs),
      endTime: String(endMs),
      ...(notes ? { description: notes } : {}),
    });
    const url = `content://com.android.calendar/events?${params.toString()}`;
    try {
      await Linking.openURL(url);
      return { ok: true };
    } catch {
      // Fallback: try the more compatible web intent.
      const fallback =
        `https://calendar.google.com/calendar/render?action=TEMPLATE` +
        `&text=${encodeURIComponent(title)}` +
        `&dates=${formatGoogleDate(startMs)}/${formatGoogleDate(endMs)}` +
        (notes ? `&details=${encodeURIComponent(notes)}` : '');
      try {
        await Linking.openURL(fallback);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Failed to open calendar' };
      }
    }
  }

  // iOS path — request permission and create the event in the default calendar.
  try {
    const { status } = await Calendar.requestCalendarPermissionsAsync();
    if (status !== 'granted') return { ok: false, error: 'Calendar permission denied' };
    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
    const writable = calendars.find((c) => c.allowsModifications);
    if (!writable) return { ok: false, error: 'No writable calendar found' };
    await Calendar.createEventAsync(writable.id, {
      title,
      startDate: new Date(startMs),
      endDate: new Date(endMs),
      notes,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Failed' };
  }
};

const formatGoogleDate = (ms: number): string => {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00Z`
  );
};
