// Bundles src/ into dist/ and copies static files from public/.
// Usage: node scripts/build.mjs [--watch]
import * as esbuild from 'esbuild';
import { cp, rm, watch as fsWatch } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const isWatch = process.argv.includes('--watch');

/** @type {{ entry: string, out: string, format: 'iife' | 'esm' }[]} */
const entries = [
  { entry: 'src/content/index.ts', out: 'content', format: 'iife' },
  { entry: 'src/background/index.ts', out: 'background', format: 'esm' },
  // Pages are classic (non-module) scripts so they also run from file:// when
  // scripts/store-assets.mjs renders them for screenshots.
  { entry: 'src/pages/popup.ts', out: 'popup', format: 'iife' },
  { entry: 'src/pages/review.ts', out: 'review', format: 'iife' },
  { entry: 'src/pages/options.ts', out: 'options', format: 'iife' },
];

async function copyPublic() {
  await cp(path.join(root, 'public'), dist, { recursive: true });
}

await rm(dist, { recursive: true, force: true });
await copyPublic();

const contexts = await Promise.all(
  entries.map((e) =>
    esbuild.context({
      entryPoints: { [e.out]: path.join(root, e.entry) },
      outdir: dist,
      bundle: true,
      format: e.format,
      target: 'chrome116',
      // Unminified output keeps Chrome Web Store review fast (reviewers read the code).
      minify: false,
      sourcemap: isWatch ? 'inline' : false,
      legalComments: 'none',
      logLevel: 'info',
    }),
  ),
);

if (isWatch) {
  await Promise.all(contexts.map((c) => c.watch()));
  console.log('Watching src/ and public/ … reload the extension in chrome://extensions after changes.');
  for await (const _ of fsWatch(path.join(root, 'public'), { recursive: true })) {
    await copyPublic();
    console.log('public/ copied');
  }
} else {
  await Promise.all(contexts.map((c) => c.rebuild()));
  await Promise.all(contexts.map((c) => c.dispose()));
}
