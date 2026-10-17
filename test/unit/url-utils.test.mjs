// Unit tests for app/scripts/utils/url-utils.js
//
// These cover the security seam of the app: a scanned QR code is untrusted input, and
// isSafeUrl() is the only thing standing between a `javascript:` payload in a QR code and
// navigation. Pure module, no DOM, no worker - so it belongs in the fast tier.
import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeUrl, isSafeUrl } from '../../app/scripts/utils/url-utils.js';

// isSafeUrl() logs a warning for every unsafe protocol; keep the test output readable.
const quiet = (t) => t.mock.method(console, 'warn', () => {});

test('normalizeUrl returns a URL object for absolute URLs', () => {
  const url = normalizeUrl('https://example.com/path?q=1#frag');
  assert.ok(url instanceof URL);
  assert.equal(url.href, 'https://example.com/path?q=1#frag');
  assert.equal(url.protocol, 'https:');
  assert.equal(url.host, 'example.com');
});

test('normalizeUrl normalises case and surrounding whitespace', () => {
  // The URL parser lowercases the scheme/host and strips leading/trailing ASCII whitespace
  // and embedded tabs/newlines, which is why a pasted URL still resolves.
  const url = normalizeUrl('  HTTPS://Example.COM/Path  ');
  assert.ok(url instanceof URL);
  assert.equal(url.protocol, 'https:');
  assert.equal(url.host, 'example.com');
  assert.equal(url.pathname, '/Path', 'path case must be preserved');
});

test('normalizeUrl returns undefined for input the URL parser rejects', () => {
  for (const input of ['', '   ', 'not a url', 'http://', 'example.com/path']) {
    assert.equal(normalizeUrl(input), undefined, `expected undefined for ${JSON.stringify(input)}`);
  }
});

test('normalizeUrl still parses dangerous schemes - parsing is not a safety check', () => {
  // Regression guard: normalizeUrl() must not be mistaken for a sanitiser.
  const url = normalizeUrl('javascript:alert(1)');
  assert.ok(url instanceof URL);
  assert.equal(url.protocol, 'javascript:');
});

test('isSafeUrl accepts the allowed navigation schemes', () => {
  for (const href of [
    'http://example.com',
    'https://example.com',
    'mailto:hello@example.com',
    'tel:+441234567890',
    'sms:+441234567890',
  ]) {
    assert.equal(isSafeUrl(new URL(href)), true, `expected ${href} to be safe`);
  }
});

test('isSafeUrl rejects script and data protocols (XSS)', (t) => {
  quiet(t);
  const payloads = [
    'javascript:alert(1)',
    'JAVASCRIPT:alert(1)', // URL parsing lowercases the scheme; the check must not be case-sensitive
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
  ];
  for (const href of payloads) {
    const url = new URL(href); // the parser accepts these, so the guard has to reject them
    assert.equal(isSafeUrl(url), false, `expected ${href} to be rejected`);
  }
});

test('isSafeUrl rejects anything that is not a URL object', (t) => {
  quiet(t);
  for (const value of [undefined, null, '', 'https://example.com', 42, {}, []]) {
    assert.equal(isSafeUrl(value), false, `expected ${JSON.stringify(value)} to be rejected`);
  }
});

test('normalizeUrl + isSafeUrl together reject a javascript: QR payload', (t) => {
  quiet(t);
  // The documented scan path: decode -> normalizeUrl -> isSafeUrl.
  const url = normalizeUrl('javascript:alert(document.cookie)');
  assert.ok(url instanceof URL);
  assert.equal(isSafeUrl(url), false);
});

test('normalizeUrl + isSafeUrl together accept an ordinary scanned URL', () => {
  const url = normalizeUrl('https://example.com/qr-snapper');
  assert.equal(isSafeUrl(url), true);
});
