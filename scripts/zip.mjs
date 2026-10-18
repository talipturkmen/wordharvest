// Packs dist/ into release/context-cards-<version>.zip (version from the manifest).
import { readFile, mkdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const manifest = JSON.parse(await readFile(path.join(dist, 'manifest.json'), 'utf8'));
const outDir = path.join(root, 'release');
const outFile = path.join(outDir, `context-cards-${manifest.version}.zip`);

await mkdir(outDir, { recursive: true });
await rm(outFile, { force: true });
execFileSync('zip', ['-r', '-X', '-q', outFile, '.', '-x', '.*', '-x', '*/.*'], { cwd: dist, stdio: 'inherit' });
console.log(path.relative(root, outFile));
