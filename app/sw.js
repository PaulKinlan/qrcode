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
  Escape hatch. ABORT ABORT. Any URL with a kill-sw=true at the end of the query string.
*/
router.get(/\?kill-sw=true/, function() {
  self.registration.unregister();

  caches.keys().then(cacheKeys => Promise.all(cacheKeys.map(key => caches.delete(key))));
}, {urlMatchProperty: "search"});

/*
  Manage all the request for this origin in a cache only manner.
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
    const urls = ['/', ...manifest.files.map(file => `/${file}`)];
    const cache = await caches.open(PRECACHE_CACHE);
    await cache.addAll(urls);
  })());
});
