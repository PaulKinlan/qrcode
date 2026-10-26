// The service-worker fetch router (bead qrcode-cl1). Three latent correctness bugs lived here,
// none of them reachable through the app's two current routes, which is exactly why they are
// pinned by tests rather than left to the next person who adds a route:
//
//  1. Route patterns were interpolated raw into `new RegExp` and only end-anchored, so every
//     metacharacter in a pattern was live and every route was a SUFFIX match.
//  2. post() registered into the GET table, so a POST route could never match.
//  3. matchRoute wrote per-request params onto the shared route object, so two overlapping fetch
//     events on one parameterised route raced and the earlier callback read the later params.
//
// app/scripts/sw/router.js registers a top-level fetch listener, so `self` is stubbed before the
// dynamic import (node runs each test file in its own process, so nothing leaks).
//
// The router is a singleton with ONE route table, so these tests must not collide: every test
// registers its routes on its own hostname and its own path prefix. A pathname route matches on
// any origin, and app/sw.js's origin route matches every same-origin URL, so sharing either would
// make one test's route answer another's request.
import test from 'node:test';
import assert from 'node:assert/strict';

const listeners = new Map();

globalThis.self = {
  addEventListener(type, handler) {
    listeners.set(type, handler);
  },
};

const { router } = await import('../../app/scripts/sw/router.js');

const url = (host, pathname) => new URL(pathname, `https://${host}`);
const pathnameRoute = { urlMatchProperty: 'pathname' };
const noop = () => {};

test('a dot in a route pattern means a dot, not any character', () => {
  router.get('/sw-manifest.json', noop, pathnameRoute);

  assert.ok(router.findRoute(url('dots.test', '/sw-manifest.json'), 'get'), 'the literal path must still match');
  // '.' was a wildcard before the fix, so this path matched the route.
  assert.equal(router.findRoute(url('dots.test', '/sw-manifestXjson'), 'get'), undefined);
});

test('routes are anchored at both ends, not only at the end', () => {
  router.get('/scan-image', noop, pathnameRoute);

  assert.ok(router.findRoute(url('anchor.test', '/scan-image'), 'get'), 'the literal path must still match');
  // '$' alone made every route a suffix match, so a prefixed path matched it.
  assert.equal(router.findRoute(url('anchor.test', '/anything/scan-image'), 'get'), undefined);
  assert.equal(router.findRoute(url('anchor.test', '/scan-image/extra'), 'get'), undefined);
});

test('params are captured, and a captured segment still stops at a dot', () => {
  router.get('/callback/:name', noop, pathnameRoute);

  assert.deepEqual(router.findRoute(url('params.test', '/callback/alice'), 'get').params, { name: 'alice' });
  assert.equal(router.findRoute(url('params.test', '/callback/alice.json'), 'get'), undefined);
  assert.equal(router.findRoute(url('params.test', '/callback'), 'get'), undefined);
});

test('post() registers a POST route, not a GET one', () => {
  const handler = () => {};
  router.post('/post-only', handler, pathnameRoute);

  const post = router.findRoute(url('post.test', '/post-only'), 'POST');
  assert.ok(post, 'a POST route must match a POST request');
  assert.equal(post.route.callback, handler);
  assert.equal(router.findRoute(url('post.test', '/post-only'), 'get'), undefined,
    'a POST route must not be reachable as a GET route');
  assert.equal(router.findRoute(url('post.test', '/post-only'), 'delete'), undefined, 'unknown methods never match');
});

test('the origin-matching route style app/sw.js uses still matches its own origin', () => {
  // app/sw.js registers `${self.location.origin}` with urlMatchProperty "origin": the escaping fix
  // must not break the one pattern set that ships.
  router.get('https://origin-match.test', noop, { urlMatchProperty: 'origin' });

  assert.ok(router.findRoute(url('origin-match.test', '/index.html'), 'get'), 'same-origin request must match');
  assert.equal(router.findRoute(url('origin-other.test', '/index.html'), 'get'), undefined);
});

test('two interleaved matches on one parameterised route keep their own params', () => {
  router.get('/shared/:id', noop, pathnameRoute);

  const first = router.findRoute(url('shared.test', '/shared/one'), 'get');
  const second = router.findRoute(url('shared.test', '/shared/two'), 'get');

  assert.equal(first.route, second.route, 'both matches resolve to the same registered route');
  // Before the fix both reads returned "two": params lived on the shared route object.
  assert.deepEqual(first.params, { id: 'one' });
  assert.deepEqual(second.params, { id: 'two' });
  assert.equal(first.route.params, undefined, 'matches must not mutate the shared route object');
});

test('the fetch listener hands each event its own params', () => {
  const seen = [];
  router.get('/listener/:id', (event, context) => { seen.push(context.params); }, pathnameRoute);

  const listener = listeners.get('fetch');
  assert.equal(typeof listener, 'function', 'app/scripts/sw/router.js must register a fetch listener');

  const dispatch = (pathname) => {
    listener({
      request: new Request(url('listener.test', pathname)),
      respondWith() {},
      waitUntil() {},
    });
  };

  dispatch('/listener/first');
  dispatch('/listener/second');

  assert.deepEqual(seen, [{ id: 'first' }, { id: 'second' }]);
});

test('an unsupported method is refused at registration, not silently stored', () => {
  assert.throws(() => router.registerRoute('put', '/x', noop), /unsupported method "put"/);
});
