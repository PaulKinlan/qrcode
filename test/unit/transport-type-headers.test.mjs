import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const headers = readFileSync(new URL('../../app/_headers', import.meta.url), 'utf8');

function staticHostBlocks(text) {
  const blocks = new Map();
  let path;
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      path = line;
      blocks.set(path, new Map());
    } else if (path) {
      const match = line.trim().match(/^([^:]+):\s*(.*)$/);
      if (match) blocks.get(path).set(match[1], match[2]);
    }
  }
  return blocks;
}

test('production catch-all response prevents type sniffing and pins HTTPS without affecting worker CSP', () => {
  const blocks = staticHostBlocks(headers);
  const document = blocks.get('/*');
  assert.ok(document, 'static host must send headers for the app document');
  assert.equal(document.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(document.get('Strict-Transport-Security'), 'max-age=31536000');
  assert.equal(document.get('Content-Security-Policy'), "frame-ancestors 'none'");
  assert.equal(blocks.get('/sw.js')?.get('Content-Security-Policy'),
    "default-src 'none'; script-src 'self'; connect-src 'self'");
});
