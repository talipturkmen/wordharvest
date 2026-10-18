// The remote (network) translation provider used as the fallback.
//
// To swap providers, implement `TranslationProvider` (see ./types.ts), return it
// from `createRemoteProvider`, and update `host_permissions` in public/manifest.json
// to the new API's origin. Everything else goes through the interface.
import type { TranslationProvider } from './types.ts';
import { createMyMemoryProvider } from './mymemory.ts';
import { getSettings } from '../shared/settings.ts';

export function createRemoteProvider(): TranslationProvider {
  return createMyMemoryProvider(async () => (await getSettings()).myMemoryEmail);
}
