# QR Snapper

QR Snapper is a simple, small, progressive web app that accesses the user's camera and looks for QR Codes.

QR Snapper uses the native BarcodeDetector API for QR codes when available, and falls back to the [ZBar WebAssembly decoder](https://github.com/undecaf/zbar-wasm) in a Web Worker. The WASM asset is precached for offline scanning.

## Features

QR Snapper offers a seamless QR code scanning experience directly in your browser. Key features include:

* **Real-time QR Code Scanning:** Instantly decode QR codes using your device's camera.
* **Cross-Platform Compatibility:** Tested and optimized for major browsers (Chrome, Firefox, Safari) and mobile devices.
* **x-callback-url support:** Allows other applications to receive decoded QR code data after you confirm the callback destination and scanned content. Callback destinations must be HTTPS, or plain HTTP when the target is on this machine (see below).

The **Open**, **Share** and **Copy** buttons refuse scanned plain-HTTP URLs pointing off this device,
so the app does not hand an unencrypted destination to another browser or app (or the clipboard for
later pasting). HTTPS and HTTP loopback destinations such as `localhost`, `127.0.0.1` and `[::1]`
remain available. The result dialog stays open and explains the refusal.

### x-callback-url

Open the app with a `x-callback-url` query parameter naming the URL that should receive the scan:

```
https://qr-snapper.example/?x-callback-url=https%3A%2F%2Fexample.com%2Freturn
```

After a code is scanned the app shows a **Return** button naming the callback destination. It does not
send anything until you confirm, and the confirmation shows what will be sent (the whole value, or its
start and end plus the count of characters omitted from the preview for long values). On confirm the
scanned value is added as `?qrcode=...` and the browser navigates to the callback URL.

The destination must be `https:`. A plaintext `http:` destination is rejected, because the scanned
payload would travel in the clear and be readable by anything on the path. The one exception is a
destination on this machine - `http://localhost`, `http://127.0.0.1`, `http://[::1]` - where the
request never leaves the device; that keeps local development and desktop-app round trips working.

## Build Instructions

To set up QR Snapper locally, follow these steps:

1.  **Prerequisites:**
    * Node.js (v18 or later)
    * npm (v9 or later)
2.  **Installation:**
    * Clone the repository: `git clone https://github.com/PaulKinlan/qrcode.git`
    * Navigate to the project directory: `cd qrcode`
    * Install dependencies: `npm install`
3.  **Development:**
    * Run the development server: `npm run dev`
    * Open your browser to `http://localhost:8080`
4.  **Production Build:**
    * Build for production: `npm run build`
    * Preview the production build: `npm run preview`
5.  **Potential Issues:**
    * Ensure your Node.js and npm versions meet the prerequisites.
    * Camera access may require browser permissions.
    * Use HTTPS in production for camera and service worker support.

## Getting Started (Quick Start)

To quickly test QR Snapper, follow these steps:

1.  **Clone or Fork the Repository:**

    * \*Note: This step requires an internet connection.\*
    * Clone the repository directly, or fork it and then clone your fork:
        ```bash
        git clone https://github.com/PaulKinlan/qrcode.git
        ```
        or
        ```bash
        git clone https://github.com/YOUR_USERNAME/qrcode.git
        ```

2.  **Navigate to the Project Directory:**

    * Open a terminal and navigate to the `qrcode/` directory:
        ```bash
        cd qrcode
        ```

3.  **Install Dependencies:**

    * \*Note: This step requires an internet connection.\*
    * Run `npm install` to install the necessary dependencies (defined in `package.json`).

4.  **Run the tests (optional but recommended):**

    * `npm run test:fast` - builds and runs the unit tests (seconds)
    * `npm test` - builds and runs unit, post-build `dist/`, and headless browser tests

5.  **Open in Browser:**

    * Run `npm run dev`, then open `http://localhost:8080` in your browser. Do not open `app/index.html` as a `file://` URL; Vite serves the app's module and asset paths.

**Note:** Grant camera permission when prompted. Camera access and service workers require a secure context (localhost or HTTPS).

## Code Architecture

To better understand the codebase, here's a breakdown of the key components:

### Modern Modular Structure

The application is now organized into focused, maintainable modules:

* **`app/scripts/main.js`:**
    * Main entry point that initializes the application
    
* **`app/scripts/components/`:**
    * **`QRCodeCamera.js`** - Main application coordinator
    * **`camera/CameraManager.js`** - Manages canvas rendering and camera display
    * **`camera/CameraSource.js`** - Low-level camera API interface (modernized, no deprecated prefixes)
    * **`camera/WebCamManager.js`** - Real-time webcam handling with camera switching
    * **`camera/CameraFallbackManager.js`** - Image upload fallback when camera unavailable
    * **`dialogs/QRCodeManager.js`** - Result dialog with share/copy/navigate actions
    * **`dialogs/QRCodeCallbackController.js`** - x-callback-url integration
    * **`dialogs/QRCodeHelpManager.js`** - About/help dialog
    
* **`app/scripts/utils/`:**
    * **`url-utils.js`** - URL normalization and security validation
    
* **`app/scripts/qrclient.js`:**
    * Web Worker interface for QR code detection
    * Uses Comlink for seamless worker communication
    
* **`app/scripts/qrworker.js`:**
    * QR code detection worker implementation
    * Uses native BarcodeDetector API when available
    * Falls back to `@undecaf/zbar-wasm` when the native API is unavailable or fails
    * Loads `/scripts/zbar.wasm` as a separate asset, precached for offline scanning

### Modern Web APIs

The application uses modern browser APIs:
* **getUserMedia** - No deprecated webkit/moz/ms prefixes
* **BarcodeDetector API** - Native QR detection when available
* **Web Share API** - Share detected URLs
* **Clipboard API** - Copy URLs to clipboard
* **Service Workers** - Offline support and caching

### Offline mode and the kill switch

The page registers `/sw.js` on load, which precaches the app shell so scanning works offline. To
turn offline mode off, navigate to `/?kill-sw=true`. That URL shows a confirmation page and changes
nothing until you submit its form (which adds `confirm=1`, i.e. `/?kill-sw=true&confirm=1`): only
then does the worker unregister itself and delete the app's `qr-precache-*` caches. The confirmation
exists because unregistering and deleting the cache cannot be undone from the page, so a shared,
shortened or bookmarked link to that URL must not be able to wipe the offline copy on a single
click. The app needs a network connection until it has been opened online again, which re-registers
the worker.

`confirm=1` on its own is not consent: it is a public URL token, so a crafted link to
`/?kill-sw=true&confirm=1` would otherwise wipe the offline copy with no page shown and no click.
The destructive navigation therefore also needs proof from the confirmation page: either its
same-origin referrer or the page's random, single-use form token. The token lets confirmation work
when a browser strips referrers; it is kept briefly in the offline worker's storage so a worker
restart does not strand an open confirmation page. A link with `confirm=1` but no valid proof
only shows the confirmation page, so the worst a crafted link can do is ask.

### Framing (clickjacking)

The app document must not be framed by another origin. The result panel carries buttons that act on
what was just scanned - **Open** navigates to the decoded URL and **Return** sends it to the
x-callback-url destination - so a framing page can place an overlay over them and turn a user's
click into a transfer they did not intend. Camera permission alone does not protect against this:
the attacker only needs one click.

`frame-ancestors` is a response-header directive. A `<meta http-equiv="Content-Security-Policy">`
is **ignored** for it, so it cannot be set from `app/index.html` - and adding it there would look
fixed while doing nothing. The policy ships in three places instead:

* `app/_headers` - the static-host form (Netlify and Cloudflare Pages read `_headers`); it is
  copied into `dist/` by the build.
* `server.headers` / `preview.headers` in `vite.config.js` - so `npm run dev`, `npm run preview`
  and every smoke run against them send the headers too.
* Any other host or reverse proxy - **you have to add them yourself.** The two headers are:

  ```
  Content-Security-Policy: frame-ancestors 'none'
  X-Frame-Options: DENY
  ```

  `X-Frame-Options` is there for engines that do not implement `frame-ancestors`.

### Referrer-Policy

The app URL itself can carry sensitive query values: the `x-callback-url` destination handed in
when another app opens the scanner, and the service-worker kill-switch consent token
(`?kill-sw=true&confirm=1&consent=<32 hex>`). The browser default
(`strict-origin-when-cross-origin`) sends the full URL - query included - to any same-origin
receiver, so the document pins `Referrer-Policy: same-origin`: same-origin receivers keep the
URL, cross-origin receivers get no `Referer` at all. It ships in three places:

* `app/_headers` and `server.headers` / `preview.headers` in `vite.config.js` - the same
  surfaces as the framing policy above.
* a `<meta name="referrer" content="same-origin">` in `app/index.html` - unlike
  `frame-ancestors`, the referrer policy **is** honoured from a `<meta>` tag, so a host that
  reads neither header file still gets the policy. Any other host or reverse proxy should send
  `Referrer-Policy: same-origin` itself for defence in depth.

The x-callback integration does not depend on this: the callback destination confirms every
transfer from the `qrcode` parameter on its own URL and never trusts the referrer.

### Worker CSP

A `<meta>` CSP applies to the document only, so the service worker (`/sw.js`) and the decoder
worker run with no policy unless their script responses carry one. The header file scopes CSP
blocks to the worker paths - and deliberately not to `/*`: a document response CSP would
combine with the meta policy and strip `img-src data: blob:`, breaking the camera-fallback
upload (bead qrcode-2pt). The two values, which must stay path-scoped:

```
/sw.js
  Content-Security-Policy: default-src 'none'; script-src 'self'; connect-src 'self'
/scripts/*
  Content-Security-Policy: default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'
```

The decoder policy must keep `'wasm-unsafe-eval'` and `connect-src 'self'`: the worker fetches
`scripts/zbar.wasm` and compiles it, and dropping either directive fails every scan. On a host
or reverse proxy that does not read `_headers`, add these two blocks yourself - without them
the worker contexts run unpoliced (bead qrcode-7du). `vite dev`/`preview` cannot scope headers
per path, so workers are unpoliced in local development; this is a recorded residual, not a
gap to fill by widening the document policy.

### Development Notes

* The project uses Vite as the build tool (replaced Gulp)
* Modern ES modules throughout (`"type": "module"`)
* No Babel transpilation needed for modern browsers
* Optimized production builds with Rollup under the hood
* Tests use the Node built-in test runner (`node --test`), so there is no test framework
  dependency; `app/` is bundled by Vite and only DOM-free modules are unit tested

## Contributing

We welcome contributions to QR Snapper! Please follow these guidelines:

1.  **Reporting Issues:**
    * Use the GitHub issue tracker to report bugs or suggest feature requests.
2.  **Development Setup:**
    * Fork the repository and create a branch for your changes.
3.  **Coding Standards:**
    * Follow the existing code style and conventions.
4.  **Pull Requests:**
    * Submit pull requests with clear descriptions of your changes.
    * Ensure your code is tested and documented.

## License

This project's own code is licensed under the Apache License 2.0 (see `LICENSE`).
The distributed ZBar WASM decoder is `@undecaf/zbar-wasm` 0.11.0, licensed
LGPL-2.1-or-later. Its license is included at `/licenses/zbar-wasm.txt` in the
built app; its upstream source and build instructions are at
https://github.com/undecaf/zbar-wasm/tree/0.11.0 (also available from the
package's `repository` field). The decoder binary is a separate file so it
can be replaced independently of the application bundle.
