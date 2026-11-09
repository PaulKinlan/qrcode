// A restart must discard the worker's module state, not its origin's CacheStorage.
// Separate Node processes also give each boot a fresh ESM router/route table.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const origin = 'https://qr-snapper.test';
const script = fileURLToPath(import.meta.url);

if (process.env.SW_RESTART_PHASE) {
  const entries = new Map(JSON.parse(process.env.SW_RESTART_CACHE || '[]'));
  const listeners = new Map();
  let unregistered = 0;
  const deleted = [];
  globalThis.__APP_VERSION__ = '9.9.9-restart-test';
  globalThis.self = {
    location: {origin},
    registration: {async unregister() { unregistered++; return true; }},
    addEventListener(type, handler) { listeners.set(type, handler); },
  };
  globalThis.caches = {
    async open(name) {
      if (!entries.has(name)) entries.set(name, []);
      return {
        async match(key) {
          const body = new Map(entries.get(name)).get(key);
          return body === undefined ? undefined : new Response(body);
        },
        async put(key, response) {
          const stored = new Map(entries.get(name));
          stored.set(key, await response.text());
          entries.set(name, [...stored]);
        },
      };
    },
    async keys() { return ['qr-precache-9.9.9-restart-test', ...entries.keys()]; },
    async delete(key) { deleted.push(key); entries.delete(key); return true; },
    async match() { return new Response('cached'); },
  };
  await import('../../app/sw.js');

  function navigate(url) {
    let response;
    listeners.get('fetch')({
      request: {url, method: 'GET', mode: 'navigate', referrer: ''},
      respondWith(result) { response = result; },
      waitUntil() { throw new Error('kill page should respond rather than schedule cleanup'); },
    });
    return response;
  }

  if (process.env.SW_RESTART_PHASE === 'mint') {
    const html = await (await navigate(`${origin}/?kill-sw=true`)).text();
    const token = html.match(/name="consent" value="([0-9a-f]{32})"/)?.[1];
    assert.ok(token, 'first worker must issue a persisted form token');
    process.stdout.write(JSON.stringify({token, entries: [...entries]}));
  } else {
    const token = process.env.SW_RESTART_TOKEN;
    const response = await navigate(`${origin}/?kill-sw=true&confirm=1&consent=${token}`);
    const html = await response.text();
    process.stdout.write(JSON.stringify({html, unregistered, deleted}));
  }
} else {
  test('form token minted before service-worker termination works after a fresh worker boot', async () => {
    const first = await run(process.execPath, [script], {
      env: {...process.env, SW_RESTART_PHASE: 'mint'}, timeout: 10000,
    });
    const {token, entries} = JSON.parse(first.stdout);
    assert.ok(entries.some(([name]) => name === 'qr-precache-9.9.9-restart-test-consent'));
    const second = await run(process.execPath, [script], {
      env: {...process.env, SW_RESTART_PHASE: 'consume', SW_RESTART_CACHE: JSON.stringify(entries),
        SW_RESTART_TOKEN: token}, timeout: 10000,
    });
    const {html, unregistered, deleted} = JSON.parse(second.stdout);
    assert.match(html, /Offline mode is off/);
    assert.equal(unregistered, 1);
    assert.deepEqual(deleted, ['qr-precache-9.9.9-restart-test',
      'qr-precache-9.9.9-restart-test-consent']);
  });
}
