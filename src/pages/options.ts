// Options page: every control saves immediately.
import { getSettings, updateSettings, type ProviderPreference, type Settings } from '../shared/settings.ts';
import { LANGUAGE_CODES, languageName } from '../shared/languages.ts';
import { builtinDetector, builtinTranslator, hasBuiltinTranslator } from '../translate/builtin.ts';
import { $ } from './dom.ts';
import { DAILY_GOALS } from '../shared/progress.ts';

const target = $<HTMLSelectElement>('targetLang');
const autoSave = $<HTMLInputElement>('autoSave');
const translateSentences = $<HTMLInputElement>('translateSentences');
const email = $<HTMLInputElement>('myMemoryEmail');
const dailyGoal = $<HTMLSelectElement>('dailyGoal');
const soundEffects = $<HTMLInputElement>('soundEffects');
const listening = $<HTMLInputElement>('listening');
const radios = [...document.querySelectorAll<HTMLInputElement>('input[name="provider"]')];

let savedTimer: ReturnType<typeof setTimeout> | undefined;
async function save(patch: Partial<Settings>): Promise<void> {
  await updateSettings(patch);
  const saved = $('saved');
  saved.textContent = 'Saved ✓';
  clearTimeout(savedTimer);
  savedTimer = setTimeout(() => (saved.textContent = ''), 1500);
}

async function describeBuiltin(targetLang: string): Promise<void> {
  const el = $('builtin-status');
  if (!hasBuiltinTranslator()) {
    el.textContent = 'ⓘ Chrome’s on-device translator isn’t available in this browser, so “Automatic” will use MyMemory.';
    return;
  }
  // Probe a common pair to show whether models are ready.
  const probe = targetLang === 'es' ? 'en' : 'es';
  const ok = await builtinTranslator.canTranslate(probe, targetLang);
  const detector = (await builtinDetector.detect('Esto es una frase de prueba.')) !== null;
  el.textContent = ok
    ? `✓ On-device translation is available in this browser (models download on first use per language pair).${detector ? '' : ' Language detection will use Chrome’s built-in detector.'}`
    : `ⓘ On-device translation into ${languageName(targetLang)} isn’t available here; “Automatic” will use MyMemory.`;
}

void getSettings().then((s) => {
  target.replaceChildren(...LANGUAGE_CODES.map((c) => new Option(`${languageName(c)} (${c})`, c)));
  target.value = s.targetLang;
  autoSave.checked = s.autoSave;
  translateSentences.checked = s.translateSentences;
  email.value = s.myMemoryEmail;
  dailyGoal.replaceChildren(...DAILY_GOALS.map((g) => new Option(`${g.label} — ${g.xp} XP a day`, String(g.xp))));
  dailyGoal.value = String(s.dailyGoal);
  soundEffects.checked = s.soundEffects;
  listening.checked = s.listening;
  for (const r of radios) r.checked = r.value === s.provider;
  void describeBuiltin(s.targetLang);
});

target.addEventListener('change', () => {
  void save({ targetLang: target.value });
  void describeBuiltin(target.value);
});
autoSave.addEventListener('change', () => void save({ autoSave: autoSave.checked }));
translateSentences.addEventListener('change', () => void save({ translateSentences: translateSentences.checked }));
for (const r of radios) r.addEventListener('change', () => void save({ provider: r.value as ProviderPreference }));
email.addEventListener('change', () => {
  if (email.value && !email.checkValidity()) return;
  void save({ myMemoryEmail: email.value.trim() });
});
dailyGoal.addEventListener('change', () => void save({ dailyGoal: Number(dailyGoal.value) }));
soundEffects.addEventListener('change', () => void save({ soundEffects: soundEffects.checked }));
listening.addEventListener('change', () => void save({ listening: listening.checked }));
