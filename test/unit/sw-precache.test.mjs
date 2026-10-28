// The install handler must only precache THIS origin (bead qrcode-g3y).
//
// The precache list was built by string concatenation (`/${file}`), so a manifest entry starting
// with '//' (or '/\', which the URL parser reads the same way) resolved to a third-party origin and
// cache.addAll() would have stored that content - which the worker's fetch handler then serves for
// same-origin requests. The manifest is generated from dist/ at build time, so this is defence in
// depth for threat-model invariant 6: every entry is a same-origin relative path.
//
// app/sw.js registers its listeners at import time, so the stubs are installed before each dynamic
// import. Each case imports the module under its own query string: the module keeps its own route
// table and install listener, and node runs each test file in its own process.
import test from 'node:test';
import assert from 'node:assert/strict';

const origin = 'https://qr-snapper.test';
const listeners = new Map();
const added = [];
let manifestFiles = [];
let fetchCount = 0;

globalThis.__APP_VERSION__ = '9.9.9-test';
globalThis.self = {
  location: { origin },
  skipWaiting() {},
  clients: { claim() { return Promise.resolve(); } },
  registration: { unregister() { return Promise.resolve(true); } },
  addEventListener(type, handler) { listeners.set(type, handler); },
};
globalThis.caches = {
  async keys() { return []; },
  async delete() { return true; },
  async match() { return undefined; },
  async open() {
    return {
      async addAll(urls) { added.push(...urls); },
      async keys() { return []; },
    };
  },
};
globalThis.fetch = async () => {
  fetchCount++;
  return new Response(JSON.stringify({ version: '9.9.9-test', files: manifestFiles }), { status: 200 });
};

let moduleId = 0;

/** Import app/sw.js with the given manifest entries and run its install handler. */
async function install(files) {
  manifestFiles = files;
  added.length = 0;
  fetchCount = 0;
  await import(`../../app/sw.js?case=${moduleId++}`);

  let lifetime;
  listeners.get('install')({ waitUntil(promise) { lifetime = promise; } });
  assert.ok(lifetime, 'the install handler must hold its work with waitUntil');
  return lifetime;
}

test('same-origin manifest entries are precached, with the root entry point first', async () => {
  await install(['index.html', 'scripts/main.js']);

  assert.equal(fetchCount, 1, 'the manifest is fetched exactly once');
  assert.deepEqual(added, ['/', `${origin}/index.html`, `${origin}/scripts/main.js`]);
});

test('an origin-relative entry with a leading slash is still this origin', async () => {
  await install(['/scripts/main.js']);

  assert.deepEqual(added, ['/', `${origin}/scripts/main.js`]);
});

test('a scheme-relative entry resolving to another origin fails the install and caches nothing', async () => {
  // The reported case: '/' + '//evil.com/x.js' used to become 'https://evil.com/x.js'.
  await assert.rejects(install(['//evil.com/x.js']), /resolves off-origin to https:\/\/evil\.com/);
  assert.deepEqual(added, [], 'a violating manifest must not reach cache.addAll()');
});

test('a backslash variant that the URL parser reads as scheme-relative also fails the install', async () => {
  // '/\evil.com/x.js' is parsed as '//evil.com/x.js': the browser normalises the backslash.
  await assert.rejects(install(['/\\evil.com/x.js']), /resolves off-origin to https:\/\/evil\.com/);
  assert.deepEqual(added, [], 'a violating manifest must not reach cache.addAll()');
});

test('an absolute URL to another origin fails the install', async () => {
  await assert.rejects(install(['scripts/main.js', 'https://evil.com/x.js']), /resolves off-origin/);
  assert.deepEqual(added, [], 'the whole list is validated before anything is cached');
});

test('a non-string or empty entry fails the install instead of being stringified into a URL', async () => {
  for (const entry of [null, 42, '', '   ', { path: 'index.html' }]) {
    await assert.rejects(
      install([entry]),
      /precache manifest entry must be a non-empty string/,
      `${JSON.stringify(entry)} must be refused`
    );
    assert.deepEqual(added, []);
  }
});
