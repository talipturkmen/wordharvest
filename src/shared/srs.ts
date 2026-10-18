// SM-2 variant with four grades (like Anki):
//   again → relearn: due again in 1 minute (re-queued in the current session)
//   hard  → interval × 1.2, ease − 0.15
//   good  → 1 day, then 3 days, then interval × ease
//   easy  → like good with an extra × 1.3 bonus, ease + 0.15
// Reviewed cards become due at local midnight so "due today" is stable all day.
import type { SrsState } from './types.ts';

export type Grade = 'again' | 'hard' | 'good' | 'easy';
export const GRADES: readonly Grade[] = ['again', 'hard', 'good', 'easy'];

export const MINUTE = 60_000;
export const DAY = 86_400_000;
const MIN_EASE = 1.3;
const MAX_INTERVAL_DAYS = 3650;

export function newSrs(now: number): SrsState {
  return { due: now, interval: 0, ease: 2.5, reps: 0, lapses: 0 };
}

export function startOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function endOfDay(t: number): number {
  const d = new Date(t);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function addDays(t: number, days: number): number {
  const d = new Date(startOfDay(t));
  d.setDate(d.getDate() + days);
  return d.getTime();
}

function nextInterval(s: SrsState, grade: Exclude<Grade, 'again'>): number {
  const { reps, interval, ease } = s;
  let days: number;
  switch (grade) {
    case 'hard':
      days = reps === 0 ? 1 : Math.max(interval + 1, Math.round(interval * 1.2));
      break;
    case 'good':
      days = reps === 0 ? 1 : reps === 1 ? 3 : Math.max(interval + 1, Math.round(interval * ease));
      break;
    case 'easy':
      days = reps === 0 ? 3 : reps === 1 ? 5 : Math.max(interval + 2, Math.round(interval * ease * 1.3));
      break;
  }
  return Math.min(days, MAX_INTERVAL_DAYS);
}

export function schedule(s: SrsState, grade: Grade, now: number): SrsState {
  if (grade === 'again') {
    return {
      due: now + MINUTE,
      interval: 0,
      ease: Math.max(MIN_EASE, s.ease - 0.2),
      reps: 0,
      lapses: s.reps > 0 ? s.lapses + 1 : s.lapses,
      lastReviewed: now,
    };
  }
  const interval = nextInterval(s, grade);
  const easeDelta = grade === 'hard' ? -0.15 : grade === 'easy' ? 0.15 : 0;
  return {
    due: addDays(now, interval),
    interval,
    ease: Math.max(MIN_EASE, Math.round((s.ease + easeDelta) * 100) / 100),
    reps: s.reps + 1,
    lapses: s.lapses,
    lastReviewed: now,
  };
}

/** Cards due at any point today count as due (they become due at midnight). */
export function isDueToday(s: SrsState, now: number): boolean {
  return s.due <= endOfDay(now);
}

/** Human label for the interval a grade would produce, e.g. "1m", "3d", "2mo". */
export function intervalLabel(s: SrsState, grade: Grade): string {
  if (grade === 'again') return '1m';
  return formatDays(nextInterval(s, grade));
}

export function formatDays(days: number): string {
  if (days < 31) return `${days}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${Math.round((days / 365) * 10) / 10}y`;
}
