// The service worker must only ever delete ITS OWN caches when it activates.
//
// CacheStorage is per ORIGIN, so `caches.keys()` can contain entries another application (or user
// storage) on the same origin created. The first version of the generated-precache change deleted
// every key that was not this release's cache name, which wiped those too (review finding
// qrcode-kr4). This test pins the scoped behaviour: our own stale versions go, everything else
// survives.
//
// app/sw.js is a service worker: it reads `self`, `caches` and the build-injected __APP_VERSION__
// at import time, so those are stubbed before the dynamic import. Node runs each test file in its
// own process, so the globals cannot leak into another suite.
import test from 'node:test';
import assert from 'node:assert/strict';

const VERSION = '9.9.9-test';
const EXISTING_CACHES = [
  `qr-precache-0.2.4`, // our own previous release - must be deleted
  `qr-precache-${VERSION}`, // this release - must be kept
  'unrelated-app-user-data', // another application on the same origin - must be kept
  'workbox-runtime', // a different namespace - must be kept
];

const listeners = new Map();
const deleted = [];
let claimed = false;
let unregistered = false;

globalThis.__APP_VERSION__ = VERSION;
globalThis.caches = {
  async keys() {
    return [...EXISTING_CACHES];
  },
  async delete(name) {
    deleted.push(name);
    return true;
  },
  async open() {
    throw new Error('activate must not need to open a cache');
  },
  async match() {
    return undefined;
  },
};
globalThis.self = {
  location: { origin: 'https://qr-snapper.test' },
  registration: { unregister: () => { unregistered = true; } },
  clients: { claim: async () => { claimed = true; } },
  addEventListener(type, handler) {
    listeners.set(type, handler);
  },
  skipWaiting() {},
};
globalThis.fetch = async () => {
  throw new Error('activate must not fetch');
};

await import('../../app/sw.js');

/** Run an ExtendableEvent listener and wait for its waitUntil() promise. */
async function dispatch(type) {
  const handler = listeners.get(type);
  assert.ok(handler, `app/sw.js should register a '${type}' listener`);
  const pending = [];
  handler({ waitUntil: (promise) => pending.push(promise) });
  await Promise.all(pending);
}

test('activate deletes only this app stale caches, and claims clients', async () => {
  await dispatch('activate');

  assert.deepEqual(deleted, ['qr-precache-0.2.4'], 'only our own stale version may be removed');
  assert.ok(claimed, 'activate should claim existing clients so an update takes effect immediately');
  assert.equal(unregistered, false, 'a routine activate must not unregister the worker');
});

test('activate leaves a foreign cache namespace alone even when it looks cache-like', async () => {
  // Same run, different framing of the guarantee: nothing outside `qr-precache-` is touched.
  deleted.length = 0;
  await dispatch('activate');
  assert.ok(
    !deleted.includes('unrelated-app-user-data') && !deleted.includes('workbox-runtime'),
    `activate must not delete other applications' caches (deleted: ${deleted.join(', ')})`
  );
  assert.deepEqual(deleted, ['qr-precache-0.2.4']);
});
