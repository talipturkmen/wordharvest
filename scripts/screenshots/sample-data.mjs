// Sample cards for store screenshots.
const DAY = 86_400_000;

const ex = (sentence, word, translation, url, title) => ({ sentence, word, translation, url, title });
const MERCADO = ['https://blog.example.com/una-manana-en-el-mercado', 'Una mañana en el mercado'];

const raw = [
  // [lang, term, translation, dueOffsetDays, reps, interval, examples]
  ['es', 'aprovechar', 'to make the most of', -1, 2, 3, [
    ex('Hay que aprovechar el buen tiempo mientras dure.', 'aprovechar', 'We have to make the most of the good weather while it lasts.', 'https://news.example.es/tiempo', 'El tiempo para el fin de semana'),
    ex('Quiero aprovechar esta oportunidad para darles las gracias.', 'aprovechar', 'I want to take this opportunity to thank you.', 'https://blog.example.com/discurso', 'Un discurso breve'),
  ]],
  ['es', 'atrevidos', 'daring', 0, 0, 0, [
    ex('Algunos turistas se detienen a fotografiar las montañas de tomates; otros, más atrevidos, prueban las aceitunas aliñadas.', 'atrevidos', 'Some tourists stop to photograph the mountains of tomatoes; others, more daring, try the seasoned olives.', ...MERCADO),
  ]],
  ['es', 'bullicio', 'hustle and bustle', 0, 0, 0, [
    ex('Al mediodía, el bullicio disminuye y los comerciantes empiezan a recoger sus mercancías.', 'bullicio', 'At noon, the hustle and bustle dies down and the merchants start packing up their goods.', ...MERCADO),
  ]],
  ['de', 'Feierabend', 'end of the workday', 0, 1, 1, [
    ex('Nach dem Feierabend treffen wir uns im Biergarten.', 'Feierabend', 'After work we meet in the beer garden.', 'https://zeitung.example.de/sommer', 'Sommer in der Stadt'),
  ]],
  ['fr', 'désormais', 'from now on', 0, 3, 8, [
    ex('Le musée est désormais ouvert le dimanche matin.', 'désormais', 'The museum is now open on Sunday mornings.', 'https://culture.example.fr/musee', 'Nouveaux horaires du musée'),
  ]],
  ['es', 'cuña', 'wedge', 0, 1, 1, [
    ex('«Lo importante no es vender mucho», dice mientras corta una cuña de manchego.', 'cuña', '“The important thing isn’t selling a lot,” she says while cutting a wedge of manchego.', ...MERCADO),
  ]],
  ['it', 'ormai', 'by now', 0, 2, 3, [
    ex('Ormai è troppo tardi per cambiare idea.', 'Ormai', 'By now it’s too late to change your mind.', 'https://storie.example.it/racconto', 'Un racconto'),
  ]],
  ['es', 'puestos', 'stalls', 2, 2, 3, [
    ex('Los puestos abren temprano, cuando la luz todavía es suave y el aire huele a pan recién horneado.', 'puestos', 'The stalls open early, when the light is still soft and the air smells of freshly baked bread.', ...MERCADO),
  ]],
  ['de', 'allerdings', 'however', 5, 4, 12, [
    ex('Das Konzept ist gut, allerdings fehlt noch die Finanzierung.', 'allerdings', 'The concept is good; however, the funding is still missing.', 'https://wirtschaft.example.de/startup', 'Ein Start-up sucht Geld'),
  ]],
  ['fr', 'épanouir', 'to flourish', 9, 3, 9, [
    ex('Il faut laisser à chacun le temps de s’épanouir.', 'épanouir', 'Everyone must be given time to flourish.', 'https://education.example.fr/ecole', 'L’école autrement'),
  ]],
  ['es', 'madrugar', 'to get up early', 21, 5, 24, [
    ex('No me gusta madrugar los domingos.', 'madrugar', 'I don’t like getting up early on Sundays.', 'https://foro.example.es/habitos', 'Hábitos de fin de semana'),
  ]],
  ['es', 'recién', 'freshly, just', 1, 1, 1, [
    ex('Los puestos abren temprano, cuando la luz todavía es suave y el aire huele a pan recién horneado.', 'recién', 'The stalls open early, when the light is still soft and the air smells of freshly baked bread.', ...MERCADO),
  ]],
];

export function sampleStorage(now = Date.now()) {
  // moreSentences off: screenshots must not depend on live Tatoeba results.
  const storage = { settings: { targetLang: 'en', autoSave: false, translateSentences: true, provider: 'auto', myMemoryEmail: '', moreSentences: false } };
  raw.forEach(([lang, term, translation, dueDays, reps, interval, examples], i) => {
    const createdAt = now - (raw.length - i) * DAY * 1.7;
    const id = `${lang}:${term.toLocaleLowerCase()}`;
    storage[`card:${id}`] = {
      id, term, lang, translation,
      examples: examples.map((e, j) => ({ ...e, addedAt: createdAt + j * DAY })),
      srs: {
        due: now + dueDays * DAY - (dueDays <= 0 ? 3600_000 * (raw.length - i) : 0),
        interval, ease: 2.5, reps, lapses: 0,
        ...(reps > 0 ? { lastReviewed: now - interval * DAY } : {}),
      },
      createdAt, updatedAt: createdAt,
    };
  });
  storage.progress = sampleProgress(now);
  return storage;
}

const dayKey = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** A learner on a 6-day streak who hasn't done today's lesson yet. */
export function sampleProgress(now = Date.now()) {
  const dailyXp = {};
  [24, 31, 22, 18, 27, 25].forEach((xp, i) => (dailyXp[dayKey(now - (6 - i) * DAY)] = xp));
  dailyXp[dayKey(now)] = 6;
  return {
    xp: 347,
    dailyXp,
    streak: { current: 6, longest: 6, lastDay: dayKey(now - DAY), freezes: 0 },
    lessons: 14,
    perfectLessons: 3,
    achievements: Object.fromEntries(['first-harvest', 'first-lesson', 'flawless', 'streak-3', 'polyglot'].map((id) => [id, now - 3 * DAY])),
  };
}

/** What the mocked service worker answers when a lesson finishes. */
export function sampleLessonResult(now = Date.now()) {
  const p = sampleProgress(now);
  return {
    progress: { ...p, xp: p.xp + 27, streak: { current: 7, longest: 7, lastDay: dayKey(now), freezes: 1 } },
    streakExtended: true,
    freezesUsed: 0,
    freezeEarned: true,
    achievements: ['streak-7'],
  };
}

/** What the mocked translator returns in the article screenshot. */
export const DICTIONARY = {
  atrevidos: 'daring',
  bullicio: 'hustle and bustle',
  puestos: 'stalls',
};
