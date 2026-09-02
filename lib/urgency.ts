const endOfDay = (d: Date): Date =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59);

const endOfWeek = (now: Date): Date => {
  const d = new Date(now);
  const daysUntilSunday = d.getDay() === 0 ? 0 : 7 - d.getDay();
  d.setDate(d.getDate() + daysUntilSunday);
  return endOfDay(d);
};

const endOfMonth = (now: Date): Date =>
  new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

const endOfYear = (now: Date): Date =>
  new Date(now.getFullYear(), 11, 31, 23, 59, 59);

// Returns end-of-day for the last day of the season containing `now`.
// Winter straddles years: Dec ends in next-year Feb, Jan/Feb end in current-year Feb.
const endOfCurrentSeason = (now: Date): Date => {
  const m = now.getMonth();
  if (m >= 2 && m <= 4) return new Date(now.getFullYear(), 4, 31, 23, 59, 59);   // spring → May 31
  if (m >= 5 && m <= 7) return new Date(now.getFullYear(), 7, 31, 23, 59, 59);   // summer → Aug 31
  if (m >= 8 && m <= 10) return new Date(now.getFullYear(), 10, 30, 23, 59, 59); // autumn → Nov 30
  const endYear = m === 11 ? now.getFullYear() + 1 : now.getFullYear();
  return new Date(endYear, 1, 28, 23, 59, 59); // winter → Feb 28
};

/**
 * Resolve the concrete deadline Date for a given urgency key + optional ISO
 * urgency_date string. urgencyDate wins when present; otherwise the deadline
 * is inferred from the key relative to `now`.
 *
 * Items without a deadline anchor (someday, unknown keys) return null —
 * their urgency label is static and never auto-escalates.
 *
 * Items WITH a deadline (including floating labels like "this_week" once the
 * user sets them) resolve to the end of the relevant period. The next time the
 * app computes effectiveUrgencyKey the period may have passed, surfacing the
 * item as overdue automatically.
 */
export const resolveDeadline = (
  urgency: string | null | undefined,
  urgencyDate: string | null | undefined,
  now: Date,
): Date | null => {
  if (urgencyDate) {
    const d = new Date(urgencyDate);
    if (!isNaN(d.getTime())) return endOfDay(d);
  }
  switch (urgency) {
    case 'today':
    case 'expires_soon':
      return endOfDay(now);
    case 'this_week':
      return endOfWeek(now);
    case 'this_month':
      return endOfMonth(now);
    case 'this_season':
      return endOfCurrentSeason(now);
    case 'this_spring':
      return new Date(now.getFullYear(), 4, 31, 23, 59, 59);
    case 'this_summer':
      return new Date(now.getFullYear(), 7, 31, 23, 59, 59);
    case 'this_autumn':
      return new Date(now.getFullYear(), 10, 30, 23, 59, 59);
    case 'this_winter': {
      const endYear = now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear();
      return new Date(endYear, 1, 28, 23, 59, 59);
    }
    case 'this_year':
      return endOfYear(now);
    default:
      return null; // 'someday', null, unknown — no deadline, no escalation
  }
};

const calendarDaysUntil = (deadline: Date, now: Date): number => {
  const a = new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate());
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
};

/**
 * Returns the live urgency key for an item, computed from how far its
 * deadline is from today. Keys escalate automatically as time passes:
 * "this_year" → "this_season" → "this_month" → "this_week" → "today" → "overdue".
 *
 * Note: floating labels (this_week, this_month, etc.) only escalate when
 * urgencyDate is set. Items set before this system existed have no anchor and
 * their label stays unchanged. New items get urgencyDate written at set-time
 * via computeUrgencyDate so they escalate correctly going forward.
 */
export const effectiveUrgencyKey = (
  item: { urgency?: string | null; urgencyDate?: string | null },
  now = new Date(),
): string | null => {
  if (!item.urgency && !item.urgencyDate) return null;

  const deadline = resolveDeadline(item.urgency, item.urgencyDate, now);
  if (!deadline) return item.urgency ?? null; // 'someday' passes through unchanged

  const days = calendarDaysUntil(deadline, now);
  if (days < 0) return 'overdue';
  if (days === 0) return item.urgency === 'expires_soon' ? 'expires_soon' : 'today';
  if (days <= 7) return 'this_week';
  if (days <= 30) return 'this_month';
  if (days <= 90) return 'this_season';
  if (days <= 365) return 'this_year';
  return 'someday';
};

const URGENCY_LABEL_MAP: Record<string, string> = {
  overdue: 'Overdue',
  today: 'Today',
  expires_soon: 'Expires soon',
  this_week: 'This week',
  this_month: 'This month',
  this_season: 'This season',
  this_spring: 'This spring',
  this_summer: 'This summer',
  this_autumn: 'This autumn',
  this_winter: 'This winter',
  this_year: 'This year',
  someday: 'Someday',
};

export const urgencyDisplayLabel = (key: string | null | undefined): string | null => {
  if (!key) return null;
  return URGENCY_LABEL_MAP[key] ?? key;
};

/**
 * Compute the urgencyDate ISO string (YYYY-MM-DD) to persist alongside a
 * user-selected urgency key. Anchors the deadline to the end of the relevant
 * period at the moment of selection, so the urgency escalates correctly over
 * time even for labels like "this_year" that have no specific date.
 */
export const computeUrgencyDate = (key: string | null | undefined, now = new Date()): string | null => {
  const deadline = resolveDeadline(key, null, now);
  if (!deadline) return null;
  const y = deadline.getFullYear();
  const m = String(deadline.getMonth() + 1).padStart(2, '0');
  const d = String(deadline.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};
