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
  'about.html', // Vite must process this HTML entry, not copy unresolved source references
  'sw.js', // service worker stays at the dist root; the PWA scope depends on it
  'scripts/main.js', // app entry, deliberately unhashed so index.html and the SW agree
  'scripts/qrworker.js', // decoder worker chunk
  'styles/main.css',
  'manifest.json',
];

// Public files copied by the copyPublicFiles() plugin in vite.config.js.
const COPIED_PUBLIC_FILES = [
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

test('the configured minifier is a declared dependency', () => {
  // cost us a red gate on 2026-10-17: vite.config.js sets minify: 'terser', but terser is only
  // an OPTIONAL peer of vite and was not declared anywhere, so it existed in a hand-made
  // node_modules and nowhere else - a clean `npm ci` could not build the project at all.

  const config = readFileSync(join(root, 'vite.config.js'), 'utf8');
  const mode = config.match(/minify:\s*'([a-z0-9-]+)'/)?.[1];
  assert.ok(mode, 'vite.config.js should state a minify mode');
  if (mode === 'esbuild') return; // vite's built-in, nothing to install
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const declared = { ...pkg.dependencies, ...pkg.devDependencies };
  assert.ok(declared[mode], `minify: '${mode}' needs ${mode} in package.json dependencies`);
});

test('built HTML entries reference the emitted module and stylesheet', () => {
  for (const page of ['index.html', 'about.html']) {
    const html = readFileSync(join(dist, page), 'utf8');
    // Vite rewrites these hrefs; a mismatch here means the page loads unstyled or half-dead.
    for (const ref of ['/scripts/main.js', '/styles/main.css', '/manifest.json']) {
      assert.ok(html.includes(ref), `dist/${page} should reference ${ref}`);
    }
    assert.ok(!html.includes('/styles/app.css'), `dist/${page} still points at the pre-build stylesheet path`);
    assert.ok(!html.includes('main.mjs') && !html.includes('nomodule'), `dist/${page} still has a legacy script entry`);
  }
});
