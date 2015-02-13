// Version 0.15

importScripts('/cache-polyfill.js');

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open('qrsnapper').then(function(cache) {
      return cache.addAll([
        '/',
        '/cache-polyfill.js',
        '/images/ic_camera_front_24px.svg',
        '/images/ic_camera_rear_24px.svg',
        '/styles/main.css',
        '/scripts/main.min.js',
        '/scripts/jsqrcode/qrworker.js',
        '/scripts/jsqrcode/grid.js',
        '/scripts/jsqrcode/version.js',
        '/scripts/jsqrcode/detector.js',
        '/scripts/jsqrcode/formatinf.js',
        '/scripts/jsqrcode/errorlevel.js',
        '/scripts/jsqrcode/bitmat.js',
        '/scripts/jsqrcode/datablock.js',
        '/scripts/jsqrcode/bmparser.js',
        '/scripts/jsqrcode/datamask.js',
        '/scripts/jsqrcode/rsdecoder.js',
        '/scripts/jsqrcode/gf256poly.js',
        '/scripts/jsqrcode/gf256.js',
        '/scripts/jsqrcode/decoder.js',
        '/scripts/jsqrcode/qrcode.js',
        '/scripts/jsqrcode/findpat.js',
        '/scripts/jsqrcode/alignpat.js',
        '/scripts/jsqrcode/databr.js']
        );
    })
  );
});

self.addEventListener('fetch', function(event) {
  var url = event.request.url;

  if(url !== "https://www.google-analytics.com/analytics.js") {
    event.respondWith(
    caches.match(event.request).then(function(response) {
      return response || fetch(event.request.url);
    })
  );
  }
  
});