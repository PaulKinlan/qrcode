// The service worker's precache list must be DERIVED from the build, not hand-typed.
//
// Before this (bead qrcode-gro) app/scripts/sw/fileManifest.js held a hand-maintained list of
// 13 hard-coded URLs that the SW passed to cache.addAll(). Anything added to the app had to be
// added again there, nothing enforced it, and a rename made offline install 404 - invisible to
// every gate. The list is now walked out of dist/ at build time into dist/sw-manifest.json.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const dist = join(root, 'dist');
const manifestPath = join(dist, 'sw-manifest.json');

function readManifest() {
  assert.ok(existsSync(manifestPath), 'dist/sw-manifest.json is missing: run `npm run build` (npm test does)');
  return JSON.parse(readFileSync(manifestPath, 'utf8'));
}

/** Every file in dist/, relative and sorted - what the plugin's walk should have produced. */
function walkDist(dir = dist, prefix = '') {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const rel = prefix ? posix.join(prefix, entry) : entry;
    if (statSync(full).isDirectory()) out.push(...walkDist(full, rel));
    else out.push(rel);
  }
  return out.sort();
}

test('the precache manifest is derived from dist/, with nothing hand-maintained', () => {
  const manifest = readManifest();
  const expected = walkDist().filter(
    (file) => file !== 'sw.js' && file !== 'sw-manifest.json' && !file.endsWith('.map')
  );

  assert.deepEqual(
    manifest.files,
    expected,
    'manifest.files must equal a fresh walk of dist/ - a difference means the list is not the build output'
  );
  assert.deepEqual(manifest.files, [...manifest.files].sort(), 'precache list should be sorted (stable diffs)');
  assert.equal(new Set(manifest.files).size, manifest.files.length, 'precache list should not repeat a file');
  assert.ok(manifest.files.length > 10, 'expected the built assets, not a token list');
});

test('the precache manifest carries the package.json version and is not self-referential', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const manifest = readManifest();

  assert.equal(manifest.version, pkg.version, 'the cache version must come from package.json');
  // Precaching the worker would freeze its own update cycle; the manifest is generated beside it.
  assert.ok(!manifest.files.includes('sw.js'), 'sw.js must never be precached');
  assert.ok(!manifest.files.includes('sw-manifest.json'), 'the manifest must not list itself');
  // The app entry and the decoder worker are what offline scanning actually needs.
  assert.ok(manifest.files.includes('index.html'));
  assert.ok(manifest.files.includes('scripts/main.js'));
  assert.ok(manifest.files.includes('scripts/qrworker.js'));
});

test('the built service worker is versioned from package.json and has no hand-typed asset list', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const builtSw = readFileSync(join(dist, 'sw.js'), 'utf8');

  // `define: {__APP_VERSION__}` must have been substituted at build time.
  assert.ok(builtSw.includes(pkg.version), `dist/sw.js should contain the injected version ${pkg.version}`);
  assert.ok(builtSw.includes('qr-precache-'), 'dist/sw.js should build its cache name from the injected version');
  assert.ok(builtSw.includes('/sw-manifest.json'), 'dist/sw.js should fetch the generated precache manifest');
  // The old hand-maintained list and its module are gone.
  assert.ok(!builtSw.includes('fileManifest'), 'dist/sw.js still references fileManifest');
  assert.ok(!existsSync(join(root, 'app', 'scripts', 'sw', 'fileManifest.js')), 'the hand-maintained list must be deleted');
});
