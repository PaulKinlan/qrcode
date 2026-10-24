// Post-build assertions: the shape of `dist/` after `npm run build`.
//
// This is the full-tier half of the gate. `npm test` builds first, then runs this; the fast
// tier (`npm run test:fast`) runs the same unit tests without it. The build exits 0 for a
// surprising number of broken layouts (an asset naming rule that stops matching, a public file
// the copy plugin silently skips), so the expected output is asserted rather than trusted.
//
// It reads dist/ only - no server, no browser - so it stays seconds-fast. The browser smoke
// that drives the file-upload path is test/browser/smoke.test.mjs, in the same `npm test` run
// (bead qrcode-cf0 landed it); `npm run test:fast` runs neither of these post-build tiers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { aboutHtmlAlias, PUBLIC_FILES } from '../../vite.config.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dist = join(root, 'dist');

// Entries vite must emit (see rollupOptions.input / output in vite.config.js).
const REQUIRED_FILES = [
  'index.html',
  'about.html', // Vite must process this HTML entry, not copy unresolved source references
  'sw.js', // service worker stays at the dist root; the PWA scope depends on it
  'scripts/main.js', // app entry, deliberately unhashed so index.html and the SW agree
  'scripts/qrworker.js', // decoder worker chunk
  'scripts/zbar.wasm', // separately cacheable offline decoder binary
  'styles/main.css',
  'manifest.json',
];

// Public files copied by the copyPublicFiles() plugin in vite.config.js. The list itself is
// imported from the config (single source of truth), so a file added to the plugin cannot be
// missing here; the derived copies below are the ones the plugin makes itself (bead qrcode-f7s).
const COPIED_PUBLIC_FILES = [
  ...PUBLIC_FILES,
  'licenses/zbar-wasm.txt',
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

test('the image tree reaches dist/ whole, not partially', () => {
  // The copyDir() half of the same plugin used to swallow its errors too (bead qrcode-f7s): a
  // half-copied app/images/ left a green build and a manifest that agreed with it, while the
  // shipped PWA was missing icons. Walk the source tree and require every file in dist/.
  const walk = (dir, prefix = '') =>
    readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry);
      const rel = prefix ? `${prefix}/${entry}` : entry;
      return statSync(full).isDirectory() ? walk(full, rel) : [rel];
    });
  const sourceImages = walk(join(root, 'app', 'images'));
  assert.ok(sourceImages.length > 0, 'app/images/ must contain the PWA icons');
  for (const rel of sourceImages) {
    const copied = join(dist, 'images', rel);
    assert.ok(existsSync(copied), `expected images/${rel} in dist/ (copied from app/images/${rel})`);
    assert.ok(statSync(copied).size > 0, `expected images/${rel} in dist/ to be non-empty`);
  }
});

test('the ZBar binary has a stable URL and is precached for offline scanning', () => {
  const worker = readFileSync(join(dist, 'scripts/qrworker.js'), 'utf8');
  const manifest = JSON.parse(readFileSync(join(dist, 'sw-manifest.json'), 'utf8'));
  assert.match(worker, /\/scripts\/zbar\.wasm/, 'worker should load the emitted WASM binary');
  assert.ok(manifest.files.includes('scripts/zbar.wasm'), 'generated SW manifest should precache the WASM binary');
});

test('both pages ship a CSP that allows their own WebAssembly', () => {
  // bead qrcode-2pt: script-src lacked 'wasm-unsafe-eval', so every WebAssembly compile in the
  // document was refused (CompileError, verified in Chrome against the built page). Scanning still
  // worked only because a meta CSP is NOT inherited by workers and the decode runs in
  // app/scripts/qrworker.js - so moving decoding to the main thread, or serving this policy as an
  // HTTP header (which workers DO inherit), would kill the fallback with no visible error: the
  // rejected scan is swallowed and the user just sees "no QR found".
  for (const page of ['index.html', 'about.html']) {
    const html = readFileSync(join(dist, page), 'utf8');
    const policy = html.match(/<meta[^>]+Content-Security-Policy[^>]+content="([^"]+)"/i)?.[1];
    assert.ok(policy, `${page} should declare a Content-Security-Policy`);
    assert.match(policy, /script-src[^;]*'wasm-unsafe-eval'/, `${page} CSP must allow 'wasm-unsafe-eval'`);
    assert.match(policy, /script-src[^;]*'self'/, `${page} CSP should still restrict scripts to 'self'`);
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

test('About alias rejects markup that would otherwise be silently discarded', () => {
  const transform = aboutHtmlAlias().transformIndexHtml.handler;
  assert.throws(
    () => transform('<!doctype html><body><button>Copy</button></body>', { path: '/about.html' }),
    /app\/about\.html is an alias: edit app\/index\.html/
  );
  assert.match(transform('<!doctype html><!-- alias -->', { path: '/about.html' }), /QRCodeSuccessDialog-copy/);
});

test('about page is generated from the same app document as index', () => {
  assert.equal(
    readFileSync(join(dist, 'about.html'), 'utf8'),
    readFileSync(join(dist, 'index.html'), 'utf8'),
    'the About route must not drift from the scanner app markup'
  );
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

test('dist ships only the JavaScript the app loads', () => {
  // bead qrcode-lmm: Vite rewrote `new URL('./', import.meta.url)` in the ZBar Emscripten glue
  // and emitted a byte-identical copy of that module as a hashed chunk under dist/assets/. Its
  // only reader is the glue's `process.versions.node` branch, which cannot run in a browser
  // worker, so the copy was pure weight - it was precached for offline install and never fetched.
  // vite.config.js suppresses that rewrite (worker.plugins: root plugins are not run for worker
  // modules). This asserts no emitted JS is dead weight of that shape; if a dependency bumps and
  // the glue changes, the chunk comes back and this fails.
  const jsFiles = [];
  const walk = (dir, prefix) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const rel = prefix ? `${prefix}/${entry}` : entry;
      if (statSync(full).isDirectory()) walk(full, rel);
      else if (/\.m?js$/.test(entry)) jsFiles.push(rel);
    }
  };
  walk(dist, '');
  assert.deepEqual(
    jsFiles.sort(),
    ['scripts/main.js', 'scripts/qrworker.js', 'sw.js'],
    'dist/ should contain exactly the app entry, the decoder worker and the service worker'
  );

  const manifest = JSON.parse(readFileSync(join(dist, 'sw-manifest.json'), 'utf8'));
  const orphaned = manifest.files.filter((file) => /\.m?js$/.test(file) && !jsFiles.includes(file));
  assert.deepEqual(orphaned, [], 'the precache manifest should not list JavaScript that dist/ does not ship');
});
