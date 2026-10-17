// Repo-shape guard: ZBar WASM is the only fallback decoder, loaded from npm.
// Old LazarSoft/ZXing and Comlink copies must not reappear as dead vendored code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const appScripts = join(root, 'app', 'scripts');

test('the repo has one fallback decoder: @undecaf/zbar-wasm', () => {
  assert.ok(!existsSync(join(appScripts, 'qrcode-lib.js')), 'the old JS decoder must not return');
  assert.ok(!existsSync(join(appScripts, 'jsqrcode')), 'the old multi-file JS decoder must not return');
  assert.ok(!existsSync(join(appScripts, 'comlink.js')), 'app/scripts/comlink.js is dead: Comlink comes from npm');
  const oldFiles = readdirSync(appScripts).filter((name) => name.endsWith('.old'));
  assert.deepEqual(oldFiles, [], 'pre-Vite leftovers (*.old) must not come back');
});

test('the worker imports ZBar and its external WASM binary', () => {
  const worker = readFileSync(join(appScripts, 'qrworker.js'), 'utf8');
  assert.match(worker, /from '@undecaf\/zbar-wasm'/, 'qrworker.js should import ZBar from npm');
  assert.match(worker, /zbar\.wasm\?url/, 'qrworker.js should reference the external WASM asset');
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.ok(pkg.dependencies['@undecaf/zbar-wasm'], 'ZBar must be a declared runtime dependency');
  // Comlink is a real npm dependency, not a vendored file.
  for (const file of ['qrworker.js', 'qrclient.js']) {
    assert.match(readFileSync(join(appScripts, file), 'utf8'), /from 'comlink'/, `${file} should import comlink from npm`);
  }
});
