// Repo-shape guard: there is exactly one QR decoder in the tree.
//
// Until 2026-10-17 the repo carried two copies of the same LazarSoft/ZXing decoder: the live
// app/scripts/qrcode-lib.js (imported by qrworker.js) and a 19-file app/scripts/jsqrcode/
// directory that nothing imported, plus a vendored app/scripts/comlink.js while qrclient.js
// and qrworker.js import Comlink from npm. That is how a decoder bug gets "fixed" in the dead
// copy and passes review as a no-op. This test fails if a second copy comes back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const appScripts = join(root, 'app', 'scripts');

test('the repo has one decoder: app/scripts/qrcode-lib.js', () => {
  assert.ok(existsSync(join(appScripts, 'qrcode-lib.js')), 'app/scripts/qrcode-lib.js must exist');
  // The deleted duplicate vendoring must not reappear (nor a differently named copy of it).
  assert.ok(!existsSync(join(appScripts, 'jsqrcode')), 'app/scripts/jsqrcode/ is a dead duplicate of qrcode-lib.js');
  assert.ok(!existsSync(join(appScripts, 'comlink.js')), 'app/scripts/comlink.js is dead: Comlink comes from npm');
  const oldFiles = readdirSync(appScripts).filter((name) => name.endsWith('.old'));
  assert.deepEqual(oldFiles, [], 'pre-Vite leftovers (*.old) must not come back');
});

test('the worker imports the decoder from qrcode-lib.js', () => {
  const worker = readFileSync(join(appScripts, 'qrworker.js'), 'utf8');
  assert.match(worker, /from '\.\/qrcode-lib\.js'/, 'qrworker.js should import ./qrcode-lib.js');
  // Comlink is a real npm dependency, not a vendored file.
  for (const file of ['qrworker.js', 'qrclient.js']) {
    assert.match(readFileSync(join(appScripts, file), 'utf8'), /from 'comlink'/, `${file} should import comlink from npm`);
  }
});
