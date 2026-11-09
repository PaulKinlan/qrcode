// The service worker's kill switch (app/sw.js) is armed by `?kill-sw=true` on the EXACT root URL of
// this origin's navigation requests only. It used to match on the whole origin, so the parameter on any other URL of the
// origin unregistered the worker and deleted the app's precache - an accidental trigger surface for
// a deliberate escape hatch (bead qrcode-1ks). The scope is origin AND root pathname: the worker's
// fetch listener sees third-party subresources too, and those can have a '/' pathname (qrcode-6a3).
//
// The scope is not the only hazard. `unregister()` + `caches.delete()` cannot be undone from the
// page, so a single navigable link - shared, shortened, bookmarked, or on another site - must not
// run the cleanup: the route now asks first and only acts on the confirm form's `confirm=1`
// (bead qrcode-78c). These tests pin both halves: nothing is destroyed without the confirm token,
// and a confirmed submission with the page's referrer OR one-use consent token runs cleanup.
//
// app/sw.js registers its route table at import time, so `self` (and the cache/registration
// stubs) are defined before the dynamic import. node runs each test file in its own process.
import test from 'node:test';
import assert from 'node:assert/strict';

const origin = 'https://qr-snapper.test';
const listeners = new Map();

// Registration/cache state the worker mutates. `pending` is the deferred the unregister stub hands
// back, so a test can prove work is held until it settles; `failWith` makes it reject instead.
const state = {
  unregistered: 0,
  deleted: [],
  cacheMatches: 0,
  pending: null,
  failWith: null,
};

const consentCaches = new Map();
const resetState = () => {
  consentCaches.clear();
  state.unregistered = 0;
  state.deleted = [];
  state.cacheMatches = 0;
  state.pending = null;
  state.failWith = null;
};

globalThis.__APP_VERSION__ = '9.9.9-test';
globalThis.self = {
  location: { origin },
  registration: { unregister() {
    state.unregistered++;
    if (state.failWith) return Promise.reject(state.failWith);
    return new Promise((resolve, reject) => { state.pending = { resolve, reject }; });
  } },
  addEventListener(type, handler) { listeners.set(type, handler); },
};
globalThis.caches = {
  async keys() { return ['qr-precache-old', 'qr-precache-9.9.9-test', 'unrelated-app', ...consentCaches.keys()]; },
  async delete(key) { state.deleted.push(key); consentCaches.delete(key); return true; },
  async match() { state.cacheMatches++; return new Response('cached'); },
  async open(name) {
    if (!consentCaches.has(name)) consentCaches.set(name, new Map());
    const entries = consentCaches.get(name);
    return {
      async match(key) { return entries.get(key)?.clone(); },
      async put(key, value) { entries.set(key, value.clone()); },
    };
  },
};

await import('../../app/sw.js');

/** The confirmation page's own URL, i.e. the referrer its form submission carries. */
const CONFIRMATION_PAGE = `${origin}/?kill-sw=true`;

function dispatch(url, mode = 'navigate', referrer = '') {
  let lifetime;
  let response;
  listeners.get('fetch')({
    // Node's Request constructor cannot represent navigation mode; the router only reads these fields.
    request: { url, method: 'GET', mode, referrer },
    waitUntil(promise) { lifetime = promise; },
    respondWith(promise) { response = promise; },
  });
  return { lifetime, response };
}

// A stubbed unregister never settles on its own, so every destructive path needs this to finish.
async function settle() {
  assert.ok(state.pending, 'the kill switch should have called unregister()');
  state.pending.resolve(true);
  await Promise.resolve();
}

test('a plain kill-sw navigation only asks, and destroys nothing', async () => {
  // The whole point of qrcode-78c: clicking a link that carries ?kill-sw=true must not be able to
  // wipe the offline copy on its own. A later query parameter counts too - the route reads
  // searchParams, not a raw '?kill-sw' string.
  resetState();
  for (const url of [`${origin}/?kill-sw=true`, `${origin}/?source=offline&kill-sw=true`]) {
    const event = dispatch(url);
    assert.equal(event.lifetime, undefined, 'a confirmation page is not a waitUntil background task');
    const response = await event.response;
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Turn off offline mode\?/);
  }

  assert.equal(state.unregistered, 0, 'no unregister before the user confirms');
  assert.deepEqual(state.deleted, [], 'no cache deletion before the user confirms');
  assert.equal(state.cacheMatches, 0, 'the kill route must still preempt the cache-first origin route');
});

test('the confirmation page asks with a script-free same-origin GET form, and submits a token the route honours', async () => {
  resetState();
  const response = await dispatch(`${origin}/?kill-sw=true`).response;
  const html = await response.text();

  // No JS at all: the page has to work with the network gone and without loosening the policy.
  assert.doesNotMatch(html, /<script/i, 'the confirmation page must not need a script');
  assert.doesNotMatch(html, /https?:\/\/(?!qr-snapper\.test)/i, 'the page must load nothing off-origin');

  const headers = response.headers;
  assert.match(headers.get('content-type'), /^text\/html/);
  const policy = headers.get('content-security-policy');
  assert.match(policy, /default-src 'none'/);
  assert.match(policy, /form-action 'self'/, 'the confirm form must be allowed to submit to this origin');
  assert.equal(headers.get('cache-control'), 'no-store');
  // The old referrer proof remains valid; privacy settings that strip it use the form token.
  assert.equal(headers.get('referrer-policy'), 'same-origin');

  // The form the page renders must be the URL the route treats as confirmed. Deriving the
  // submission from the page (rather than writing it out again) is what keeps the two in step.
  const form = html.match(/<form method="get" action="([^"]+)">([\s\S]*?)<\/form>/i);
  assert.ok(form, 'the page must offer a form to submit');
  const pairs = [...form[2].matchAll(/<input type="hidden" name="([^"]+)" value="([^"]+)">/gi)]
    .map(([, name, value]) => [name, value]);
  assert.equal(pairs.length, 3, 'confirmation form also carries a one-use consent token');
  const token = pairs.find(([name]) => name === 'consent')?.[1];
  assert.match(token, /^[0-9a-f]{32}$/);
  assert.deepEqual(pairs.filter(([name]) => name !== 'consent').sort(), [['confirm', '1'], ['kill-sw', 'true']]);
  assert.match(html, /href="\/"[^>]*>Keep offline mode/, 'cancelling must go back to the app');

  const submission = new URL(form[1], origin);
  for (const [name, value] of pairs) submission.searchParams.set(name, value);

  assert.equal(state.unregistered, 0, 'rendering the page must not have destroyed anything');
  assert.deepEqual(state.deleted, []);

  const confirmed = dispatch(submission.href, 'navigate', `${origin}/?kill-sw=true`);
  await settle();
  const done = await confirmed.response;
  assert.equal(done.status, 200);
  assert.match(await done.text(), /Offline mode is off/);
  assert.equal(state.unregistered, 1);
  assert.deepEqual(state.deleted, ['qr-precache-old', 'qr-precache-9.9.9-test', 'qr-precache-9.9.9-test-consent'],
    'only this app\'s precaches and its consent cache may be deleted');
});

test('empty-Referer form submission completes with its single-use consent token', async () => {
  resetState();
  const ask = await (await dispatch(CONFIRMATION_PAGE).response).text();
  const token = ask.match(/name="consent" value="([0-9a-f]{32})"/)?.[1];
  assert.ok(token, 'the ask page must mint a token that survives until submission');
  const confirmed = dispatch(`${CONFIRMATION_PAGE}&confirm=1&consent=${token}`, 'navigate', '');
  await new Promise((resolve) => setImmediate(resolve));
  await settle();
  assert.match(await (await confirmed.response).text(), /Offline mode is off/);
  assert.equal(state.unregistered, 1);
  assert.deepEqual(state.deleted, ['qr-precache-old', 'qr-precache-9.9.9-test',
    'qr-precache-9.9.9-test-consent']);

  const replay = dispatch(`${CONFIRMATION_PAGE}&confirm=1&consent=${token}`, 'navigate', '');
  assert.match(await (await replay.response).text(), /Turn off offline mode\?/,
    'consumed token must not remove the offline copy a second time');
  assert.equal(state.unregistered, 1);
});

test('consent tokens survive in CacheStorage and are scoped to a short lifetime', async () => {
  resetState();
  const originalNow = Date.now;
  let now = originalNow();
  Date.now = () => now;
  try {
    const first = (await (await dispatch(CONFIRMATION_PAGE).response).text())
      .match(/name="consent" value="([0-9a-f]{32})"/)?.[1];
    const second = (await (await dispatch(CONFIRMATION_PAGE).response).text())
      .match(/name="consent" value="([0-9a-f]{32})"/)?.[1];
    assert.ok(first && second && first !== second, 'each ask page needs its own random token');
    const stored = consentCaches.get('qr-precache-9.9.9-test-consent');
    assert.ok(stored?.size, 'tokens must persist in CacheStorage across worker restarts');
    now += 11 * 60 * 1000;
    const expired = dispatch(`${CONFIRMATION_PAGE}&confirm=1&consent=${first}`, 'navigate', '');
    assert.match(await (await expired.response).text(), /Turn off offline mode\?/);
    assert.equal(state.unregistered, 0, 'an expired token cannot trigger cleanup');
  } finally { Date.now = originalNow; }
});

test('forged or absent tokens without a valid Referer cannot remove the offline copy', async () => {
  resetState();
  for (const suffix of ['&confirm=1', '&confirm=1&consent=deadbeef',
    '&confirm=1&consent=00000000000000000000000000000000']) {
    const event = dispatch(`${CONFIRMATION_PAGE}${suffix}`, 'navigate', '');
    assert.match(await (await event.response).text(), /Turn off offline mode\?/);
  }
  assert.equal(state.unregistered, 0);
  assert.deepEqual(state.deleted, []);
});

test('multiple open confirmation pages keep their own valid token', async () => {
  resetState();
  const first = (await (await dispatch(CONFIRMATION_PAGE).response).text())
    .match(/name="consent" value="([0-9a-f]{32})"/)?.[1];
  await (await dispatch(CONFIRMATION_PAGE).response).text();
  const confirmed = dispatch(`${CONFIRMATION_PAGE}&confirm=1&consent=${first}`, 'navigate', '');
  await new Promise((resolve) => setImmediate(resolve));
  await settle();
  assert.match(await (await confirmed.response).text(), /Offline mode is off/);
});

test('the confirmed kill switch cleans up before answering, and only for this app\'s caches', async () => {
  resetState();
  const event = dispatch(`${origin}/?kill-sw=true&confirm=1`, 'navigate', CONFIRMATION_PAGE);
  assert.equal(event.lifetime, undefined, 'the page the user lands on is the response, not a side task');

  // The response must not resolve until the cleanup is done: a "done" page that arrives first
  // could be shown while the cache is still there.
  assert.deepEqual(state.deleted, [], 'deletion waits for unregister');
  await settle();
  const response = await event.response;
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Offline mode is off/);
  assert.equal(state.unregistered, 1);
  assert.deepEqual(state.deleted, ['qr-precache-old', 'qr-precache-9.9.9-test']);
});

test('only the literal confirm=1 arm the destructive step', async () => {
  resetState();
  for (const query of ['kill-sw=true&confirm=0', 'kill-sw=true&confirm=true',
    'kill-sw=true&confirm=yes', 'kill-sw=true&confirm=', 'kill-sw=true&confirm=11']) {
    const event = dispatch(`${origin}/?${query}`, 'navigate', CONFIRMATION_PAGE);
    assert.match(await (await event.response).text(), /Turn off offline mode\?/, `${query} must only ask`);
  }
  assert.equal(state.unregistered, 0, 'no near-miss value may unregister the worker');
  assert.deepEqual(state.deleted, []);
});

test('the public confirm token alone is not consent: unproven navigations only ask', async () => {
  // qrcode-8vv: ?kill-sw=true&confirm=1 is a public URL token, so a crafted link or cross-origin
  // form would otherwise wipe the offline copy with no page and no click. A valid referrer or
  // one-use token from the confirmation page must also be present.
  resetState();
  const notFromThePage = [
    ['no referrer at all', ''],
    ['a cross-origin referrer', 'https://evil.example/?kill-sw=true'],
    ['a lookalike origin', 'https://qr-snapper.test.evil.example/?kill-sw=true'],
    ['this origin but not the ask page', `${origin}/`],
    ['this origin, another page', `${origin}/about.html?kill-sw=true`],
    ['this origin, the ask page on another path', `${origin}/index.html?kill-sw=true`],
    ['a malformed referrer', 'not a url'],
  ];

  for (const [label, referrer] of notFromThePage) {
    const event = dispatch(`${origin}/?kill-sw=true&confirm=1`, 'navigate', referrer);
    assert.match(await (await event.response).text(), /Turn off offline mode\?/,
      `${label} must only be shown the ask page`);
  }

  assert.equal(state.unregistered, 0, 'no unconfirmed navigation may unregister the worker');
  assert.deepEqual(state.deleted, [], 'no unconfirmed navigation may delete the precache');
});

test('a failed cleanup is reported honestly instead of claiming success', async () => {
  resetState();
  state.failWith = new Error('unregister failed');
  const logged = [];
  const realError = console.error;
  console.error = (...args) => logged.push(args);
  try {
    const event = dispatch(`${origin}/?kill-sw=true&confirm=1`, 'navigate', CONFIRMATION_PAGE);
    const response = await event.response;
    assert.equal(response.status, 200);
    assert.match(await response.text(), /could not be turned off/);
  } finally {
    console.error = realError;
  }
  assert.equal(logged.length, 1, 'the failure must leave a diagnostic trace in the worker console');
  assert.deepEqual(state.deleted, [], 'no cache may be dropped when the worker could not be unregistered');
});

test('root kill-sw subresource requests are served normally and never unregister the worker', async () => {
  // Only a navigation may arm the hatch, so neither the confirmation page nor the cleanup may be
  // reached by an image, script or fetch of the same URL.
  resetState();
  for (const mode of ['no-cors', 'cors', 'same-origin']) {
    for (const query of ['kill-sw=true', 'kill-sw=true&confirm=1']) {
      const event = dispatch(`${origin}/?${query}`, mode);
      assert.equal(event.lifetime, undefined, `${mode} ${query} must not unregister`);
      assert.equal((await event.response).status, 200, `${mode} ${query} must use the cache-first route`);
    }
  }
  assert.equal(state.unregistered, 0, 'a subresource must never arm the kill switch, confirmed or not');
  assert.equal(state.cacheMatches, 6);
  assert.deepEqual(state.deleted, [], 'subresource requests must not delete caches');
});

test('a kill-sw parameter off the root path is served normally and arms nothing', async () => {
  // The scope narrowing that matters: any path on the origin used to trigger the kill switch.
  resetState();
  for (const path of ['/index.html?kill-sw=true', '/about.html?kill-sw=true&confirm=1',
    '/deep/link?source=x&kill-sw=true']) {
    const event = dispatch(`${origin}${path}`);
    assert.equal(event.lifetime, undefined, `${path} must not unregister the worker`);
    assert.equal((await event.response).status, 200, `${path} must still be answered`);
  }
  assert.equal(state.unregistered, 0);
  assert.equal(state.cacheMatches, 3, 'off-root requests must go through the cache-first route');
  assert.deepEqual(state.deleted, []);
});

test('a cross-origin request whose pathname is / does not arm the kill switch', async () => {
  // The worker's fetch listener also sees third-party subresources, and for those the pathname can
  // be '/': matching on pathname alone armed the kill switch from another origin, which the old
  // origin-matched route could not do (bead qrcode-6a3).
  resetState();
  for (const url of ['https://evil-cdn.example/?kill-sw=true&confirm=1',
    'https://qr-snapper.test.evil.example/?kill-sw=true']) {
    const event = dispatch(url);
    assert.equal(event.lifetime, undefined, `${url} must not unregister the worker`);
    assert.equal(event.response, undefined, 'no route of this worker answers another origin');
  }
  assert.equal(state.unregistered, 0);
  assert.equal(state.cacheMatches, 0, 'another origin must not be served from this origin cache');
  assert.deepEqual(state.deleted, []);
});

test('similar parameter names and values do not trigger the kill switch', async () => {
  resetState();
  for (const query of ['?not-kill-sw=true', '?kill-sw=false', '?kill-sw=trueish']) {
    const event = dispatch(`${origin}/${query}`);
    assert.equal(event.lifetime, undefined);
    assert.equal((await event.response).status, 200);
  }
  assert.equal(state.unregistered, 0);
  assert.equal(state.cacheMatches, 3);
});
