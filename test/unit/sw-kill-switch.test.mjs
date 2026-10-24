import test from 'node:test';
import assert from 'node:assert/strict';

const origin = 'https://qr-snapper.test';
const listeners = new Map();
const deleted = [];
let unregistered = 0;
let resolveUnregister;
let cacheMatches = 0;

globalThis.__APP_VERSION__ = '9.9.9-test';
globalThis.self = {
  location: { origin },
  registration: { unregister() {
    unregistered++;
    return new Promise(resolve => { resolveUnregister = resolve; });
  } },
  addEventListener(type, handler) { listeners.set(type, handler); },
};
globalThis.caches = {
  async keys() { return ['qr-precache-old', 'qr-precache-9.9.9-test', 'unrelated-app']; },
  async delete(key) { deleted.push(key); return true; },
  async match() { cacheMatches++; return new Response('cached'); },
};

await import('../../app/sw.js');

function dispatch(url) {
  let lifetime;
  let response;
  listeners.get('fetch')({
    request: new Request(url),
    waitUntil(promise) { lifetime = promise; },
    respondWith(promise) { response = promise; },
  });
  return { lifetime, response };
}

test('kill switch matches a later query parameter and extends the fetch lifetime until cleanup', async () => {
  const event = dispatch(`${origin}/index.html?source=offline&kill-sw=true`);
  assert.ok(event.lifetime, 'unregister and cache deletion must be held by waitUntil');
  assert.equal(event.response, undefined, 'kill route must preempt cache-first origin route');
  assert.equal(unregistered, 1);
  assert.equal(cacheMatches, 0);
  assert.deepEqual(deleted, [], 'cleanup should wait for unregister');
  resolveUnregister(true);
  await event.lifetime;
  assert.deepEqual(deleted, ['qr-precache-old', 'qr-precache-9.9.9-test']);
});

test('similar parameter names and values do not trigger the kill switch', async () => {
  for (const query of ['?not-kill-sw=true', '?kill-sw=false', '?kill-sw=trueish']) {
    const event = dispatch(`${origin}/index.html${query}`);
    assert.equal(event.lifetime, undefined);
    assert.equal((await event.response).status, 200);
  }
  assert.equal(unregistered, 1);
  assert.equal(cacheMatches, 3);
});
