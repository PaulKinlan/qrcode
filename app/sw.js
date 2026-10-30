import {router} from  './scripts/sw/router.js';

/*
  Cache names carry the app version, which the build injects from package.json
  (`define: {__APP_VERSION__}` in vite.config.js). Bumping package.json therefore invalidates
  the offline cache, and there is no second place to remember to bump.
*/
const VERSION = __APP_VERSION__;
const CACHE_PREFIX = 'qr-precache-';
const PRECACHE_CACHE = `${CACHE_PREFIX}${VERSION}`;

/*
  The precache list is generated at build time by walking dist/ (vite.config.js,
  generatePrecacheManifest) into /sw-manifest.json. Adding an asset needs no edit here.
*/
const PRECACHE_MANIFEST_URL = '/sw-manifest.json';

/*
  Resolve one manifest entry to a precache URL, refusing anything that leaves this origin.

  The list used to be built by string concatenation (`/${file}`), so an entry such as
  `//evil.com/x.js` - or `/\evil.com/x.js`, which the URL parser reads the same way - became a
  third-party URL, and cache.addAll() would fetch and store that response for the fetch handler to
  serve on same-origin requests (bead qrcode-g3y, threat-model invariant 6: every manifest entry is
  a same-origin relative path). The manifest is generated from dist/ at build time, so this is
  defence in depth: a violating entry fails the install loudly instead of caching a foreign file.
*/
const toPrecacheUrl = (entry) => {
  if (typeof entry !== 'string' || entry.trim() === '') {
    throw new Error(`precache manifest entry must be a non-empty string: ${JSON.stringify(entry)}`);
  }

  const url = new URL(entry, `${self.location.origin}/`);
  if (url.origin !== self.location.origin) {
    throw new Error(`precache manifest entry ${JSON.stringify(entry)} resolves off-origin to ${url.origin}`);
  }

  return url.href;
};

/*
  Escape hatch: unregister this worker and clear its precache on an explicit kill-sw=true request.

  Scoped to the EXACT same-origin root URL. This route used to match on the whole origin, so a
  `?kill-sw=true` on any same-origin URL - a subresource fetch, a shared or bookmarked link -
  unregistered the worker and wiped the offline cache (bead qrcode-1ks). The pathname alone is not
  a sufficient scope either: the worker's fetch listener also sees third-party subresources, whose
  pathname can be '/', so the predicate requires this origin as well (bead qrcode-6a3). Only
  Only a navigation to `/?kill-sw=true` on this origin arms it: a cross-site image or fetch of
  that URL must not unregister the worker. Every other request keeps the normal behaviour.
*/
router.get('/', function(event) {
  event.waitUntil((async () => {
    await self.registration.unregister();
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX)).map(key => caches.delete(key)));
  })());
}, {urlMatchProperty: "pathname", matches: (url, event) =>
  url.origin === self.location.origin &&
  url.searchParams.get('kill-sw') === 'true' &&
  event.request.mode === 'navigate'});

/*
  Serve this origin's cached assets first, falling back to the network on a miss.

  This is the only route that matches on "origin", and it must stay last: it answers every
  same-origin request, so a narrower route (the kill switch above) has to win first.
*/
router.get(`${self.location.origin}`, e => {
  e.respondWith(
    caches.match(e.request, {ignoreSearch:true, cacheName: PRECACHE_CACHE}).then(response => {
      return response || fetch(e.request);
    })
  );
}, {urlMatchProperty: "origin"});

self.addEventListener('activate', function(event) {
  event.waitUntil((async () => {
    // A versioned cache name means every release would otherwise leave its predecessor behind.
    // Only OUR caches may be removed: CacheStorage is per origin, and other applications or user
    // storage on the same origin must survive this worker activating (review finding qrcode-kr4 -
    // deleting every key not equal to this release's name was over-broad).
    const keys = await caches.keys();
    const stale = keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== PRECACHE_CACHE);
    await Promise.all(stale.map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('install', function(e) {
  self.skipWaiting();

  e.waitUntil((async () => {
    const response = await fetch(PRECACHE_MANIFEST_URL, {cache: 'no-store'});
    if (!response.ok) {
      throw new Error(`precache manifest ${PRECACHE_MANIFEST_URL} returned HTTP ${response.status}`);
    }

    const manifest = await response.json();
    if (manifest.version !== VERSION) {
      // A worker precaching a different release's assets would serve a mismatched app.
      throw new Error(`precache manifest is v${manifest.version} but this worker is v${VERSION}`);
    }

    // '/' is the navigable entry point; cache.addAll() fails the install if any asset 404s,
    // which is what turns a stale asset list into a visible failure instead of an offline 404.
    // Every manifest entry is resolved through toPrecacheUrl(), so a non-relative entry cannot
    // pull another origin's content into the precache (bead qrcode-g3y).
    const urls = ['/', ...manifest.files.map(toPrecacheUrl)];
    const cache = await caches.open(PRECACHE_CACHE);
    await cache.addAll(urls);
  })());
});
