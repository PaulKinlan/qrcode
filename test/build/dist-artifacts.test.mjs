// Post-build assertions: the shape of `dist/` after `npm run build`.
//
// This is the full-tier half of the gate. `npm test` builds first, then runs this; the fast
// tier (`npm run test:fast`) runs the same unit tests without it. The build exits 0 for a
// surprising number of broken layouts (an asset naming rule that stops matching, a public file
// the copy plugin silently skips), so the expected output is asserted rather than trusted.
//
// It reads dist/ only - no server, no browser - so it stays seconds-fast. The browser smoke
// that drives the file-upload path is a separate, later tier (bead qrcode-cf0).
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dist = join(root, 'dist');

// Entries vite must emit (see rollupOptions.input / output in vite.config.js).
const REQUIRED_FILES = [
  'index.html',
  'sw.js', // service worker stays at the dist root; the PWA scope depends on it
  'scripts/main.js', // app entry, deliberately unhashed so index.html and the SW agree
  'scripts/qrworker.js', // decoder worker chunk
  'styles/main.css',
  'manifest.json',
];

// Public files copied by the copyPublicFiles() plugin in vite.config.js.
const COPIED_PUBLIC_FILES = [
  'about.html',
  'favicon.ico',
  'humans.txt',
  'manifest.webapp',
  'robots.txt',
  'webstore-manifest.json',
  'images/touch/apple-touch-icon.png',
];

test('build emits the expected dist layout', () => {
  assert.ok(existsSync(dist), 'dist/ is missing: run `npm run build` first (npm test does)');
  for (const file of [...REQUIRED_FILES, ...COPIED_PUBLIC_FILES]) {
    const path = join(dist, file);
    assert.ok(existsSync(path), `expected ${file} in dist/`);
    assert.ok(statSync(path).size > 0, `expected ${file} in dist/ to be non-empty`);
  }
});

test('built index.html references the emitted bundle and stylesheet', () => {
  const html = readFileSync(join(dist, 'index.html'), 'utf8');
  // Vite rewrites these hrefs; a mismatch here means the app loads unstyled or half-dead.
  for (const ref of ['/scripts/main.js', '/styles/main.css', '/manifest.json']) {
    assert.ok(html.includes(ref), `dist/index.html should reference ${ref}`);
  }
  assert.ok(!html.includes('/styles/app.css'), 'dist/index.html still points at the pre-build stylesheet path');
});
