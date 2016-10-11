const dataStoreVersion = "0.1.2";
importScripts('/scripts/sw/router.js');
importScripts('/scripts/sw/fileManifest.js');

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
  const request = e.request;
  const url = new URL(e.request.url);

  e.respondWith(caches.open(dataStoreVersion).then(cache => {
    // Always return from the cache.
    return cache.match(request, {ignoreSearch: true}).then(response => {
      // Return the cache or the fetch if not there.
      return response;
    });
  }));
}, {urlMatchProperty: "origin"});

/*
  Handle requests to Google Analytics seperately
*/
router.get(/http[s]*:\/\/www.google-analytics.com/, (e)=>{
  console.log('Analytics request', e);
}, {urlMatchProperty: "origin"});

router.get(/.*/, e => {
  /* this just shows that the origin filter above works and all other requests
     are handled by this */
  console.log("Foreign Request", e.request)
});

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