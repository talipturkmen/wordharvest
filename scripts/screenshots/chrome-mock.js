// Installed into every page/frame before any script runs (page.evaluateOnNewDocument).
// Fakes the parts of the chrome.* API the extension uses, plus the on-device
// Translator/LanguageDetector, so the real built UI can render from file:// URLs.
// eslint-disable-next-line no-unused-vars
function installChromeMock({ storage, dictionary, lang }) {
  const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
  const store = clone(storage);
  const listeners = [];
  const emit = (changes) => listeners.forEach((l) => l(changes, 'local'));

  const local = {
    async get(keys) {
      if (keys == null) return clone(store);
      const list = typeof keys === 'string' ? [keys] : Array.isArray(keys) ? keys : Object.keys(keys);
      return Object.fromEntries(list.filter((k) => k in store).map((k) => [k, clone(store[k])]));
    },
    async set(items) {
      const changes = {};
      for (const [k, v] of Object.entries(items)) {
        changes[k] = { oldValue: store[k], newValue: clone(v) };
        store[k] = clone(v);
      }
      emit(changes);
    },
    async remove(keys) {
      const changes = {};
      for (const k of [].concat(keys)) {
        changes[k] = { oldValue: store[k] };
        delete store[k];
      }
      emit(changes);
    },
  };

  const translate = (t) => dictionary[t] ?? dictionary[t.toLowerCase()] ?? t;

  Object.defineProperty(window, 'chrome', {
    configurable: true,
    writable: true,
    value: {
      storage: { local, onChanged: { addListener: (fn) => listeners.push(fn) } },
      runtime: {
        id: 'mock',
        getURL: (p) => p,
        async sendMessage(msg) {
          if (msg.type === 'translate') return { ok: true, value: { text: translate(msg.text), provider: 'MyMemory' } };
          if (msg.type === 'saveWord') return { ok: true, value: { status: 'created', card: {} } };
          return { ok: false, error: 'unknown message' };
        },
      },
      i18n: { detectLanguage: async () => ({ isReliable: true, languages: [{ language: lang, percentage: 100 }] }) },
      tabs: { create: async () => ({}) },
    },
  });

  window.Translator = {
    availability: async () => 'available',
    create: async () => ({ translate: async (t) => translate(t) }),
  };
  window.LanguageDetector = {
    availability: async () => 'available',
    create: async () => ({ detect: async () => [{ detectedLanguage: lang, confidence: 0.98 }] }),
  };
}
