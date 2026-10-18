// Generates icons, store screenshots and the promo tile with headless Chrome.
// The screenshots render the real built pages (dist/) with a mocked chrome.* API
// and sample data, so run `npm run build` first (`npm run store-assets` does).
//
// Uses your installed Chrome; set CHROME_PATH if it isn't in the default location.
import puppeteer from 'puppeteer-core';
import { mkdir, readFile, copyFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { iconSvg } from '../assets/icon.mjs';
import { sampleStorage, sampleLessonResult, DICTIONARY } from './screenshots/sample-data.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const out = (...p) => path.join(root, ...p);
const fileUrl = (p) => pathToFileURL(p).href;

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].filter(Boolean);
const executablePath = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!executablePath) throw new Error('Chrome not found. Set CHROME_PATH.');
if (!existsSync(path.join(dist, 'manifest.json'))) throw new Error('Run `npm run build` first.');

const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--force-color-profile=srgb'] });
const mockSource = await readFile(out('scripts/screenshots/chrome-mock.js'), 'utf8');

async function newPage(width, height, { mock = false, lang = 'es', dark = false } = {}) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: dark ? 'dark' : 'light' }]);
  if (mock) {
    const data = { storage: sampleStorage(), dictionary: DICTIONARY, lang, lessonResult: sampleLessonResult() };
    await page.evaluateOnNewDocument(`${mockSource}\ninstallChromeMock(${JSON.stringify(data)});`);
  }
  return page;
}

/** Clicks Check/Continue if it's visible and enabled. */
const press = (page) =>
  page.evaluate(() => {
    const b = document.getElementById('check');
    if (b && !b.disabled && b.offsetParent) b.click();
  });

/** Answers the current exercise correctly, using the (mocked) saved cards. */
async function solve(page) {
  await page.evaluate(async () => {
    const cards = Object.values(await chrome.storage.local.get(null)).filter((v) => v && v.examples);
    const ex = document.getElementById('exercise');
    const text = (sel) => ex.querySelector(sel)?.textContent.trim();
    if (ex.querySelector('.match')) {
      for (const w of ex.querySelectorAll('.tile[data-side="w"]')) {
        w.click();
        ex.querySelector(`.tile[data-side="t"][data-id="${w.dataset.id}"]`).click();
      }
      return;
    }
    if (ex.querySelector('.intro-card')) return;
    const sentence = ex.querySelector('.ex-sentence');
    let answer;
    if (sentence) {
      const before = sentence.firstChild.textContent;
      const after = sentence.lastChild.textContent;
      for (const c of cards) for (const e of c.examples) {
        if (e.sentence.startsWith(before) && e.sentence.endsWith(after)) answer = e.sentence.slice(before.length, e.sentence.length - after.length);
      }
    } else {
      const prompt = text('.big-word');
      const label = text('.ex-label');
      const card = cards.find((c) => c.term === prompt || c.translation === prompt);
      if (card) answer = /mean\?$/.test(label) ? card.translation : card.term;
    }
    const option = [...ex.querySelectorAll('.choice, .chip')].find((b) => b.lastChild.textContent === answer);
    if (option) option.click();
    const input = ex.querySelector('input');
    if (input) {
      input.value = answer ?? '';
      input.dispatchEvent(new Event('input'));
    }
  });
}

// ---- icons ----------------------------------------------------------------------
await mkdir(out('public/icons'), { recursive: true });
await mkdir(out('store/icons'), { recursive: true });
for (const size of [16, 32, 48, 128]) {
  const svg = iconSvg(size, { simple: size <= 32, padding: size === 128 ? 16 : size === 48 ? 2 : 0 });
  const page = await newPage(size, size);
  await page.setContent(`<style>html,body{margin:0;background:transparent}</style>${svg}`);
  const file = out('public/icons', `icon-${size}.png`);
  await page.screenshot({ path: file, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  await copyFile(file, out('store/icons', `icon-${size}.png`));
  await page.close();
}
console.log('icons ✓');

// ---- screenshots ---------------------------------------------------------------
await mkdir(out('store/screenshots'), { recursive: true });
const shot = (name) => out('store/screenshots', name);

// 1. Double-click popup on a real article, using the built content script.
{
  const page = await newPage(1280, 800, { mock: true });
  await page.goto(fileUrl(out('scripts/screenshots/article.html')));
  await page.addScriptTag({ path: path.join(dist, 'content.js') });
  await page.evaluate(() => {
    const p = document.getElementById('target');
    const text = p.firstChild;
    const start = text.data.indexOf('atrevidos');
    const range = document.createRange();
    range.setStart(text, start);
    range.setEnd(text, start + 'atrevidos'.length);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    const r = range.getBoundingClientRect();
    p.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, composed: true, clientX: r.left + 5, clientY: r.top + 5 }));
  });
  await new Promise((r) => setTimeout(r, 400));
  await page.screenshot({ path: shot('1-translate-popup.png') });
  await page.close();
}

// 2. Learn home: streak, daily goal, level, achievements.
{
  const page = await newPage(1280, 800, { mock: true });
  await page.goto(fileUrl(path.join(dist, 'review.html')) + '#learn');
  await page.waitForSelector('#start-lesson:not([hidden])');
  await new Promise((r) => setTimeout(r, 800)); // ring/bar transitions
  await page.screenshot({ path: shot('2-learn-home.png') });

  // 3. A fill-in-the-blank exercise, answered correctly.
  await page.click('#start-lesson');
  await page.waitForSelector('#lesson:not([hidden])');
  for (let i = 0; i < 30 && !(await page.$('#exercise .chips')); i++) {
    await solve(page);
    await press(page);
    if (await page.$('#lesson-footer.good, #lesson-footer.bad')) await press(page);
  }
  await solve(page);
  await press(page);
  await new Promise((r) => setTimeout(r, 300));
  await page.mouse.move(0, 0);
  await page.screenshot({ path: shot('3-lesson.png') });

  // 4. Lesson summary: play to the end.
  await press(page); // continue past the screenshotted answer
  for (let i = 0; i < 40 && (await page.$('#lesson:not([hidden])')); i++) {
    await solve(page);
    await press(page);
    if (await page.$('#lesson-footer.good, #lesson-footer.bad')) await press(page);
    await new Promise((r) => setTimeout(r, 400)); // a realistic lesson time on the summary
  }
  await page.waitForSelector('#summary:not([hidden])');
  await new Promise((r) => setTimeout(r, 700)); // let the confetti spread a little
  await page.screenshot({ path: shot('4-lesson-complete.png') });
  await page.close();
}

// 5. Toolbar popup + settings, framed with captions.
{
  const page = await newPage(1280, 800, { mock: true });
  await page.goto(fileUrl(out('scripts/screenshots/frame.html')));
  await new Promise((r) => setTimeout(r, 800));
  await page.screenshot({ path: shot('5-popup-and-settings.png') });
  await page.close();
}
console.log('screenshots ✓');

// ---- promo tile 440×280 -------------------------------------------------------------
{
  const page = await newPage(440, 280);
  await page.setContent(`<!doctype html><html><head><style>
    body { margin: 0; width: 440px; height: 280px; display: flex; align-items: center; gap: 22px; padding: 0 36px;
           box-sizing: border-box; font-family: system-ui, -apple-system, sans-serif; color: #fff;
           background: radial-gradient(circle at 85% 15%, #818cf8, transparent 55%), linear-gradient(135deg, #4f46e5, #312e81); }
    h1 { margin: 0 0 6px; font-size: 34px; letter-spacing: -.02em; }
    p { margin: 0; font-size: 17px; line-height: 1.35; opacity: .92; }
    mark { background: #fbbf24; color: #1f2330; border-radius: 4px; padding: 0 4px; }
  </style></head><body>
    ${iconSvg(104, { simple: false })}
    <div><h1>WordHarvest</h1><p>Double-click a <mark>word</mark>,<br>keep the sentence,<br>learn it daily 🔥</p></div>
  </body></html>`);
  await page.screenshot({ path: out('store', 'promo-small-440x280.png') });
  await page.close();
}
console.log('promo tile ✓');

await browser.close();
