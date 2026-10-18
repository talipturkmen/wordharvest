import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAY, MINUTE, isDueToday, newSrs, schedule, startOfDay } from '../src/shared/srs.ts';

const now = new Date(2026, 0, 10, 15, 30).getTime();
const daysFromToday = (t: number) => Math.round((startOfDay(t) - startOfDay(now)) / DAY);

test('new card: good → 1 day, then 3 days, then interval × ease', () => {
  let s = newSrs(now);
  s = schedule(s, 'good', now);
  assert.equal(s.interval, 1);
  assert.equal(daysFromToday(s.due), 1);
  assert.equal(s.due, startOfDay(s.due), 'due at local midnight');

  s = schedule(s, 'good', s.due);
  assert.equal(s.interval, 3);
  s = schedule(s, 'good', s.due);
  assert.equal(s.interval, Math.round(3 * 2.5));
  assert.equal(s.reps, 3);
});

test('again resets reps, lowers ease, counts a lapse only for learned cards', () => {
  const fresh = schedule(newSrs(now), 'again', now);
  assert.equal(fresh.lapses, 0);
  assert.equal(fresh.due, now + MINUTE);
  assert.equal(fresh.ease, 2.3);

  const learned = schedule(schedule(newSrs(now), 'good', now), 'good', now);
  const lapsed = schedule(learned, 'again', now);
  assert.equal(lapsed.reps, 0);
  assert.equal(lapsed.interval, 0);
  assert.equal(lapsed.lapses, 1);
});

test('ease never drops below 1.3', () => {
  let s = newSrs(now);
  for (let i = 0; i < 20; i++) s = schedule(s, 'again', now);
  assert.equal(s.ease, 1.3);
});

test('easy > good > hard intervals for a learned card', () => {
  const s = { due: now, interval: 10, ease: 2.5, reps: 3, lapses: 0 };
  const hard = schedule(s, 'hard', now).interval;
  const good = schedule(s, 'good', now).interval;
  const easy = schedule(s, 'easy', now).interval;
  assert.ok(hard < good && good < easy, `${hard} < ${good} < ${easy}`);
  assert.ok(hard > s.interval, 'hard still grows the interval');
});

test('isDueToday counts anything due before midnight', () => {
  const lateToday = new Date(2026, 0, 10, 23, 0).getTime();
  assert.ok(isDueToday({ ...newSrs(now), due: lateToday }, now));
  assert.ok(!isDueToday({ ...newSrs(now), due: lateToday + 2 * 3600_000 }, now));
});
