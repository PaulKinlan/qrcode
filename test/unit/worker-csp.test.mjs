// The worker responses must carry their own CSP (bead qrcode-7du): a <meta> CSP applies to the
// document only, so /sw.js and the decoder worker would otherwise run with no policy at all.
// These tests pin the path-scoped blocks in app/_headers - and the qrcode-2pt trade-off that the
// document itself must NOT gain a header CSP: a response CSP on /* would COMBINE with the meta
// policy and strip img-src data:/blob: from the document, killing the camera-fallback upload.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const headers = readFileSync(new URL('../../app/_headers', import.meta.url), 'utf8');
const expectedWorkerCsp = new Map([
  ['/sw.js', "default-src 'none'; script-src 'self'; connect-src 'self'"],
  ['/scripts/*', "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'"],
]);

const blockFor = (path) => {
  // A block starts with a path line and owns the indented header lines after it.
  const match = headers.match(new RegExp(`^${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n((?:  .*\\n?)*)`, 'm'));
  return match?.[1] ?? '';
};

test('the service worker response is policed without breaking the install fetches', () => {
  const block = blockFor('/sw.js');
  assert.ok(block, 'a /sw.js block must exist in app/_headers');
  assert.match(block, /Content-Security-Policy:\s*default-src 'none'; script-src 'self'; connect-src 'self'/);
  // Install fetches /sw-manifest.json and precache assets from this origin: connect-src 'self'
  // is load-bearing. No WASM compiles in the SW global scope, so no 'wasm-unsafe-eval'.
  assert.match(block, /connect-src 'self'/);
  assert.doesNotMatch(block, /worker-src/);
});

test('the decoder worker keeps exactly the policy that lets zbar load and compile', () => {
  const block = blockFor('/scripts/*');
  assert.ok(block, 'a /scripts/* block must exist in app/_headers');
  // Pin the WHOLE value: substring checks miss added data:/remote script sources, which
  // weaken the decoder's policy even though wasm-unsafe-eval and connect-src remain.
  const policies = [...block.matchAll(/^  Content-Security-Policy:\s*(.+)$/gm)].map((m) => m[1]);
  assert.deepEqual(policies, [expectedWorkerCsp.get('/scripts/*')]);
});

test('the README worker policies copied to other hosts match the guarded shipped values', () => {
  const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');
  const section = readme.match(/^### Worker CSP\s*\n([\s\S]*?)(?=^### |$(?![\s\S]))/m)?.[1];
  assert.ok(section, 'README must document the worker CSP for other hosts');
  const example = section.match(/```\s*\n([^`]+)```/)?.[1];
  assert.ok(example, 'Worker CSP section must include a copyable fenced example');
  for (const [path, expected] of expectedWorkerCsp) {
    const documented = example.match(new RegExp(`^${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n  Content-Security-Policy: (.+)$`, 'm'))?.[1];
    assert.equal(documented, expected, `README policy for ${path} must match the secure shipped value`);
    const shipped = [...blockFor(path).matchAll(/^  Content-Security-Policy:\s*(.+)$/gm)].map((m) => m[1]);
    assert.deepEqual(shipped, [expected], `app/_headers policy for ${path} must match the README`);
  }
});

test('the document responses gain no header CSP (the meta stays the only document policy)', () => {
  // qrcode-2pt: a CSP header on /* would combine with the meta policy as an intersection and
  // strip img-src data:/blob: - the camera-fallback upload renders its image from a blob: URL.
  // The ONLY CSP the document may receive is the header-only framing directive.
  const globalBlock = blockFor('/*');
  assert.ok(globalBlock, 'the /* block must exist for the framing + referrer headers');
  const cspLines = globalBlock.split('\n').filter((line) => line.includes('Content-Security-Policy'));
  assert.deepEqual(cspLines, ["  Content-Security-Policy: frame-ancestors 'none'"]);
});

test('the worker CSP blocks are scoped to the paths the build actually ships workers at', () => {
  // The shipped worker paths are decided in two places; both must agree with the header scopes
  // in app/_headers, or a worker moves outside the policed tree and runs unpoliced.
  // 1. qrclient constructs the worker RELATIVE to its own bundle ('./qrworker.js'), and main.js
  //    is emitted at scripts/main.js, so the worker lands at /scripts/qrworker.js.
  const qrclient = readFileSync(new URL('../../app/scripts/qrclient.js', import.meta.url), 'utf8');
  assert.match(
    qrclient,
    /new Worker\(new URL\('\.\/qrworker\.js', import\.meta\.url\)/,
    'the worker URL must stay relative to the scripts/ tree (bead qrcode-16d)'
  );
  // 2. Vite emits the worker entry (and any chunks) into scripts/.
  const vite = readFileSync(new URL('../../vite.config.js', import.meta.url), 'utf8');
  assert.match(vite, /worker:\s*\{[\s\S]*?entryFileNames:\s*'scripts\/\[name\]\.js'/, 'worker output must stay in scripts/ (bead qrcode-16d)');
  // A chunk pin matters even though no dynamic import ships today: the Vite default puts
  // chunks in assets/, outside the /scripts/* CSP scope, and nothing else fails on a config
  // that never emits a chunk (bead qrcode-aa0).
  assert.match(vite, /worker:\s*\{[\s\S]*?chunkFileNames:\s*'scripts\/\[name\]\.js'/, 'worker dynamic-import chunks must be pinned to scripts/ - the default ships them under assets/, outside the /scripts/* CSP scope (bead qrcode-aa0)');
  assert.match(headers, /^\/scripts\/\*$/m, 'the /scripts/* block is the scope both facts rely on');
  assert.match(headers, /^\/sw\.js$/m, 'the /sw.js block must exist (the SW ships at the origin root)');
});
