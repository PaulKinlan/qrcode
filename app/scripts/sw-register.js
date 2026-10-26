// Service-worker registration for the app shell.
//
// This lives in its own file, loaded as a CLASSIC script at the end of <body>, because the caller
// (app/index.html) is served under a Content-Security-Policy that deliberately has no
// 'unsafe-inline': every bit of script on the page has to be a same-origin URL. An inline
// registration block was the only thing keeping 'unsafe-inline' in the policy (bead qrcode-3bc).
//
// Classic, not `type="module"`: it must run while the document is still parsing, before the
// deferred `scripts/main.js` module starts the app, exactly as the inline block did.
//
// The kill-switch navigation (?kill-sw=true) must not undo the worker's own unregister() during
// page load: see the kill route in app/sw.js.
if ('serviceWorker' in navigator && new URL(location.href).searchParams.get('kill-sw') !== 'true') {
  navigator.serviceWorker.register('/sw.js', { scope: '/', type: 'module' })
    .then(function () { console.log("Service Worker Registered"); });
}
