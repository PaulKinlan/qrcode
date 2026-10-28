// The service worker's kill switch (app/sw.js) is armed by `?kill-sw=true` on the EXACT root path
// only. It used to match on the whole origin, so the parameter on any other URL of the origin
// unregistered the worker and deleted the app's precache - an accidental trigger surface for a
// deliberate escape hatch (bead qrcode-1ks).
//
// app/sw.js registers its route table at import time, so `self` (and the cache/registration
// stubs) are defined before the dynamic import. node runs each test file in its own process.
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

test('kill switch matches the root URL in any query position and holds the fetch lifetime until cleanup', async () => {
  // A later query parameter counts too: the route reads searchParams, not a raw '?kill-sw' string.
  const event = dispatch(`${origin}/?source=offline&kill-sw=true`);
  assert.ok(event.lifetime, 'unregister and cache deletion must be held by waitUntil');
  assert.equal(event.response, undefined, 'kill route must preempt the cache-first origin route');
  assert.equal(unregistered, 1);
  assert.equal(cacheMatches, 0);
  assert.deepEqual(deleted, [], 'cleanup should wait for unregister');
  resolveUnregister(true);
  await event.lifetime;
  assert.deepEqual(deleted, ['qr-precache-old', 'qr-precache-9.9.9-test']);
});

test('a kill-sw parameter off the root path is served normally and arms nothing', async () => {
  // The scope narrowing that matters: any path on the origin used to trigger the kill switch.
  const unregistersBefore = unregistered;
  const matchesBefore = cacheMatches;
  for (const path of ['/index.html?kill-sw=true', '/about.html?kill-sw=true', '/deep/link?source=x&kill-sw=true']) {
    const event = dispatch(`${origin}${path}`);
    assert.equal(event.lifetime, undefined, `${path} must not unregister the worker`);
    assert.equal((await event.response).status, 200, `${path} must still be answered`);
  }
  assert.equal(unregistered, unregistersBefore, 'off-root kill-sw requests must not unregister');
  assert.equal(cacheMatches - matchesBefore, 3, 'off-root requests must go through the cache-first route');
  assert.deepEqual(deleted, ['qr-precache-old', 'qr-precache-9.9.9-test'], 'off-root requests must not delete caches');
});

test('similar parameter names and values do not trigger the kill switch', async () => {
  const unregistersBefore = unregistered;
  const matchesBefore = cacheMatches;
  for (const query of ['?not-kill-sw=true', '?kill-sw=false', '?kill-sw=trueish']) {
    const event = dispatch(`${origin}/${query}`);
    assert.equal(event.lifetime, undefined);
    assert.equal((await event.response).status, 200);
  }
  assert.equal(unregistered, unregistersBefore);
  assert.equal(cacheMatches - matchesBefore, 3);
});
