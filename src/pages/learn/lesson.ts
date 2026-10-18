// A Duolingo-style lesson: a queue of exercises, auto-checked answers, combo,
// XP and a summary. Answers feed the SM-2 schedule; mistakes come back at the end.
import type { Card } from '../../shared/types.ts';
import { putCards } from '../../shared/storage.ts';
import { schedule } from '../../shared/srs.ts';
import {
  checkAnswer, gradeFor, mulberry32, retryFor, shuffle, type AnswerResult, type Exercise,
} from '../../shared/exercises.ts';
import { ACHIEVEMENTS } from '../../shared/progress.ts';
import { send, type LessonResult } from '../../shared/messages.ts';
import { languageName } from '../../shared/languages.ts';
import type { Context } from '../../shared/contexts.ts';
import { $, h, renderHighlighted } from '../dom.ts';
import { confetti, sound, speak } from '../fx.ts';

const XP = { answer: 1, comboBonus: 1, lesson: 10, practice: 5, perfect: 5 };
const COMBO_BONUS_FROM = 5;
const PRAISE = ['Nice!', 'Great job!', 'Excellent!', 'You got it!', 'Awesome!', 'Correct!'];

interface State {
  exercises: Exercise[];
  index: number;
  practice: boolean;
  all: Card[];
  graded: Set<string>;
  retried: Set<string>;
  answered: number;
  correct: number;
  mistakes: number;
  combo: number;
  bestCombo: number;
  xp: number;
  startedAt: number;
  listening: boolean;
  onExit: (another: boolean) => void;
}

type Checker = () => { result: AnswerResult; expected: string; typed: boolean };

let st: State | null = null;
let checker: Checker | null = null;
let phase: 'answer' | 'feedback' = 'answer';
let rng = mulberry32(Date.now());

const exerciseEl = $('exercise');
const checkBtn = $<HTMLButtonElement>('check');
const skipBtn = $<HTMLButtonElement>('skip');
const feedback = $('feedback');
const footer = $('lesson-footer');

export function inLesson(): boolean {
  return st !== null;
}

export function startLesson(
  exercises: Exercise[],
  opts: { practice: boolean; all: Card[]; listening: boolean; onExit: (another: boolean) => void },
): void {
  rng = mulberry32(Date.now());
  st = {
    exercises, index: 0, practice: opts.practice, all: opts.all, listening: opts.listening, onExit: opts.onExit,
    graded: new Set(), retried: new Set(), answered: 0, correct: 0, mistakes: 0, combo: 0, bestCombo: 0, xp: 0,
    startedAt: Date.now(),
  };
  document.body.classList.add('in-lesson');
  $('home').hidden = true;
  $('summary').hidden = true;
  $('lesson').hidden = false;
  render();
}

function exit(another = false): void {
  const onExit = st?.onExit;
  st = null;
  checker = null;
  document.body.classList.remove('in-lesson');
  $('lesson').hidden = true;
  $('summary').hidden = true;
  onExit?.(another);
}

// ---- rendering ---------------------------------------------------------------------

function speakerButton(card: Card, big = false): HTMLButtonElement {
  const b = h('button', { class: big ? 'speaker big' : 'speaker', title: 'Listen', 'aria-label': `Listen to ${card.term}`, text: '🔊' });
  b.addEventListener('click', () => speak(card.term, card.lang));
  return b;
}

function label(text: string): HTMLElement {
  return h('h2', { class: 'ex-label', text });
}

function setCheckable(on: boolean): void {
  checkBtn.disabled = !on;
}

/** Multiple choice; `onPick` lets cloze fill the blank as you choose. */
function choices(options: string[], answer: string, onPick?: (o: string) => void, chips = false): HTMLElement {
  let picked: string | null = null;
  const buttons = options.map((o, i) => {
    const b = h('button', { class: chips ? 'chip' : 'choice', 'data-key': String(i + 1) }, h('kbd', { text: String(i + 1) }), h('span', { text: o }));
    b.addEventListener('click', () => {
      if (phase !== 'answer') return;
      picked = o;
      for (const x of buttons) x.classList.toggle('selected', x === b);
      onPick?.(o);
      setCheckable(true);
    });
    return b;
  });
  checker = () => {
    for (const [i, b] of buttons.entries()) {
      b.disabled = true;
      if (options[i] === answer) b.classList.add('right');
      else if (options[i] === picked) b.classList.add('wrong');
    }
    return { result: picked === answer ? 'correct' : 'wrong', expected: answer, typed: false };
  };
  return h('div', { class: chips ? 'chips' : 'choices' }, ...buttons);
}

function textInput(answer: string, inline: boolean): HTMLInputElement {
  const input = h('input', {
    type: 'text', class: inline ? 'blank-input' : 'answer-input', autocomplete: 'off', autocapitalize: 'off',
    spellcheck: 'false', 'aria-label': 'Your answer', placeholder: inline ? '' : 'Type your answer',
  });
  if (inline) input.style.width = `${Math.max(4, answer.length + 2)}ch`;
  input.addEventListener('input', () => setCheckable(input.value.trim().length > 0));
  checker = () => {
    input.disabled = true;
    const result = checkAnswer(input.value, answer);
    input.classList.add(result === 'wrong' ? 'wrong' : 'right');
    return { result, expected: answer, typed: true };
  };
  setTimeout(() => input.focus(), 0);
  return input;
}

function sentenceWithBlank(before: string, after: string, blank: HTMLElement): HTMLElement {
  return h('p', { class: 'ex-sentence' }, before, blank, after);
}

/** Where a sentence came from; Tatoeba sentences must be credited (CC BY). */
function credit(ctx: Context): HTMLElement | null {
  if (ctx.source === 'tatoeba') {
    return h('a', { class: 'credit', href: ctx.ref ?? 'https://tatoeba.org', target: '_blank', rel: 'noopener', text: ctx.credit ?? 'Tatoeba · CC BY 2.0 FR' });
  }
  if (ctx.source === 'reading') return h('span', { class: 'credit', text: 'From your reading' });
  return null;
}

function sentenceSpeaker(ctx: Context, lang: string): HTMLButtonElement {
  const b = h('button', { class: 'speaker small', title: 'Listen to the sentence', 'aria-label': 'Listen to the sentence', text: '🔊' });
  b.addEventListener('click', () => speak(ctx.sentence, lang));
  return b;
}

function hintLine(text: string | undefined): HTMLElement | null {
  return text ? h('p', { class: 'ex-hint', text }) : null;
}

function render(): void {
  if (!st) return;
  const ex = st.exercises[st.index]!;
  phase = 'answer';
  checker = null;
  footer.className = 'lesson-footer';
  feedback.replaceChildren();
  checkBtn.textContent = 'Check';
  setCheckable(false);
  skipBtn.hidden = ex.kind === 'intro' || ex.kind === 'match';
  $('lesson-progress').style.width = `${(st.index / st.exercises.length) * 100}%`;
  renderCombo();

  const body: (HTMLElement | null)[] = [];
  switch (ex.kind) {
    case 'intro': {
      const [first, ...more] = ex.contexts;
      const sentence = (ctx: Context, cls: string) => {
        const p = h('p', { class: cls });
        renderHighlighted(p, ctx.sentence, ctx.word);
        return p;
      };
      body.push(
        h('div', { class: 'new-badge', text: 'New word' }),
        h('div', { class: 'intro-card' },
          h('div', { class: 'word-row' }, h('span', { class: 'big-word', text: ex.card.term }), speakerButton(ex.card)),
          h('div', { class: 'meaning', text: ex.card.translation }),
          first ? sentence(first, 'ex-sentence small') : null,
          hintLine(first?.translation),
          more.length
            ? h('div', { class: 'more-examples' },
                h('div', { class: 'lang-note', text: 'More examples' }),
                ...more.slice(0, 3).map((ctx) => h('div', { class: 'more-example' },
                  sentence(ctx, 'more-sentence'),
                  ctx.translation ? h('div', { class: 'ex-hint', text: ctx.translation }) : null,
                  credit(ctx))))
            : null,
          h('div', { class: 'lang-note', text: languageName(ex.card.lang) }),
        ),
      );
      checkBtn.textContent = 'Continue';
      setCheckable(true);
      if (st.listening) speak(ex.card.term, ex.card.lang);
      break;
    }
    case 'choose-translation': {
      if (ex.listen) {
        body.push(label('What do you hear?'), h('div', { class: 'prompt' }, speakerButton(ex.card, true)));
        speak(ex.card.term, ex.card.lang);
      } else {
        body.push(label('What does this mean?'), h('div', { class: 'prompt' }, h('span', { class: 'big-word', text: ex.card.term }), st.listening ? speakerButton(ex.card) : null));
      }
      body.push(choices(ex.options, ex.answer));
      break;
    }
    case 'choose-word':
      body.push(label(`Which ${languageName(ex.card.lang)} word means…`), h('div', { class: 'prompt' }, h('span', { class: 'big-word quoted', text: ex.card.translation })), choices(ex.options, ex.answer));
      break;
    case 'cloze-choose': {
      const blank = h('span', { class: 'blank', text: ' '.repeat(8) });
      body.push(
        label('Fill in the blank'),
        sentenceWithBlank(ex.before, ex.after, blank),
        hintLine(ex.context.translation),
        credit(ex.context),
        choices(ex.options, ex.answer, (o) => {
          blank.textContent = o;
          blank.classList.add('filled');
        }, true),
      );
      break;
    }
    case 'cloze-type':
      body.push(
        label('Type the missing word'),
        sentenceWithBlank(ex.before, ex.after, textInput(ex.answer, true)),
        hintLine(`“${ex.card.translation}”`),
        credit(ex.context),
      );
      break;
    case 'sentence-meaning': {
      const sentence = h('p', { class: 'ex-sentence' });
      renderHighlighted(sentence, ex.context.sentence, ex.context.word);
      body.push(
        label('What does this sentence mean?'),
        h('div', { class: 'prompt sentence-prompt' }, st.listening ? sentenceSpeaker(ex.context, ex.card.lang) : null, sentence),
        credit(ex.context),
        choices(ex.options, ex.answer),
      );
      break;
    }
    case 'build-sentence':
      body.push(
        label('Write this in ' + languageName(ex.card.lang)),
        h('div', { class: 'prompt' }, h('span', { class: 'big-word quoted sentence-size', text: ex.context.translation ?? '' })),
        buildBoard(ex.tiles, ex.answer, ex.context.sentence),
        credit(ex.context),
      );
      break;
    case 'listen-type':
      body.push(
        label('Type what you hear'),
        h('div', { class: 'prompt' }, speakerButton(ex.card, true)),
        textInput(ex.answer, false),
      );
      speak(ex.card.term, ex.card.lang);
      break;
    case 'type-word':
      body.push(
        label(`Write this in ${languageName(ex.card.lang)}`),
        h('div', { class: 'prompt' }, h('span', { class: 'big-word quoted', text: ex.card.translation })),
        textInput(ex.answer, false),
      );
      break;
    case 'match':
      body.push(label('Tap the matching pairs'), matchBoard(ex.cards));
      break;
  }
  exerciseEl.replaceChildren(...body.filter((x): x is HTMLElement => x !== null));
  exerciseEl.classList.remove('enter');
  void exerciseEl.offsetWidth; // restart the entrance animation
  exerciseEl.classList.add('enter');
}

/** Word-tile sentence builder: tap tiles to place them, tap a placed tile to put it back. */
function buildBoard(tiles: string[], answer: string[], sentence: string): HTMLElement {
  const line = h('div', { class: 'build-line' });
  const bank = h('div', { class: 'build-bank' });
  const placed: HTMLButtonElement[] = [];
  const update = () => setCheckable(placed.length > 0);
  for (const text of tiles) {
    const slot = h('span', { class: 'tile-slot' });
    const tile = h('button', { class: 'word-tile', text });
    tile.addEventListener('click', () => {
      if (phase !== 'answer') return;
      if (tile.parentElement === line) {
        slot.append(tile);
        placed.splice(placed.indexOf(tile), 1);
      } else {
        line.append(tile);
        placed.push(tile);
      }
      update();
    });
    slot.append(tile);
    bank.append(slot);
  }
  checker = () => {
    for (const t of [...line.children, ...bank.querySelectorAll('.word-tile')]) (t as HTMLButtonElement).disabled = true;
    const built = placed.map((t) => t.textContent ?? '').join(' ');
    const result = checkAnswer(built, answer.join(' '));
    line.classList.add(result === 'wrong' ? 'wrong' : 'right');
    // Show the real sentence (with punctuation) as the expected answer.
    return { result, expected: sentence, typed: false };
  };
  return h('div', { class: 'build' }, line, bank);
}

function matchBoard(cards: Card[]): HTMLElement {
  let selected: HTMLButtonElement | null = null;
  let left = cards.length;
  const tile = (text: string, id: string, side: 'w' | 't') => {
    const b = h('button', { class: 'tile', 'data-id': id, 'data-side': side, text });
    b.addEventListener('click', () => {
      if (b.disabled) return;
      if (!selected || selected.dataset.side === side) {
        selected?.classList.remove('selected');
        selected = b;
        b.classList.add('selected');
        if (side === 'w' && st?.listening) {
          const c = cards.find((x) => x.id === id);
          if (c) speak(c.term, c.lang);
        }
        return;
      }
      const other = selected;
      selected = null;
      other.classList.remove('selected');
      if (other.dataset.id === id) {
        for (const x of [b, other]) {
          x.classList.add('right');
          x.disabled = true;
        }
        sound.match();
        if (--left === 0) matchDone();
      } else {
        for (const x of [b, other]) {
          x.classList.add('shake');
          setTimeout(() => x.classList.remove('shake'), 400);
        }
        sound.wrong();
      }
    });
    return b;
  };
  return h(
    'div',
    { class: 'match' },
    h('div', { class: 'match-col' }, ...shuffle(cards, rng).map((c) => tile(c.term, c.id, 'w'))),
    h('div', { class: 'match-col' }, ...shuffle(cards, rng).map((c) => tile(c.translation, c.id, 't'))),
  );
}

function matchDone(): void {
  if (!st) return;
  st.xp += 2;
  phase = 'feedback';
  footer.className = 'lesson-footer good';
  feedback.replaceChildren(h('div', { class: 'fb-title', text: 'All matched! +2 XP' }));
  checkBtn.textContent = 'Continue';
  setCheckable(true);
  sound.correct();
}

function renderCombo(): void {
  const el = $('combo');
  const combo = st?.combo ?? 0;
  el.textContent = combo >= 3 ? `🔥 ${combo} in a row` : '';
  el.classList.toggle('hot', combo >= COMBO_BONUS_FROM);
}

// ---- answering -------------------------------------------------------------------

async function check(skipped = false): Promise<void> {
  if (!st) return;
  const ex = st.exercises[st.index]!;
  if (ex.kind === 'intro' || ex.kind === 'match') {
    next();
    return;
  }
  const outcome = skipped ? { ...checker!(), result: 'wrong' as const } : checker!();
  const ok = outcome.result !== 'wrong';
  const card = ex.card;
  phase = 'feedback';
  st.answered++;

  if (ok) {
    st.correct++;
    st.combo++;
    st.bestCombo = Math.max(st.bestCombo, st.combo);
    st.xp += XP.answer + (st.combo >= COMBO_BONUS_FROM ? XP.comboBonus : 0);
    sound.correct();
  } else {
    st.mistakes++;
    st.combo = 0;
    sound.wrong();
    if (!st.retried.has(card.id)) {
      st.retried.add(card.id);
      st.exercises.push(retryFor(card, st.all, rng));
    }
  }
  renderCombo();

  // The first answer for a word in this lesson updates its schedule.
  if (!st.practice && !st.graded.has(card.id)) {
    st.graded.add(card.id);
    const now = Date.now();
    const updated: Card = { ...card, srs: schedule(card.srs, gradeFor(outcome.result, outcome.typed, card), now), updatedAt: now };
    for (const e of st.exercises) if ('card' in e && e.card.id === card.id) e.card = updated;
    st.all = st.all.map((c) => (c.id === card.id ? updated : c));
    void putCards([updated]);
  }

  footer.className = `lesson-footer ${ok ? 'good' : 'bad'}`;
  const title =
    outcome.result === 'correct' ? PRAISE[Math.floor(Math.random() * PRAISE.length)]!
    : outcome.result === 'accent' ? 'Watch the accents!'
    : outcome.result === 'typo' ? 'Almost — you have a typo.'
    : skipped ? 'Skipped. The answer was:' : 'Correct answer:';
  feedback.replaceChildren(
    h('div', {},
      h('div', { class: 'fb-title', text: title }),
      outcome.result !== 'correct' ? h('div', { class: 'fb-answer', text: outcome.expected }) : null,
      ok ? null : h('div', { class: 'fb-meaning', text: `${card.term} = ${card.translation}` }),
    ),
  );
  skipBtn.hidden = true;
  checkBtn.textContent = 'Continue';
  setCheckable(true);
  if (st.listening && ok) speak(card.term, card.lang);
  checkBtn.focus();
}

function next(): void {
  if (!st) return;
  st.index++;
  if (st.index >= st.exercises.length) void finish();
  else render();
}

// ---- summary ---------------------------------------------------------------------

function tile(cls: string, labelText: string, value: string): HTMLElement {
  return h('div', { class: `sum-tile ${cls}` }, h('div', { class: 'sum-label', text: labelText }), h('div', { class: 'sum-value', text: value }));
}

async function finish(): Promise<void> {
  if (!st) return;
  const s = st;
  const perfect = s.mistakes === 0 && s.answered > 0;
  const xp = s.xp + (s.practice ? XP.practice : XP.lesson) + (perfect ? XP.perfect : 0);
  $('lesson-progress').style.width = '100%';

  let result: LessonResult | null = null;
  try {
    result = await send({ type: 'completeLesson', xp, perfect });
  } catch {
    // Progress couldn't be saved (e.g. extension reloaded); still show the summary.
  }

  const seconds = Math.round((Date.now() - s.startedAt) / 1000);
  const accuracy = s.answered ? Math.round((s.correct / s.answered) * 100) : 100;
  const streak = result?.progress.streak.current ?? 0;
  const unlocked = ACHIEVEMENTS.filter((a) => result?.achievements.includes(a.id));

  const again = h('button', { class: 'btn3d ghost', text: s.practice ? 'Practice more' : 'Another lesson' });
  const done = h('button', { class: 'btn3d green big', text: 'Continue' });
  again.addEventListener('click', () => exit(true));
  done.addEventListener('click', () => exit(false));

  $('summary').replaceChildren(
    h('div', { class: 'summary-inner' },
      h('div', { class: 'trophy', text: perfect ? '🏆' : '🎉' }),
      h('h1', { text: perfect ? 'Perfect lesson!' : s.practice ? 'Practice complete!' : 'Lesson complete!' }),
      h('div', { class: 'sum-tiles' },
        tile('xp', 'Total XP', `+${xp}`),
        tile('acc', 'Accuracy', `${accuracy}%`),
        tile('time', 'Time', `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`),
        tile('best', 'Best combo', `${s.bestCombo}`),
      ),
      result?.streakExtended
        ? h('div', { class: 'streak-up' },
            h('span', { class: 'flame pop', text: '🔥' }),
            h('div', {},
              h('b', { text: `${streak} day streak!` }),
              h('div', { class: 'muted small', text:
                result.freezesUsed ? `A streak freeze saved your streak. ❄️`
                : result.freezeEarned ? 'You earned a streak freeze ❄️ — it protects your streak if you miss a day.'
                : 'Come back tomorrow to keep it going.' }),
            ))
        : null,
      unlocked.length
        ? h('div', { class: 'unlocked' },
            h('div', { class: 'muted small', text: 'Achievement unlocked' }),
            ...unlocked.map((a) => h('div', { class: 'badge-row' }, h('span', { class: 'badge-icon', text: a.icon }), h('div', {}, h('b', { text: a.title }), h('div', { class: 'muted small', text: a.description }))))
          )
        : null,
      h('div', { class: 'sum-actions' }, again, done),
    ),
  );
  $('lesson').hidden = true;
  $('summary').hidden = false;
  sound.complete();
  confetti();
  done.focus();
}

// ---- controls --------------------------------------------------------------------

checkBtn.addEventListener('click', () => {
  if (checkBtn.disabled) return;
  if (phase === 'answer') void check();
  else next();
});
skipBtn.addEventListener('click', () => {
  if (phase === 'answer' && checker) void check(true);
});
$('quit').addEventListener('click', () => {
  if (st && st.answered > 0 && !confirm('Quit this lesson? Words you already answered keep their progress, but you won’t get the lesson XP.')) return;
  exit();
});

export function handleLessonKey(e: KeyboardEvent): void {
  if (!st || $('lesson').hidden) return;
  const typing = (e.target as HTMLElement).tagName === 'INPUT';
  if (e.key === 'Enter') {
    e.preventDefault();
    checkBtn.click();
    return;
  }
  if (!typing && phase === 'answer' && /^[1-9]$/.test(e.key)) {
    exerciseEl.querySelector<HTMLButtonElement>(`[data-key="${e.key}"]`)?.click();
  }
}
