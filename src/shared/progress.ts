// Gamification state: XP, daily goal, streak (with freezes), levels and achievements.
// Pure functions; persistence lives in storage.ts and all writes go through the
// service worker so lesson results and word saves can't overwrite each other.
import type { Card } from './types.ts';
import { strength } from './exercises.ts';

export interface Streak {
  current: number;
  longest: number;
  /** Local day (YYYY-MM-DD) of the last completed lesson. */
  lastDay: string | null;
  /** Each freeze covers one missed day. Earned every 7 streak days. */
  freezes: number;
}

export interface Progress {
  xp: number;
  /** XP earned per local day, YYYY-MM-DD → xp (last 90 days). */
  dailyXp: Record<string, number>;
  streak: Streak;
  lessons: number;
  perfectLessons: number;
  /** Achievement id → unlock time. */
  achievements: Record<string, number>;
}

export const MAX_FREEZES = 2;
export const DAILY_GOALS = [
  { xp: 10, label: 'Casual' },
  { xp: 20, label: 'Regular' },
  { xp: 30, label: 'Serious' },
  { xp: 50, label: 'Intense' },
] as const;

export function emptyProgress(): Progress {
  return {
    xp: 0,
    dailyXp: {},
    streak: { current: 0, longest: 0, lastDay: null, freezes: 0 },
    lessons: 0,
    perfectLessons: 0,
    achievements: {},
  };
}

export function dayKey(t: number): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Whole local days from day key `a` to day key `b` (DST-safe). */
export function daysBetween(a: string, b: string): number {
  const noon = (k: string) => {
    const [y, m, d] = k.split('-').map(Number) as [number, number, number];
    return new Date(y, m - 1, d, 12).getTime();
  };
  return Math.round((noon(b) - noon(a)) / 86_400_000);
}

export function addXp(p: Progress, amount: number, now: number): Progress {
  const today = dayKey(now);
  const dailyXp: Record<string, number> = {};
  for (const [k, v] of Object.entries(p.dailyXp)) {
    if (daysBetween(k, today) < 90) dailyXp[k] = v;
  }
  dailyXp[today] = (dailyXp[today] ?? 0) + amount;
  return { ...p, xp: p.xp + amount, dailyXp };
}

export function xpToday(p: Progress, now: number): number {
  return p.dailyXp[dayKey(now)] ?? 0;
}

/** The streak as it stands now: 0 if it was broken by missed days not covered by freezes. */
export function currentStreak(p: Progress, now: number): number {
  const { lastDay, current, freezes } = p.streak;
  if (!lastDay) return 0;
  const missed = daysBetween(lastDay, dayKey(now)) - 1;
  return missed <= freezes ? current : 0;
}

/** True when the streak is alive but today's lesson hasn't been done yet. */
export function streakAtRisk(p: Progress, now: number): boolean {
  return currentStreak(p, now) > 0 && p.streak.lastDay !== dayKey(now);
}

export interface LessonOutcome {
  progress: Progress;
  streakExtended: boolean;
  freezesUsed: number;
  freezeEarned: boolean;
}

/** Records a finished lesson: XP, lesson counters and the streak. */
export function completeLesson(p: Progress, now: number, xp: number, perfect: boolean): LessonOutcome {
  const today = dayKey(now);
  let { current, longest, lastDay, freezes } = p.streak;
  let streakExtended = false;
  let freezesUsed = 0;
  let freezeEarned = false;

  if (lastDay !== today) {
    const missed = lastDay ? daysBetween(lastDay, today) - 1 : Infinity;
    if (missed === 0) current += 1;
    else if (missed <= freezes) {
      freezes -= missed;
      freezesUsed = missed;
      current += 1;
    } else current = 1;
    lastDay = today;
    streakExtended = true;
    if (current % 7 === 0 && freezes < MAX_FREEZES) {
      freezes += 1;
      freezeEarned = true;
    }
    longest = Math.max(longest, current);
  }

  const withXp = addXp(p, xp, now);
  return {
    progress: {
      ...withXp,
      streak: { current, longest, lastDay, freezes },
      lessons: p.lessons + 1,
      perfectLessons: p.perfectLessons + (perfect ? 1 : 0),
    },
    streakExtended,
    freezesUsed,
    freezeEarned,
  };
}

// ---- levels ---------------------------------------------------------------------

/** Total XP needed to reach `level`: 0, 100, 300, 600, 1000, … */
function threshold(level: number): number {
  return 50 * level * (level - 1);
}

export function levelInfo(xp: number): { level: number; into: number; needed: number } {
  let level = 1;
  while (xp >= threshold(level + 1)) level++;
  return { level, into: xp - threshold(level), needed: threshold(level + 1) - threshold(level) };
}

// ---- achievements -----------------------------------------------------------------

export interface AchievementContext {
  progress: Progress;
  cards: readonly Card[];
}

export interface Achievement {
  id: string;
  icon: string;
  title: string;
  description: string;
  unlocked(ctx: AchievementContext): boolean;
}

const languages = (cards: readonly Card[]) => new Set(cards.map((c) => c.lang)).size;
const mastered = (cards: readonly Card[]) => cards.filter((c) => strength(c) === 5).length;

export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: 'first-harvest', icon: '🌱', title: 'First harvest', description: 'Save your first word', unlocked: (c) => c.cards.length >= 1 },
  { id: 'harvest-25', icon: '🌾', title: 'Gatherer', description: 'Save 25 words', unlocked: (c) => c.cards.length >= 25 },
  { id: 'harvest-100', icon: '🧺', title: 'Full barn', description: 'Save 100 words', unlocked: (c) => c.cards.length >= 100 },
  { id: 'first-lesson', icon: '🎯', title: 'First lesson', description: 'Finish a lesson', unlocked: (c) => c.progress.lessons >= 1 },
  { id: 'flawless', icon: '💯', title: 'Flawless', description: 'Finish a lesson without mistakes', unlocked: (c) => c.progress.perfectLessons >= 1 },
  { id: 'streak-3', icon: '🔥', title: 'On fire', description: 'Reach a 3-day streak', unlocked: (c) => c.progress.streak.longest >= 3 },
  { id: 'streak-7', icon: '⚡', title: 'Week warrior', description: 'Reach a 7-day streak', unlocked: (c) => c.progress.streak.longest >= 7 },
  { id: 'streak-30', icon: '🏆', title: 'Unstoppable', description: 'Reach a 30-day streak', unlocked: (c) => c.progress.streak.longest >= 30 },
  { id: 'xp-500', icon: '⭐', title: 'Rising star', description: 'Earn 500 XP', unlocked: (c) => c.progress.xp >= 500 },
  { id: 'master-10', icon: '🧠', title: 'Mastermind', description: 'Master 10 words', unlocked: (c) => mastered(c.cards) >= 10 },
  { id: 'polyglot', icon: '🌍', title: 'Polyglot', description: 'Save words in 3 languages', unlocked: (c) => languages(c.cards) >= 3 },
];

/** Unlocks newly earned achievements; returns the updated progress and the new ones. */
export function unlockAchievements(ctx: AchievementContext, now: number): { progress: Progress; unlocked: Achievement[] } {
  const unlocked = ACHIEVEMENTS.filter((a) => !ctx.progress.achievements[a.id] && a.unlocked(ctx));
  if (unlocked.length === 0) return { progress: ctx.progress, unlocked };
  const achievements = { ...ctx.progress.achievements };
  for (const a of unlocked) achievements[a.id] = now;
  return { progress: { ...ctx.progress, achievements }, unlocked };
}
