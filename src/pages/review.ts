// Review page: a hash router over the Learn, Browse and Import & export views.
import { onCardsChanged, onProgressChanged } from '../shared/storage.ts';
import { autoStart, renderHome } from './learn/home.ts';
import { handleLessonKey, inLesson } from './learn/lesson.ts';
import { loadBrowse } from './review/browse.ts';
import { isEditorOpen } from './review/editor.ts';
import './review/data.ts';

type View = 'learn' | 'browse' | 'data';
const VIEWS: View[] = ['learn', 'browse', 'data'];

function currentView(): View {
  const hash = location.hash.slice(1);
  return VIEWS.includes(hash as View) ? (hash as View) : 'learn'; // also #welcome, #review, #start
}

function show(): void {
  const view = currentView();
  for (const v of VIEWS) document.getElementById(`view-${v}`)!.hidden = v !== view;
  for (const a of document.querySelectorAll<HTMLAnchorElement>('.tabs a')) {
    if (a.dataset.view === view) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  // The lesson and its summary hide the top menu; any other view shows it again.
  if (view !== 'learn') document.body.classList.remove('in-lesson');
  if (view === 'learn' && !inLesson()) void renderHome();
  if (view === 'browse') void loadBrowse();
}

window.addEventListener('hashchange', show);
if (location.hash === '#start') {
  // From the toolbar popup's "Start lesson": go straight into a lesson.
  history.replaceState(null, '', '#learn');
  document.getElementById('view-learn')!.hidden = false;
  void autoStart().then(show);
} else {
  show();
}

// Pick up words saved in other tabs and progress changes.
let refresh: ReturnType<typeof setTimeout> | undefined;
const refreshSoon = () => {
  clearTimeout(refresh);
  refresh = setTimeout(() => {
    const view = currentView();
    if (view === 'browse' && !isEditorOpen()) void loadBrowse();
    if (view === 'learn' && !inLesson() && document.getElementById('summary')!.hidden) void renderHome();
  }, 300);
};
onCardsChanged(refreshSoon);
onProgressChanged(refreshSoon);

document.addEventListener('keydown', (e) => {
  if (currentView() !== 'learn' || isEditorOpen() || e.metaKey || e.ctrlKey || e.altKey) return;
  handleLessonKey(e);
});
