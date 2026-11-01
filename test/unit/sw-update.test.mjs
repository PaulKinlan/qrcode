// A new release must never take over documents running the previous one (bead qrcode-kkh).
//
// The install handler used to call self.skipWaiting(), and activate then deleted the previous
// release's qr-precache-* cache and claimed every client. A tab still running build N therefore
// lost the cache its own worker was serving from and started being answered by the build N+1
// worker, whose fetch route matches PRECACHE_CACHE only - so N's asset URLs became misses. That is
// version skew inside one document, not a clean update.
//
// Two invariants are pinned here:
//   1. install() never calls skipWaiting(), so the new worker waits for the previous release's
//      documents to go away instead of being activated underneath them.
//   2. activate() leaves the predecessor cache AND its clients alone while this registration still
//      controls a window, and only then deletes the stale cache and claims (which is what keeps a
//      first visit offline-capable in its first document - there is no controlled client then).
//
// app/sw.js is a service worker: it reads self, caches and the build-injected __APP_VERSION__ at
// import time, so the stubs are installed before the dynamic import. Node runs each test file in
// its own process, so those globals cannot leak into another suite.
import test from 'node:test';
import assert from 'node:assert/strict';

const VERSION = '9.9.9-test';
const PRECACHE_CACHE = `qr-precache-${VERSION}`;
const PREDECESSOR_CACHE = 'qr-precache-0.2.4';

const listeners = new Map();
const deleted = [];
const manifestUrls = [];
let skipWaitingCalls = 0;
let claimCalls = 0;
let windowClients = [];

globalThis.__APP_VERSION__ = VERSION;
globalThis.self = {
  location: { origin: 'https://qr-snapper.test' },
  registration: { unregister() { return Promise.resolve(true); } },
  clients: {
    matchAll() { return Promise.resolve(windowClients); },
    claim() { claimCalls++; return Promise.resolve(); },
  },
  addEventListener(type, handler) { listeners.set(type, handler); },
  // The regression pin: nothing may call this, at import time or from install.
  skipWaiting() { skipWaitingCalls++; },
};
globalThis.caches = {
  async keys() {
    return [PREDECESSOR_CACHE, PRECACHE_CACHE, 'unrelated-app-user-data'];
  },
  async delete(name) {
    deleted.push(name);
    return true;
  },
  async match() { return undefined; },
  async open() {
    return { async addAll(urls) { manifestUrls.push(...urls); } };
  },
};
globalThis.fetch = async () => new Response(
  JSON.stringify({ version: VERSION, files: ['index.html', 'scripts/main.js'] }),
  { status: 200 }
);

await import('../../app/sw.js');

/** Run an ExtendableEvent listener and wait for its waitUntil() promise. */
async function dispatch(type) {
  const handler = listeners.get(type);
  assert.ok(handler, `app/sw.js should register a '${type}' listener`);
  const pending = [];
  handler({ waitUntil: (promise) => pending.push(promise) });
  await Promise.all(pending);
}

test('install lets the new worker wait instead of activating under the old release', async () => {
  await dispatch('install');

  assert.equal(skipWaitingCalls, 0, 'install must not call skipWaiting(): that is what skews open documents');
  assert.deepEqual(
    manifestUrls,
    ['/', 'https://qr-snapper.test/index.html', 'https://qr-snapper.test/scripts/main.js'],
    'the new release must still precache itself while it waits'
  );
});

test('activate with no controlled window removes the predecessor cache and claims clients', async () => {
  deleted.length = 0;
  claimCalls = 0;
  windowClients = [];

  await dispatch('activate');

  assert.deepEqual(deleted, [PREDECESSOR_CACHE], 'only our own stale version may be removed');
  assert.equal(claimCalls, 1, 'a first visit must be controlled (and so offline-capable) in its first document');
});

test('activate keeps the predecessor cache and its clients while a window is still controlled', async () => {
  deleted.length = 0;
  claimCalls = 0;
  windowClients = [{ id: 'client-on-the-previous-release', type: 'window' }];

  await dispatch('activate');

  assert.deepEqual(
    deleted,
    [],
    'deleting the cache a still-open document is being served from is what made its asset misses fatal'
  );
  assert.equal(claimCalls, 0, 'claiming would hand that document to a worker whose cache does not contain its assets');
});
