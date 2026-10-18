import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addXp, completeLesson, currentStreak, dayKey, daysBetween, emptyProgress, levelInfo,
  streakAtRisk, unlockAchievements, xpToday,
} from '../src/shared/progress.ts';
import { applySave } from '../src/shared/cards.ts';

const day = (n: number) => new Date(2026, 2, n, 18).getTime(); // March n, 18:00 local (crosses DST)

test('dayKey and daysBetween use local days', () => {
  assert.equal(dayKey(day(5)), '2026-03-05');
  assert.equal(daysBetween('2026-03-05', '2026-03-09'), 4);
  assert.equal(daysBetween('2026-02-28', '2026-03-01'), 1);
});

test('streak grows one per day, not per lesson', () => {
  let p = emptyProgress();
  p = completeLesson(p, day(1), 10, false).progress;
  p = completeLesson(p, day(1) + 3600_000, 10, false).progress;
  assert.equal(p.streak.current, 1);
  const r = completeLesson(p, day(2), 10, false);
  assert.equal(r.streakExtended, true);
  assert.equal(r.progress.streak.current, 2);
  assert.equal(r.progress.lessons, 3);
});

test('missing a day without freezes resets the streak', () => {
  let p = completeLesson(emptyProgress(), day(1), 10, false).progress;
  p = completeLesson(p, day(2), 10, false).progress;
  assert.equal(currentStreak(p, day(3)), 2);
  assert.equal(streakAtRisk(p, day(3)), true);
  assert.equal(currentStreak(p, day(4)), 0);
  p = completeLesson(p, day(4), 10, false).progress;
  assert.equal(p.streak.current, 1);
  assert.equal(p.streak.longest, 2);
});

test('a 7-day streak earns a freeze that covers a missed day', () => {
  let p = emptyProgress();
  let earned = false;
  for (let d = 1; d <= 7; d++) {
    const r = completeLesson(p, day(d), 10, false);
    p = r.progress;
    earned ||= r.freezeEarned;
  }
  assert.ok(earned);
  assert.equal(p.streak.freezes, 1);
  // Skip day 8; the freeze keeps the streak alive.
  assert.equal(currentStreak(p, day(9)), 7);
  const r = completeLesson(p, day(9), 10, false);
  assert.equal(r.freezesUsed, 1);
  assert.equal(r.progress.streak.current, 8);
  assert.equal(r.progress.streak.freezes, 0);
});

test('XP is tracked per day', () => {
  let p = addXp(emptyProgress(), 7, day(1));
  p = addXp(p, 5, day(1));
  p = addXp(p, 3, day(2));
  assert.equal(p.xp, 15);
  assert.equal(xpToday(p, day(1)), 12);
  assert.equal(xpToday(p, day(2)), 3);
});

test('levels: 0, 100, 300, 600 XP thresholds', () => {
  assert.deepEqual(levelInfo(0), { level: 1, into: 0, needed: 100 });
  assert.deepEqual(levelInfo(150), { level: 2, into: 50, needed: 200 });
  assert.equal(levelInfo(600).level, 4);
});

test('achievements unlock once', () => {
  const card = applySave(undefined, { term: 'gato', lang: 'es', translation: 'cat' }, 0).card;
  let p = completeLesson(emptyProgress(), day(1), 15, true).progress;
  const first = unlockAchievements({ progress: p, cards: [card] }, 1);
  assert.deepEqual(first.unlocked.map((a) => a.id).sort(), ['first-harvest', 'first-lesson', 'flawless']);
  p = first.progress;
  assert.equal(unlockAchievements({ progress: p, cards: [card] }, 2).unlocked.length, 0);
});
