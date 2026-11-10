// The app document must pin Referrer-Policy (bead qrcode-igx): its URL can carry an
// x-callback-url destination or a kill-switch consent token, and the browser default
// (strict-origin-when-cross-origin) hands the full URL - query included - to any same-origin
// receiver. THREAT_MODEL.md invariant 12: header-only protections must be asserted on the
// response. These tests pin every surface the repo controls to the same policy, the way the
// framing headers are pinned in framing-headers.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import config, { REFERRER_HEADERS } from '../../vite.config.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (...parts) => readFileSync(join(root, ...parts), 'utf8');

const POLICY = { 'Referrer-Policy': 'same-origin' };

test('the shared export pins same-origin, matching the service worker', () => {
  assert.deepEqual(REFERRER_HEADERS, POLICY);
  // The worker's synthesised kill/ask pages are the existing in-repo discipline
  // (app/sw.js); the document must not drift from it.
  const sw = read('app', 'sw.js');
  assert.match(sw, /['"]Referrer-Policy['"]:\s*['"]same-origin['"]/);
});

test('the dev and preview servers both send the referrer policy', () => {
  for (const [name, options] of [['server', config.server], ['preview', config.preview]]) {
    assert.equal(options?.headers?.['Referrer-Policy'], 'same-origin', `${name}.headers`);
  }
});

test('the static-host header file ships and pins the policy', () => {
  const headers = read('app', '_headers');
  assert.match(headers, /^\s*Referrer-Policy:\s*same-origin\s*$/m);
});

test('the document pins the policy in a meta tag for hosts that read no headers', () => {
  // Unlike frame-ancestors, <meta name="referrer"> is honoured by browsers, so this is real
  // belt-and-braces (file:// previews, hosts that ignore _headers), not decoration.
  const html = read('app', 'index.html');
  assert.match(html, /<meta\s+name="referrer"\s+content="same-origin"\s*>/i);
});
