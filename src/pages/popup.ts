// Toolbar popup: counts and shortcuts into the review page.
import { getStats } from '../shared/storage.ts';

const $ = (id: string) => document.getElementById(id)!;

function open(path: string): void {
  void chrome.tabs.create({ url: chrome.runtime.getURL(path) });
  window.close();
}

$('start').addEventListener('click', () => open('review.html#review'));
for (const a of document.querySelectorAll<HTMLAnchorElement>('a[data-open]')) {
  a.addEventListener('click', (e) => {
    e.preventDefault();
    open(a.getAttribute('href')!);
  });
}

void getStats().then(({ total, dueToday }) => {
  $('total').textContent = String(total);
  $('due').textContent = String(dueToday);
  $('start').textContent = dueToday > 0 ? `Start review (${dueToday})` : total > 0 ? 'Review — all caught up' : 'Start review';
});
