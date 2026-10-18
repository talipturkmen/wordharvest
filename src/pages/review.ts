// Review page: a hash router over the Review, Browse and Import & export views.
import { onCardsChanged } from '../shared/storage.ts';
import { handleKey, inSession, startSession } from './review/session.ts';
import { loadBrowse } from './review/browse.ts';
import { isEditorOpen } from './review/editor.ts';
import './review/data.ts';

type View = 'review' | 'browse' | 'data';
const VIEWS: View[] = ['review', 'browse', 'data'];

function currentView(): View {
  const hash = location.hash.slice(1);
  return VIEWS.includes(hash as View) ? (hash as View) : 'review';
}

function show(): void {
  const view = currentView();
  for (const v of VIEWS) document.getElementById(`view-${v}`)!.hidden = v !== view;
  for (const a of document.querySelectorAll<HTMLAnchorElement>('.tabs a')) {
    if (a.dataset.view === view) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  if (view === 'review' && !inSession()) void startSession();
  if (view === 'browse') void loadBrowse();
}

window.addEventListener('hashchange', show);
show();

// Pick up words saved in other tabs.
let refresh: ReturnType<typeof setTimeout> | undefined;
onCardsChanged(() => {
  clearTimeout(refresh);
  refresh = setTimeout(() => {
    const view = currentView();
    if (view === 'browse' && !isEditorOpen()) void loadBrowse();
    if (view === 'review' && !inSession()) void startSession(false);
  }, 300);
});

document.addEventListener('keydown', (e) => {
  if (currentView() !== 'review' || isEditorOpen() || e.metaKey || e.ctrlKey || e.altKey) return;
  const t = e.target as HTMLElement;
  if (t.closest('input, textarea, select, a')) return;
  if (t.tagName === 'BUTTON' && (e.key === ' ' || e.key === 'Enter') && t.id !== 'rv-show') return;
  handleKey(e);
});
