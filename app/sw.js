const dataStoreVersion = "0.2.1";
import {router} from  './scripts/sw/router.js';
import {requiredFiles} from './scripts/sw/fileManifest.js';

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
    caches.match(e.request, {ignoreSearch:true, cacheName: dataStoreVersion}).then(response => {
      return response || fetch(e.request);
    })
  );
}, {urlMatchProperty: "origin"});

self.addEventListener('activate', function(event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(dataStoreVersion).then(function(cache) {
      return cache.addAll(requiredFiles);
    })
  );
});
