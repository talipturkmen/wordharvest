export type ProviderPreference =
  /** Chrome's on-device Translator API, falling back to the remote provider. */
  | 'auto'
  /** On-device only: nothing leaves the browser. */
  | 'builtin'
  /** Always use the remote provider (see src/translate/registry.ts). */
  | 'remote';

export interface Settings {
  targetLang: string;
  autoSave: boolean;
  /** Also translate the example sentence when saving. */
  translateSentences: boolean;
  provider: ProviderPreference;
  /** Optional e-mail for MyMemory: raises the free quota from 5k to 50k chars/day. */
  myMemoryEmail: string;
}

export const DEFAULT_SETTINGS: Settings = {
  targetLang: 'en',
  autoSave: false,
  translateSentences: true,
  provider: 'auto',
  myMemoryEmail: '',
};

const KEY = 'settings';

export async function getSettings(): Promise<Settings> {
  const { [KEY]: stored } = await chrome.storage.local.get(KEY);
  return { ...DEFAULT_SETTINGS, ...(stored as Partial<Settings> | undefined) };
}

export async function updateSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch };
  await chrome.storage.local.set({ [KEY]: next });
  return next;
}

export function onSettingsChanged(cb: (s: Settings) => void): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes[KEY]) {
      cb({ ...DEFAULT_SETTINGS, ...(changes[KEY].newValue as Partial<Settings> | undefined) });
    }
  });
}
