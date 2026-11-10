// The worker responses must carry their own CSP (bead qrcode-7du): a <meta> CSP applies to the
// document only, so /sw.js and the decoder worker would otherwise run with no policy at all.
// These tests pin the path-scoped blocks in app/_headers - and the qrcode-2pt trade-off that the
// document itself must NOT gain a header CSP: a response CSP on /* would COMBINE with the meta
// policy and strip img-src data:/blob: from the document, killing the camera-fallback upload.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const headers = readFileSync(new URL('../../app/_headers', import.meta.url), 'utf8');

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

test('the decoder worker keeps the policy that lets zbar load and compile', () => {
  const block = blockFor('/scripts/*');
  assert.ok(block, 'a /scripts/* block must exist in app/_headers');
  // The worker fetches scripts/zbar.wasm (connect-src) and compiles it (WebAssembly.
  // instantiateStreaming/instantiate are gated by script-src 'wasm-unsafe-eval'). Dropping
  // 'wasm-unsafe-eval' fails every scan with CompileError - the qrcode-2pt regression class.
  assert.match(block, /script-src 'self' 'wasm-unsafe-eval'/);
  assert.match(block, /connect-src 'self'/);
  assert.match(block, /default-src 'none'/);
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

test('the worker CSP blocks are scoped to paths the build actually ships workers at', () => {
  // The SW lives at /sw.js and the worker bundle at /scripts/qrworker.js (vite
  // entryFileNames); /scripts/* must therefore cover the worker and its chunks.
  const html = readFileSync(new URL('../../app/index.html', import.meta.url), 'utf8');
  assert.match(html, /qrworker/, 'the worker registration must reference the scripts/ tree');
});
