// The app document must not be framable (bead qrcode-22b): a framing page can overlay the result
// panel and clickjack the "Return" (x-callback) and "Open" buttons. `frame-ancestors` is
// header-only, so the policy cannot live in the <meta> CSP - these tests pin that it lives in the
// headers the repo can control, and that nobody re-adds a decorative copy to the meta tag.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import config, { FRAMING_HEADERS, PUBLIC_FILES } from '../../vite.config.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (...parts) => readFileSync(join(root, ...parts), 'utf8');

const framingOf = (headers) => ({
  csp: headers['Content-Security-Policy'],
  xfo: headers['X-Frame-Options'],
});

const DENIED = { csp: "frame-ancestors 'none'", xfo: 'DENY' };

test('the dev and preview servers both send the framing policy', () => {
  for (const [name, options] of [['server', config.server], ['preview', config.preview]]) {
    assert.ok(options?.headers, `${name}.headers must be set: otherwise dev/preview is framable`);
    assert.deepEqual(framingOf(options.headers), DENIED, `${name}.headers`);
  }
  assert.deepEqual(framingOf(FRAMING_HEADERS), DENIED);
});

test('the static-host header file ships and denies framing', () => {
  assert.ok(PUBLIC_FILES.includes('_headers'), '_headers must be copied into dist/ for the host to read');

  const headers = read('app', '_headers');
  assert.match(headers, /^\s*Content-Security-Policy:\s*frame-ancestors 'none'\s*$/m);
  assert.match(headers, /^\s*X-Frame-Options:\s*DENY\s*$/m);
});

test('the meta CSP does not pretend to set frame-ancestors', () => {
  // Browsers ignore frame-ancestors delivered in a <meta> tag: a copy there would read as a fix
  // while leaving the document framable, so its presence is a defect rather than a belt-and-braces.
  const html = read('app', 'index.html');
  const meta = html.match(/<meta http-equiv="Content-Security-Policy"[^>]*>/i)?.[0] ?? '';
  assert.ok(meta, 'expected the app CSP meta tag to still exist');
  assert.doesNotMatch(meta, /frame-ancestors/i);
});
