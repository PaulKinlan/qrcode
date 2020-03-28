QR Snapper
==========

A simple, small, progressive web app that accesses the user's camera
and looks for QR Codes.

The QR Code library is a port of [JSQRCode](https://github.com/LazarSoft/jsqrcode) and has been ported to work inside a WebWorker for performance.

**Warning :** Contain a Google Analytics tracker.

Building yourself
=================

1. `npm install`
2. `gulp serve` to test locally
3. `gulp` to Building
4. This is deployed on Zeit, but you can host anywhere.

Note: All changes to the build need to be done in `gulpfile.babel.js` and then run `rollup gulpfile.babel.js -f cjs -o gulpfile.js` to get it
to work in gulp
