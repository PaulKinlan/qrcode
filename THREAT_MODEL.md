# QR Snapper - Threat Model

This is the **tracked** threat model for this repository. Code comments, tests and the deployment
header file cite it by section and invariant number, so a clone is self-describing: an auditor,
reviewer or new contributor can resolve every `THREAT_MODEL.md §6, invariant N` citation without
access to any generated or out-of-tree report.

Two rules keep it useful:

1. **Change behaviour, change this file in the same commit.** An invariant that no longer matches
   the code is worse than no invariant at all - it is a false assurance.
2. **Cite it as `THREAT_MODEL.md §6, invariant N`.** The canonical form is enforced by
   `test/unit/threat-model-invariants.test.mjs`, which also fails when a cited invariant number is
   absent from this file (the drift guard).

## 1. System overview

A static-hosted PWA with no server component of its own.

- **Build**: Vite (`vite.config.js`) bundles `app/index.html` and `app/scripts/*` into `dist/`,
  copies the public files (`app/_headers` included), and walks `dist/` to write
  `/sw-manifest.json` (the precache list, versioned from `package.json`).
- **Decode path**: camera frames (`CameraSource` / `WebCamManager`) or an uploaded image
  (`CameraFallbackManager`) -> canvas -> the `qrclient.js` module worker (Comlink) ->
  `native-detector.js` (BarcodeDetector) or `worker-detector.js` + `@undecaf/zbar-wasm`.
  QR symbols only; frames are processed on the device.
- **Result path**: `qrclient.decode` -> `normalizeUrl` -> `isSafeUrl` -> the `QRCodeManager`
  dialog -> **Open** / **Share** / **Copy** / **Return** (x-callback), each gated again by
  `isTransportSafeUrl`.
- **Offline path**: `app/sw.js` installs a versioned precache (`qr-precache-<version>`), serves
  same-origin GETs cache-first, and exposes a two-step kill switch that unregisters the worker and
  deletes only `qr-precache-*` caches.
- **Transport config**: `app/_headers` (static-host form, Netlify/Cloudflare Pages), plus
  `server.headers` / `preview.headers` in `vite.config.js` for dev, preview and the smoke harness.

## 2. Trust boundaries and actors

Actors: **maintainer/developer** (trusted: owns source, build and host config); **end user** (owns
the device, grants camera permission, and is the only authority that can send a scan anywhere);
**scanned-content author** (untrusted: anyone who can print or post a QR code, or hand the user an
image file); **x-callback destination origin** (semi-trusted third party named by the *inbound*
link, untrusted until the user confirms); **static host / reverse-proxy operator** (decides whether
`_headers` is honoured at all); **npm registry and dependency authors** (build time).

Boundaries crossed:

| Boundary | Where it is crossed |
| --- | --- |
| Scanned payload: code or image bytes -> string | decoder worker -> `qrclient.decode` -> `normalizeUrl` |
| Decoded string -> browser sinks | `QRCodeManager` (navigation, share sheet, clipboard), `QRCodeCallbackController` (x-callback navigation) |
| Camera frames -> canvas -> worker | `CameraManager` draw loop, `qrclient` worker boundary |
| Inbound URL query -> UI and service worker | `x-callback-url`, `kill-sw`, `confirm`, `consent` |
| Network <-> CacheStorage inside the SW | precache manifest fetch, cache-first fetch fallback |
| SW-synthesised HTML -> the user's form submission | kill-switch ask / confirmation pages |
| Source tree -> build output -> deployed response headers | `vite.config.js`, `app/_headers`, the host |
| npm registry -> build toolchain | lockfile, vendored licence copy |

## 3. Explicitly trusted (not threats)

Audits should not flag the following; they are developer-authored and reviewed as source:

- `app/`, `vite.config.js`, `tools/`, `test/` source. Router patterns in `app/scripts/sw/router.js`
  are constants: the regex is built from escaped literal text, anchored at both ends, and a raw
  `RegExp` is refused at registration. The `.exec()` calls there are not an injection or ReDoS sink.
- `tools/preview-smoke.mjs`: loopback-only listener, port chosen by the OS, child processes spawned
  with argv arrays (never a shell string), process identity re-validated from `/proc`.
- The service worker, its precache contents and this origin's `CacheStorage` entries (integrity is
  derived from `dist/` at build time).
- Files the user picks themselves in the file picker - the user is the authority - within the
  MIME/size limits in §6.
- Plaintext HTTP to a loopback origin: an intentional, documented exception (§7).
- Build and test artefacts (`dist/`, `node_modules/`), and the vendored LGPL ZBar licence copy.

## 4. Untrusted attack surfaces

1. **QR payload**: arbitrary UTF-8/bytes from a printed code or an image file. Sinks are
   `location` navigation, `navigator.share`, `navigator.clipboard.writeText` and the x-callback
   `?qrcode=` navigation.
2. **Inbound link query parameters**: `x-callback-url` (any `https:` origin, or `http:` loopback),
   and `kill-sw` / `confirm` / `consent` on the destructive route.
3. **Network responses consumed by the worker**: the precache manifest fetch, and the cache-miss
   `fetch(e.request)` fallback.
4. **Uploaded image bytes**: MIME type and size are client-controlled.
5. **Third-party code**: `@undecaf/zbar-wasm` 0.11.0 (WASM) and `comlink` 4.4.2, both exactly
   pinned and lockfile-verified, plus caret-ranged build tooling (`vite`, `terser`).
6. **Deployed HTTP response headers**: the framing, referrer, `nosniff`, HSTS and worker CSP
   policies exist only if the host honours `app/_headers` or equivalent config. Outside app control.
7. **Camera permission and device**: live video of the user's surroundings; frames never leave the
   device.

## 5. Failure shapes to re-check

Historically this codebase broke in a small number of recurring ways. Each is a question to ask of
any new code, not a settled issue:

- **Over-broad matching** (qrcode-cl1, qrcode-1ks, qrcode-6a3): does a new route match more than it
  names, and is every new route registered *before* the origin catch-all?
- **Public URL token treated as consent** (qrcode-8vv, qrcode-78c): does a new destructive path
  require unforgeable, short-lived proof, or does a shareable query parameter suffice?
- **Off-origin precache entry** (qrcode-g3y): does every manifest entry go through `toPrecacheUrl`?
- **Sink inconsistency** (qrcode-4ow): does every new sink reuse the shared gate, or does it
  re-implement it (or skip it)?
- **Security config that silently does nothing** (qrcode-22b, qrcode-2pt, qrcode-aa0, qrcode-7du):
  is the control asserted on the response or behaviour, not on config text?
- **Over-broad cache deletion** (qrcode-kr4), worker-update/cache mismatch (qrcode-kkh).
- **Unbounded decode hang** (qrcode-g4y, qrcode-sze).
- **False-green tests** (qrcode-an4, qrcode-deq, qrcode-8xk): does the test fail when the invariant
  breaks, or does it only claim success?

## 6. Security invariants for auditors

Numbered for citation. Invariants 6 and 12 are the ones the code and tests cite explicitly.

1. Every decoded payload is normalised once (`normalizeUrl`) before it is displayed, and every sink
   re-gates at click time. Open, Share and Copy require `isTransportSafeUrl` - the `isSafeUrl`
   protocol allowlist, plus no cleartext `http:` off loopback. Return requires its *destination* to
   pass `isWebCallback` (`https:`, or `http:` on loopback) and appends the payload to that validated
   destination instead of navigating to the payload itself.
2. The x-callback destination must be `https:` or `http:` loopback, is revalidated at click time,
   and nothing is sent without an explicit confirm that names the destination origin and previews
   the payload.
3. No scanned content reaches any sink without explicit user action, and non-web schemes
   (`mailto:`, `tel:`, `sms:`) always prompt.
4. The kill route acts only on a same-origin *navigation* to `/` carrying `kill-sw=true`,
   `confirm=1` and unforgeable proof (same-origin ask-page referrer, or a 32-hex single-use token);
   `confirm=1` alone only ever shows the ask page.
5. Only caches prefixed `qr-precache-` are deleted; other applications on the origin survive.
6. Every precache manifest entry is a same-origin relative path (resolved through
   `toPrecacheUrl`), and the manifest version equals `__APP_VERSION__`.
7. Router patterns are strings (a `RegExp` is refused), escaped, and anchored at both ends; the
   origin catch-all stays last. Never build a route pattern from a runtime value containing `:` -
   the `:name` syntax would reinterpret a port suffix.
8. No shell strings: child processes use argv arrays. No `eval` / `new Function` / `setTimeout`
   with a string. No DOM HTML sinks (`innerHTML`, `document.write`) - all payload rendering is
   `textContent` / `innerText`.
9. The document CSP keeps `'unsafe-inline'` out and sets `object-src 'none'`, `base-uri 'none'`
   and `form-action 'self'`. `'wasm-unsafe-eval'` appears only where ZBar must compile: the app
   document (the camera-fallback upload path) and the `/scripts/*` worker header - never in the
   `/sw.js` policy, where nothing compiles (§7).
10. Decode is time-bounded (`DECODE_TIMEOUT_MS`); a wedged worker is terminated and replaced after
    `MAX_CONSECUTIVE_DECODE_TIMEOUTS`, and failures surface in the UI.
11. Uploads enforce an `image/*` MIME type and a 10 MiB cap before the image is decoded. There is
    no pixel-dimension cap: the draw path clamps the pixels handed to the decoder to the
    viewport-sized canvas, but the browser's image decoder still allocates the file's natural
    dimensions first - accepted risk, §7.
12. Header-only protections (`frame-ancestors`, `X-Frame-Options`, `Referrer-Policy`, `nosniff`,
    HSTS, worker CSP) are asserted on the served response, never assumed from a `<meta>` tag or a
    config file.
13. `Referrer-Policy: same-origin` keeps the app URL - which can carry an x-callback destination or
    a consent token - out of cross-origin referrers.

## 7. Accepted risks and exclusions

Do not "fix" these without changing this section first:

- **Plaintext HTTP to loopback is allowed.** `isLoopbackHost` accepts `localhost`, `[::1]` and
  127.0.0.0/8, so a scanned payload can be delivered - by the user's own click - to any service
  running locally on any port (localhost CSRF against dev servers and desktop agents). Intentional
  and consent-gated; report it only if the loopback definition widens.
- **Dev/preview worker contexts run without a path-scoped CSP.** Vite cannot scope headers per
  path, so `/sw.js` and the decoder worker are unpoliced on the local HTTP server. Widening the
  document policy to compensate breaks the camera-fallback upload and the WASM compile
  (qrcode-2pt).
- **Host-side header deployment is the operator's responsibility** for hosts that do not read
  `_headers`. README documents the exact values to copy.
- **HSTS deliberately omits `includeSubDomains`**, and the local HTTP server never sends HSTS.
- **`'wasm-unsafe-eval'` is required** for the ZBar decoder, in the app-document meta CSP and in
  the `/scripts/*` worker header; removing either fails scans with a `CompileError` (qrcode-2pt). It
  stays out of the `/sw.js` policy, where no WASM is compiled.
- **Image decode is bounded by the 10 MiB file cap only.** No pixel-dimension cap exists before the
  image is decoded; the canvas clamp happens after the browser has already allocated the file's
  natural dimensions. The size cap is the accepted control (invariant 11).
- **The expired 2018 `<meta http-equiv="origin-trial">` tag** in `app/index.html` is inert, not a
  policy bypass.
- **ZBar WASM is LGPL-2.1-or-later**, shipped as a separately replaceable binary with its licence;
  upstream source is referenced in README.
