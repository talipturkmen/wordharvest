// Learn home: streak, daily goal, level, what's due, achievements; starts lessons.
import { getAllCards, getProgress } from '../../shared/storage.ts';
import { getSettings, updateSettings, type Settings } from '../../shared/settings.ts';
import type { Card } from '../../shared/types.ts';
import { languageName } from '../../shared/languages.ts';
import { enrich, enrichWithin } from './enrich.ts';
import { isDueToday } from '../../shared/srs.ts';
import {
  ACHIEVEMENTS, currentStreak, dayKey, levelInfo, streakAtRisk, xpToday, type Progress,
} from '../../shared/progress.ts';
import { buildLesson, lessonLanguage, mulberry32, pickLessonCards, strength } from '../../shared/exercises.ts';
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

/** Languages with saved words, most words first. */
function languagesOf(cards: readonly Card[]): { lang: string; words: number }[] {
  const counts = new Map<string, number>();
  for (const c of cards) counts.set(c.lang, (counts.get(c.lang) ?? 0) + 1);
  return [...counts.entries()].map(([lang, words]) => ({ lang, words })).sort((a, b) => b.words - a.words);
}

/** The selected language, or 'all' if it has no words (e.g. after deleting them). */
function activeLanguage(settings: Settings, cards: readonly Card[]): string {
  return settings.activeLang !== 'all' && cards.some((c) => c.lang === settings.activeLang) ? settings.activeLang : 'all';
}

function renderLangChips(cards: readonly Card[], active: string, now: number): void {
  const langs = languagesOf(cards);
  const box = $('lang-chips');
  box.hidden = langs.length < 2;
  if (box.hidden) return;
  const dueIn = (lang: string) => cards.filter((c) => (lang === 'all' || c.lang === lang) && isDueToday(c.srs, now)).length;
  const chip = (lang: string, label: string, words: number) => {
    const due = dueIn(lang);
    const b = h('button', { class: `lang-chip${lang === active ? ' active' : ''}`, 'aria-pressed': String(lang === active) },
      h('b', { text: label }),
      h('span', { class: 'muted small', text: `${words} word${words === 1 ? '' : 's'}` }),
      due ? h('span', { class: 'due-pill', text: `${due} due` }) : null);
    b.addEventListener('click', async () => {
      await updateSettings({ activeLang: lang });
      await renderHome();
    });
    return b;
  };
  box.replaceChildren(
    ...langs.map((l) => chip(l.lang, languageName(l.lang), l.words)),
    chip('all', 'All languages', cards.length),
  );
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

  // Language switcher; everything below counts the selected language only.
  const active = activeLanguage(settings, cards);
  renderLangChips(cards, active, now);
  const scoped = active === 'all' ? cards : cards.filter((c) => c.lang === active);
  const nextLang = lessonLanguage(cards, now, active, false);
  const multi = languagesOf(cards).length > 1;

  // Call to action
  const due = scoped.filter((c) => isDueToday(c.srs, now));
  const fresh = due.filter((c) => strength(c) === 0).length;
  const reviews = due.length - fresh;
  const practicable = scoped.filter((c) => strength(c) > 0).length;
  const start = $<HTMLButtonElement>('start-lesson');
  const practice = $<HTMLButtonElement>('start-practice');
  if (due.length > 0) {
    $('cta-title').textContent = multi && nextLang ? `Ready for ${languageName(nextLang)}?` : 'Ready for a lesson?';
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

  // Fetch extra sentences for the next lesson's words while the learner looks at this page.
  if (nextLang) void enrich(pickLessonCards(cards, now, false, nextLang), settings);
}

async function begin(practiceMode: boolean): Promise<void> {
  const [cards, settings] = await Promise.all([getAllCards(), getSettings()]);
  setSoundEnabled(settings.soundEffects);
  const now = Date.now();
  const active = activeLanguage(settings, cards);
  const pick = (practice: boolean) => {
    const lang = lessonLanguage(cards, now, active, practice);
    return lang ? pickLessonCards(cards, now, practice, lang) : [];
  };
  let picked = pick(practiceMode);
  if (picked.length === 0 && !practiceMode) {
    // Nothing due any more (e.g. "Another lesson"): fall back to practice.
    practiceMode = true;
    picked = pick(true);
  }
  if (picked.length === 0) {
    await renderHome();
    return;
  }

  // Wait briefly for extra sentences; whatever isn't ready is used next time.
  const start = $<HTMLButtonElement>(practiceMode ? 'start-practice' : 'start-lesson');
  const label = start.textContent;
  start.textContent = 'Preparing…';
  start.disabled = true;
  const enriched = new Map((await enrichWithin(picked, settings, 3000)).map((c) => [c.id, c]));
  start.textContent = label;
  start.disabled = false;
  const all = cards.map((c) => enriched.get(c.id) ?? c);
  picked = picked.map((c) => enriched.get(c.id) ?? c);

  const speech = (lang: string) => settings.listening && canSpeak(lang);
  const exercises = buildLesson(picked, all, mulberry32(now), speech);
  startLesson(exercises, {
    practice: practiceMode,
    all,
    listening: settings.listening,
    onExit: (another) => void (another ? begin(practiceMode) : renderHome()),
  });
}

$('start-lesson').addEventListener('click', () => void begin(false));
$('start-practice').addEventListener('click', () => void begin(true));

/** Start a lesson right away (used by the toolbar popup's "Start lesson"). */
export async function autoStart(): Promise<boolean> {
  const [cards, settings] = await Promise.all([getAllCards(), getSettings()]);
  if (!lessonLanguage(cards, Date.now(), activeLanguage(settings, cards), false)) return false;
  await begin(false);
  return true;
}
