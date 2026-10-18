// Learn home: streak, daily goal, level, what's due, achievements; starts lessons.
import { getAllCards, getProgress } from '../../shared/storage.ts';
import { getSettings } from '../../shared/settings.ts';
import { isDueToday } from '../../shared/srs.ts';
import {
  ACHIEVEMENTS, currentStreak, dayKey, levelInfo, streakAtRisk, xpToday, type Progress,
} from '../../shared/progress.ts';
import { buildLesson, mulberry32, pickLessonCards, strength } from '../../shared/exercises.ts';
import { $, h } from '../dom.ts';
import { canSpeak, setSoundEnabled } from '../fx.ts';
import { inLesson, startLesson } from './lesson.ts';

const DAY_LETTERS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function renderWeek(p: Progress, goal: number, now: number): void {
  const days = Array.from({ length: 7 }, (_, i) => now - (6 - i) * 86_400_000);
  $('week').replaceChildren(
    ...days.map((t) => {
      const xp = p.dailyXp[dayKey(t)] ?? 0;
      const state = xp >= goal ? 'met' : xp > 0 ? 'some' : 'none';
      const isToday = dayKey(t) === dayKey(now);
      return h('div', { class: `day ${state}${isToday ? ' today' : ''}`, title: `${xp} XP` },
        h('span', { class: 'dot', text: state === 'met' ? '🔥' : '' }),
        h('span', { class: 'day-label', text: DAY_LETTERS[new Date(t).getDay()]! }));
    }),
  );
}

function renderBadges(p: Progress): void {
  $('badges').replaceChildren(
    ...ACHIEVEMENTS.map((a) => {
      const got = !!p.achievements[a.id];
      return h('div', { class: `badge-item${got ? ' got' : ''}`, title: got ? `Unlocked ${new Date(p.achievements[a.id]!).toLocaleDateString()}` : 'Locked' },
        h('span', { class: 'badge-icon', text: a.icon }),
        h('b', { text: a.title }),
        h('span', { class: 'muted small', text: a.description }));
    }),
  );
}

function welcome(): HTMLElement[] {
  return [
    h('div', { class: 'big', text: '🌾' }),
    h('h2', { text: 'Welcome to WordHarvest' }),
    h('ol', {},
      h('li', { text: 'Open any article in a language you are learning.' }),
      h('li', { text: 'Double-click a word you don’t know to see its translation.' }),
      h('li', { text: 'Click Save — every word you harvest earns XP.' }),
      h('li', { text: 'Come back here for short lessons and keep your streak alive 🔥' }),
    ),
    h('p', { class: 'muted' }, 'Tip: choose your language, daily goal and auto-save in ', h('a', { href: 'options.html', text: 'Settings' }), '.'),
  ];
}

export async function renderHome(): Promise<void> {
  const [cards, progress, settings] = await Promise.all([getAllCards(), getProgress(), getSettings()]);
  setSoundEnabled(settings.soundEffects);
  if (inLesson()) return; // a lesson started while we were loading
  const now = Date.now();
  $('home').hidden = false;

  const empty = cards.length === 0;
  $('home-welcome').hidden = !empty;
  if (empty) $('home-welcome').replaceChildren(...welcome());

  // Streak
  const streak = currentStreak(progress, now);
  $('streak-count').textContent = String(streak);
  $('streak-flame').classList.toggle('off', streak === 0 || streakAtRisk(progress, now));
  renderWeek(progress, settings.dailyGoal, now);
  const freezes = progress.streak.freezes;
  $('streak-note').textContent =
    (streakAtRisk(progress, now) ? 'Finish a lesson today to keep your streak!' : streak > 0 ? 'Streak safe for today ✓' : 'Finish a lesson to start a streak.') +
    (freezes ? ` · ❄️ ${freezes} freeze${freezes > 1 ? 's' : ''}` : '');

  // Daily goal
  const today = xpToday(progress, now);
  const goal = settings.dailyGoal;
  $('goal-xp').textContent = String(today);
  $('goal-target').textContent = String(goal);
  const pct = Math.min(1, today / goal);
  $('goal-ring').setAttribute('stroke-dasharray', `${pct * 100} 100`);
  $('goal-ring').classList.toggle('done', pct >= 1);
  $('goal-note').textContent = pct >= 1 ? 'Daily goal reached! 🎉' : `${goal - today} XP to go`;

  // Level
  const lv = levelInfo(progress.xp);
  $('level').textContent = String(lv.level);
  $('xp-total').textContent = String(progress.xp);
  $('level-bar').style.width = `${(lv.into / lv.needed) * 100}%`;
  const mastered = cards.filter((c) => strength(c) === 5).length;
  $('level-note').textContent = `${lv.needed - lv.into} XP to level ${lv.level + 1} · ${mastered} word${mastered === 1 ? '' : 's'} mastered`;

  // Call to action
  const due = cards.filter((c) => isDueToday(c.srs, now));
  const fresh = due.filter((c) => strength(c) === 0).length;
  const reviews = due.length - fresh;
  const practicable = cards.filter((c) => strength(c) > 0).length;
  const start = $<HTMLButtonElement>('start-lesson');
  const practice = $<HTMLButtonElement>('start-practice');
  if (due.length > 0) {
    $('cta-title').textContent = 'Ready for a lesson?';
    $('cta-sub').textContent = [fresh ? `${fresh} new word${fresh > 1 ? 's' : ''}` : '', reviews ? `${reviews} to review` : ''].filter(Boolean).join(' · ');
    start.hidden = false;
    practice.hidden = practicable === 0;
  } else {
    $('cta-title').textContent = empty ? 'Harvest some words first' : 'All caught up! 🎉';
    $('cta-sub').textContent = empty ? 'Double-click words on any web page to save them.' : 'Nothing is due right now. Practice your weakest words for extra XP.';
    start.hidden = true;
    practice.hidden = practicable === 0;
  }
  $('home-main').hidden = false;
  document.querySelector('.cta')!.toggleAttribute('hidden', empty);

  renderBadges(progress);
}

async function begin(practiceMode: boolean): Promise<void> {
  const [cards, settings] = await Promise.all([getAllCards(), getSettings()]);
  setSoundEnabled(settings.soundEffects);
  let picked = pickLessonCards(cards, Date.now(), practiceMode);
  if (picked.length === 0 && !practiceMode) {
    // Nothing due any more (e.g. "Another lesson"): fall back to practice.
    practiceMode = true;
    picked = pickLessonCards(cards, Date.now(), true);
  }
  if (picked.length === 0) {
    await renderHome();
    return;
  }
  const speech = (lang: string) => settings.listening && canSpeak(lang);
  const exercises = buildLesson(picked, cards, mulberry32(Date.now()), speech);
  startLesson(exercises, {
    practice: practiceMode,
    all: cards,
    listening: settings.listening,
    onExit: (another) => void (another ? begin(practiceMode) : renderHome()),
  });
}

$('start-lesson').addEventListener('click', () => void begin(false));
$('start-practice').addEventListener('click', () => void begin(true));

/** Start a lesson right away (used by the toolbar popup's "Start lesson"). */
export async function autoStart(): Promise<boolean> {
  const cards = await getAllCards();
  if (!cards.some((c) => isDueToday(c.srs, Date.now()))) return false;
  await begin(false);
  return true;
}
