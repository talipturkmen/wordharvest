// Toolbar popup: streak, today's XP against the goal, due words, start a lesson.
import { getAllCards, getProgress } from '../shared/storage.ts';
import { getSettings } from '../shared/settings.ts';
import { isDueToday } from '../shared/srs.ts';
import { currentStreak, streakAtRisk, xpToday } from '../shared/progress.ts';
import { languageName } from '../shared/languages.ts';

const $ = (id: string) => document.getElementById(id)!;

function open(path: string): void {
  void chrome.tabs.create({ url: chrome.runtime.getURL(path) });
  window.close();
}

for (const a of document.querySelectorAll<HTMLAnchorElement>('a[data-open]')) {
  a.addEventListener('click', (e) => {
    e.preventDefault();
    open(a.getAttribute('href')!);
  });
}

void Promise.all([getAllCards(), getProgress(), getSettings()]).then(([cards, progress, settings]) => {
  const now = Date.now();
  const streak = currentStreak(progress, now);
  const today = xpToday(progress, now);
  const lang = settings.activeLang !== 'all' && cards.some((c) => c.lang === settings.activeLang) ? settings.activeLang : null;
  const due = cards.filter((c) => (!lang || c.lang === lang) && isDueToday(c.srs, now)).length;
  if (lang) $('due-label').textContent = `due · ${languageName(lang)}`;

  $('streak').textContent = String(streak);
  $('flame').classList.toggle('off', streak === 0 || streakAtRisk(progress, now));
  $('today').textContent = String(today);
  $('goal').textContent = String(settings.dailyGoal);
  $('goal-bar').style.width = `${Math.min(100, (today / settings.dailyGoal) * 100)}%`;
  $('due').textContent = String(due);

  const nudge = $('nudge');
  if (streakAtRisk(progress, now)) {
    nudge.textContent = `Keep your ${streak}-day streak — do a lesson today!`;
    nudge.hidden = false;
  } else if (cards.length === 0) {
    nudge.textContent = 'Double-click a word on any page to harvest your first word 🌾';
    nudge.hidden = false;
  }

  const start = $('start') as HTMLButtonElement;
  if (due > 0) {
    start.textContent = `Start lesson (${due})`;
    start.addEventListener('click', () => open('review.html#start'));
  } else {
    start.textContent = cards.length ? 'Practice' : 'Open WordHarvest';
    start.addEventListener('click', () => open('review.html#learn'));
  }
});
