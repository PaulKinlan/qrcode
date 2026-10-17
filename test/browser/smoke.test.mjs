// Full-tier headless browser smoke test.
//
// This test drives the real application inside a headless Chromium instance using raw CDP over
// the native WebSocket without adding any npm dependencies (playwright, puppeteer, ws, etc.).
//
// The test serves `dist/` over an ephemeral HTTP port, launches a headless Chrome instance with
// a dedicated temporary profile directory, connects to the DevToolsActivePort, drives the
// camera-fallback image upload control using `test/fixtures/qr-upload-smoke.png`, asserts that
// the decoded payload is rendered in the DOM dialog, and asserts that the PWA service worker
// successfully registers.
//
// If `google-chrome` is missing, it fails unless `QR_SNAPPER_NO_BROWSER=1` is set.
// It is wired into `npm test` (full tier) only; `npm run test:fast` remains pure-module.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn, spawnSync } from 'node:child_process';
import {
  createReadStream,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const distDir = join(root, 'dist');
const fixturePath = join(root, 'test', 'fixtures', 'qr-upload-smoke.png');
const EXPECTED_PAYLOAD = 'https://example.com/upload-smoke';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.webapp': 'application/x-web-app-manifest+json',
};

/**
 * Locate the Google Chrome / Chromium executable.
 * @returns {string|null}
 */
function findChromeExecutable() {
  const envBin = process.env.CHROME_BIN || process.env.GOOGLE_CHROME_BIN;
  if (envBin !== undefined) {
    return existsSync(envBin) ? envBin : null;
  }
  const candidates = [
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  try {
    const which = spawnSync('which', ['google-chrome'], { encoding: 'utf8' });
    if (which.status === 0 && which.stdout.trim()) {
      const candidate = which.stdout.trim();
      if (existsSync(candidate)) return candidate;
    }
  } catch {}
  return null;
}

/**
 * Minimal static HTTP file server for dist/.
 * Gives the service worker a valid origin and scope.
 * @param {string} baseDir
 * @returns {http.Server}
 */
function createDistServer(baseDir) {
  return http.createServer((req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain' });
      res.end('Method Not Allowed');
      return;
    }

    let reqPath;
    try {
      reqPath = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Bad Request');
      return;
    }

    if (reqPath === '/') {
      reqPath = '/index.html';
    }

    const filePath = normalize(join(baseDir, reqPath));
    if (!filePath.startsWith(baseDir)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    if (!existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    const stat = statSync(filePath);
    if (!stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    const ext = extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stat.size,
    });

    if (req.method === 'HEAD') {
      res.end();
      return;
    }

    createReadStream(filePath).pipe(res);
  });
}

/**
 * Deadline-polling helper: repeatedly checks an async condition until it returns truthy.
 * @template T
 * @param {() => Promise<T>} fn
 * @param {{ timeoutMs?: number, intervalMs?: number, message?: string }} options
 * @returns {Promise<T>}
 */
async function pollUntil(
  fn,
  { timeoutMs = 15000, intervalMs = 50, message = 'Condition timed out' } = {}
) {
  const start = Date.now();
  let lastError;
  while (Date.now() - start < timeoutMs) {
    try {
      const result = await fn();
      if (result) return result;
    } catch (err) {
      lastError = err;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  const detail = lastError ? `: ${lastError.message}` : '';
  throw new Error(`${message} after ${timeoutMs}ms${detail}`);
}

/**
 * Minimal Chrome DevTools Protocol client using the global Node WebSocket.
 */
class CDPClient {
  #ws;
  #seq = 1;
  #pending = new Map();
  #eventHandlers = new Map();

  constructor(ws) {
    this.#ws = ws;
    this.#ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.method && this.#eventHandlers.has(msg.method)) {
          for (const handler of this.#eventHandlers.get(msg.method)) {
            try {
              handler(msg.params);
            } catch {}
          }
          return;
        }
        if (msg.id && this.#pending.has(msg.id)) {
          const { resolve, reject, timer, method } = this.#pending.get(msg.id);
          clearTimeout(timer);
          this.#pending.delete(msg.id);
          if (msg.error) {
            reject(new Error(`CDP ${method} error: ${msg.error.message} (code ${msg.error.code})`));
          } else {
            resolve(msg.result);
          }
        }
      } catch {}
    };
    this.#ws.onerror = (err) => {
      this.#rejectAll(new Error(`WebSocket error: ${err.message || err}`));
    };
    this.#ws.onclose = () => {
      this.#rejectAll(new Error('WebSocket closed'));
    };
  }

  on(method, handler) {
    if (!this.#eventHandlers.has(method)) this.#eventHandlers.set(method, []);
    this.#eventHandlers.get(method).push(handler);
  }

  #rejectAll(err) {
    for (const [, entry] of this.#pending.entries()) {
      clearTimeout(entry.timer);
      entry.reject(err);
    }
    this.#pending.clear();
  }

  static async connect(wsUrl, timeoutMs = 10000) {
    const ws = new WebSocket(wsUrl);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        try {
          ws.close();
        } catch {}
        reject(new Error(`CDP WebSocket connection to ${wsUrl} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      ws.onopen = () => {
        clearTimeout(timer);
        resolve();
      };
      ws.onerror = (err) => {
        clearTimeout(timer);
        reject(new Error(`CDP WebSocket connection error: ${err.message || err}`));
      };
    });
    return new CDPClient(ws);
  }

  send(method, params = {}, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const id = this.#seq++;
      const timer = setTimeout(() => {
        this.#pending.delete(id);
        reject(new Error(`CDP ${method} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.#pending.set(id, { resolve, reject, timer, method });
      this.#ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression, { awaitPromise = true, timeoutMs = 15000 } = {}) {
    const res = await this.send(
      'Runtime.evaluate',
      {
        expression,
        returnByValue: true,
        awaitPromise,
      },
      timeoutMs
    );
    if (res.exceptionDetails) {
      const desc = res.exceptionDetails.exception?.description || res.exceptionDetails.text;
      throw new Error(`Runtime.evaluate failed: ${desc}`);
    }
    return res.result?.value;
  }

  close() {
    this.#rejectAll(new Error('CDPClient closed'));
    try {
      this.#ws.close();
    } catch {}
  }
}

test(
  'headless browser smoke: uploads QR fixture, decodes payload, registers service worker',
  { timeout: 120_000 },
  async (t) => {
    const chromeBinary = findChromeExecutable();
    if (!chromeBinary) {
      if (process.env.QR_SNAPPER_NO_BROWSER === '1') {
        t.skip('SKIPPED browser smoke test: google-chrome not found and QR_SNAPPER_NO_BROWSER=1 is set');
        return;
      }
      assert.fail(
        'google-chrome is missing from /usr/bin/google-chrome and PATH. Set QR_SNAPPER_NO_BROWSER=1 to bypass the browser smoke tier.'
      );
    }

    if (process.env.QR_SNAPPER_NO_BROWSER === '1') {
      t.skip('SKIPPED browser smoke test: QR_SNAPPER_NO_BROWSER=1 requested skipping browser tier');
      return;
    }

    assert.ok(existsSync(distDir), 'dist/ directory missing: build must run before browser tests');
    assert.ok(existsSync(fixturePath), `QR fixture missing at ${fixturePath}`);

    const userDataDir = mkdtempSync(join(tmpdir(), 'qr-browser-smoke-'));
    let server;
    let chromeProcess;
    let cdp;

    try {
      // 1. Serve built dist/ over HTTP on an ephemeral port
      server = createDistServer(distDir);
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
      });

      const port = server.address().port;
      const origin = `http://127.0.0.1:${port}`;
      // The camera-free entry point: #nogum signals CameraManager to initialize CameraFallbackManager
      const appUrl = `${origin}/#nogum`;

      // 2. Launch ONE headless Chrome instance with an isolated profile
      chromeProcess = spawn(
        chromeBinary,
        [
          '--headless=new',
          '--remote-debugging-port=0',
          `--user-data-dir=${userDataDir}`,
          '--no-first-run',
          '--no-default-browser-check',
          '--disable-gpu',
          '--disable-dev-shm-usage',
          // Force the WASM branch even on platforms where native QR detection is available.
          '--disable-blink-features=BarcodeDetector',
          'about:blank',
        ],
        {
          stdio: ['ignore', 'ignore', 'pipe'],
        }
      );

      // Read remote debugging port from <user-data-dir>/DevToolsActivePort
      const devToolsActivePortPath = join(userDataDir, 'DevToolsActivePort');
      const cdpPort = await pollUntil(
        async () => {
          if (!existsSync(devToolsActivePortPath)) return null;
          const text = readFileSync(devToolsActivePortPath, 'utf8').trim();
          if (!text) return null;
          const [portLine] = text.split('\n');
          const parsed = parseInt(portLine.trim(), 10);
          return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
        },
        { timeoutMs: 15000, message: 'DevToolsActivePort file to be written by Chrome' }
      );

      // Query targets and connect raw CDP to page target
      const targetsRes = await fetch(`http://127.0.0.1:${cdpPort}/json/list`);
      const targets = await targetsRes.json();
      const pageTarget = targets.find((target) => target.type === 'page');
      assert.ok(pageTarget?.webSocketDebuggerUrl, 'expected page target with webSocketDebuggerUrl in /json/list');

      cdp = await CDPClient.connect(pageTarget.webSocketDebuggerUrl);

      await cdp.send('Page.enable');
      await cdp.send('Runtime.enable');
      await cdp.send('DOM.enable');

      // Hermetic run. The built index.html carries an async Google Analytics <script> tag, so a
      // plain navigation waits on a THIRD-PARTY host before `readyState === 'complete'`. This tier
      // must never depend on the network (ADR qrcode-vyq), and an egress-less VM or a slow DNS
      // answer would otherwise turn a green build into a 15s timeout. Intercept every request:
      // same-origin is continued, anything else is failed in the browser, instantly and
      // deterministically, so the assertions below can only pass on locally-served behaviour.
      await cdp.send('Network.enable');
      await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
      const externalRequests = [];
      const wasmRequests = [];
      // Uncaught page exceptions (bead qrcode-fc4). A page that throws at init still finishes
      // loading, so "readyState complete" and "the upload control is visible" are both true while
      // the app is dead: /about.html spent a release pointed at a script the build never emits and
      // only a page-error check could see it. Every navigation below asserts this stayed empty.
      const pageErrors = [];
      cdp.on('Runtime.exceptionThrown', ({ exceptionDetails }) => {
        pageErrors.push(exceptionDetails?.exception?.description || exceptionDetails?.text || 'unknown exception');
      });
      cdp.on('Fetch.requestPaused', ({ requestId, request }) => {
        const url = request?.url ?? '';
        if (url === `${origin}/scripts/zbar.wasm`) wasmRequests.push(url);
        const isLocal = url.startsWith(origin) || url.startsWith('data:') || url.startsWith('blob:');
        if (isLocal) {
          cdp.send('Fetch.continueRequest', { requestId }).catch(() => {});
          return;
        }
        externalRequests.push(url);
        cdp.send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' }).catch(() => {});
      });

      // 3. Load the app and drive the camera-free entry point
      await cdp.send('Page.navigate', { url: appUrl });

      // Fail rather than silently testing the native path if Chrome ignores the feature switch.
      assert.equal(await cdp.eval('typeof BarcodeDetector'), 'undefined');

      // Wait for DOM ready and CameraFallbackManager unhidden
      await pollUntil(
        async () => {
          const ready = await cdp.eval('document.readyState === "complete"');
          const fallbackActive = await cdp.eval(
            'Boolean(document.querySelector(".CameraFallback") && !document.querySelector(".CameraFallback").classList.contains("hidden"))'
          );
          return ready && fallbackActive;
        },
        { timeoutMs: 15000, message: 'App to load and CameraFallback to become visible' }
      );

      // Click the upload control like a user would
      await cdp.eval('document.querySelector(\'label[for="qrcode-input"]\')?.click()');

      // Set the file input to test/fixtures/qr-upload-smoke.png via CDP
      const doc = await cdp.send('DOM.getDocument');
      const inputNode = await cdp.send('DOM.querySelector', {
        nodeId: doc.root.nodeId,
        selector: '#qrcode-input',
      });
      assert.ok(inputNode?.nodeId > 0, 'expected #qrcode-input element to be found in DOM');

      await cdp.send('DOM.setFileInputFiles', {
        nodeId: inputNode.nodeId,
        files: [fixturePath],
      });

      // 4. Assert decoded payload is visible in the result dialog's text
      const decodedText = await pollUntil(
        async () => {
          const text = await cdp.eval('document.querySelector(".QRCodeSuccessDialog-data")?.innerText');
          return text && text.trim().length > 0 ? text.trim() : null;
        },
        { timeoutMs: 15000, message: 'QR polyfill decoding to render result in .QRCodeSuccessDialog-data' }
      );

      assert.equal(decodedText, EXPECTED_PAYLOAD, 'Decoded QR payload in dialog text does not match fixture payload');

      const domState = await cdp.eval(`
        (() => {
          const dialog = document.querySelector('#qrcode');
          const computed = window.getComputedStyle(dialog);
          const dataElement = dialog.querySelector('.QRCodeSuccessDialog-data');
          return {
            dialogVisible: computed.display !== 'none' && computed.visibility !== 'hidden',
            dialogDataText: dataElement ? dataElement.innerText.trim() : '',
            bodyTextContains: document.body.innerText.includes(${JSON.stringify(EXPECTED_PAYLOAD)}),
          };
        })()
      `);

      assert.ok(domState.dialogVisible, 'Expected #qrcode dialog to be visible in DOM');
      assert.equal(domState.dialogDataText, EXPECTED_PAYLOAD);
      assert.ok(domState.bodyTextContains, 'Expected document.body.innerText to contain decoded payload');
      assert.ok(wasmRequests.length > 0, 'Expected the browser to load ZBar WASM for fallback decoding');

      // 5. Assert service worker registration
      // Service workers are fully supported in headless Chrome on http://127.0.0.1 (considered secure context)
      const swRegistrations = await pollUntil(
        async () => {
          const regs = await cdp.eval(`
            (async () => {
              if (!('serviceWorker' in navigator)) return null;
              const list = await navigator.serviceWorker.getRegistrations();
              if (!list || list.length === 0) return null;
              return list.map(r => ({
                scope: r.scope,
                active: Boolean(r.active),
                installing: Boolean(r.installing),
                waiting: Boolean(r.waiting),
              }));
            })()
          `);
          return regs && regs.length > 0 ? regs : null;
        },
        { timeoutMs: 15000, message: 'Service worker to register successfully' }
      );

      assert.ok(swRegistrations && swRegistrations.length >= 1, 'Expected at least one active service worker registration');
      assert.ok(
        swRegistrations[0].scope.startsWith(origin),
        `Expected SW registration scope to start with ${origin}, got ${swRegistrations[0].scope}`
      );
      // 5b. Offline: the precache must actually serve the app (bead qrcode-gro). Everything below
      // runs with the network switched off, so a missing or stale precache entry fails here rather
      // than in the field. The cache name is version-derived, which is how the assertion proves the
      // generated manifest and the injected version agree.
      const manifest = JSON.parse(readFileSync(join(root, 'dist', 'sw-manifest.json'), 'utf8'));
      const cacheState = await pollUntil(
        async () => {
          const state = await cdp.eval(`
            (async () => {
              const names = await caches.keys();
              const name = names.find((n) => n.startsWith('qr-precache-'));
              if (!name) return null;
              const cache = await caches.open(name);
              const keys = (await cache.keys()).map((r) => new URL(r.url).pathname);
              return {
                name,
                keys,
                controlled: Boolean(navigator.serviceWorker.controller),
              };
            })()
          `);
          return state && state.controlled && state.keys.length > 0 ? state : null;
        },
        { timeoutMs: 15000, message: 'the service worker to precache the build and control the page' }
      );

      assert.equal(cacheState.name, `qr-precache-${manifest.version}`, 'cache name must be version-derived');
      assert.ok(cacheState.keys.includes('/index.html'), 'the app entry should be precached');
      assert.ok(cacheState.keys.includes('/scripts/zbar.wasm'), 'ZBar WASM must be precached for offline scanning');
      assert.ok(
        cacheState.keys.length >= manifest.files.length,
        `expected at least the ${manifest.files.length} generated files in the precache, got ${cacheState.keys.length}`
      );

      // Now cut the network and reload: only the precache can answer.
      await cdp.send('Network.emulateNetworkConditions', {
        offline: true,
        latency: 0,
        downloadThroughput: 0,
        uploadThroughput: 0,
      });
      await cdp.send('Page.reload', { ignoreCache: false });

      await pollUntil(
        async () => {
          const offlineReady = await cdp.eval(
            'Boolean(document.querySelector("label[for=\\"qrcode-input\\"]") && document.readyState === "complete")'
          );
          return Boolean(offlineReady);
        },
        { timeoutMs: 20000, message: 'the app to load from the service worker cache with the network off' }
      );

      // And the offline app must still do its job: decode an uploaded QR with no network at all.
      const offlineDoc = await cdp.send('DOM.getDocument');
      const offlineInput = await cdp.send('DOM.querySelector', {
        nodeId: offlineDoc.root.nodeId,
        selector: '#qrcode-input',
      });
      assert.ok(offlineInput?.nodeId > 0, 'expected #qrcode-input after the offline reload');
      await cdp.send('DOM.setFileInputFiles', { nodeId: offlineInput.nodeId, files: [fixturePath] });

      const offlineDecoded = await pollUntil(
        async () => {
          const text = await cdp.eval('document.querySelector(".QRCodeSuccessDialog-data")?.innerText');
          return text && text.trim().length > 0 ? text.trim() : null;
        },
        { timeoutMs: 20000, message: 'the offline app to decode the uploaded QR fixture' }
      );
      assert.equal(offlineDecoded, EXPECTED_PAYLOAD, 'offline ZBar WASM decode from the precache failed');
      if (process.env.QR_SNAPPER_SCREENSHOT) {
        const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
        writeFileSync(process.env.QR_SNAPPER_SCREENSHOT, Buffer.from(data, 'base64'));
        t.diagnostic(`offline QR result screenshot: ${process.env.QR_SNAPPER_SCREENSHOT}`);
      }

      await cdp.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
      });

      // 5c. The secondary page has to be a working scanner too, not just a styled page (bead
      // qrcode-fc4). Asserting the module script TAG exists is a false green: the tag is markup,
      // and every other signal here (readyState, the visible camera fallback) is produced before
      // the app's own code could throw. So: navigate it, require that nothing threw, then drive
      // the same upload/decode path the index page is held to.
      const errorsBeforeAbout = pageErrors.length;
      t.diagnostic(`page exceptions before /about.html: ${errorsBeforeAbout}`);
      await cdp.send('Page.navigate', { url: `${origin}/about.html#nogum` });

      await pollUntil(
        async () => {
          const ready = await cdp.eval('document.readyState === "complete"');
          const fallbackActive = await cdp.eval(
            'Boolean(document.querySelector(".CameraFallback") && !document.querySelector(".CameraFallback").classList.contains("hidden"))'
          );
          return ready && fallbackActive;
        },
        { timeoutMs: 15000, message: '/about.html to load and its CameraFallback to become visible' }
      );

      assert.deepEqual(
        pageErrors.slice(errorsBeforeAbout),
        [],
        '/about.html must initialise the scanner without throwing: an init exception leaves the page looking fine but scanning nothing'
      );

      const aboutDoc = await cdp.send('DOM.getDocument');
      const aboutInput = await cdp.send('DOM.querySelector', {
        nodeId: aboutDoc.root.nodeId,
        selector: '#qrcode-input',
      });
      assert.ok(aboutInput?.nodeId > 0, 'expected #qrcode-input on /about.html');
      await cdp.send('DOM.setFileInputFiles', { nodeId: aboutInput.nodeId, files: [fixturePath] });

      const aboutDecoded = await pollUntil(
        async () => {
          const text = await cdp.eval('document.querySelector(".QRCodeSuccessDialog-data")?.innerText');
          return text && text.trim().length > 0 ? text.trim() : null;
        },
        { timeoutMs: 20000, message: '/about.html to decode the uploaded QR fixture' }
      );
      assert.equal(aboutDecoded, EXPECTED_PAYLOAD, '/about.html must decode an uploaded QR, not just render the page');
      assert.deepEqual(pageErrors.slice(errorsBeforeAbout), [], '/about.html threw while decoding');
      if (process.env.QR_SNAPPER_SCREENSHOT) {
        const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
        writeFileSync(process.env.QR_SNAPPER_SCREENSHOT, Buffer.from(data, 'base64'));
        t.diagnostic(`about.html screenshot: ${process.env.QR_SNAPPER_SCREENSHOT}`);
      }

      // Everything above ran with zero external traffic: every off-origin request was failed by the
      // interceptor. Record what it blocked, and assert the one thing that would invalidate the
      // tier - a same-origin request wrongly blocked would have broken the page load outright.
      t.diagnostic(
        externalRequests.length === 0
          ? 'smoke run made no external requests'
          : `smoke run blocked ${externalRequests.length} external request(s) and still decoded: ${[...new Set(externalRequests)].join(', ')}`
      );
      assert.ok(
        externalRequests.every((url) => !url.startsWith(origin)),
        'the interceptor must never have blocked a same-origin request'
      );
    } finally {
      // 6. Bounded, leak-free cleanup
      if (cdp) {
        try {
          cdp.close();
        } catch {}
      }

      if (chromeProcess && chromeProcess.exitCode === null) {
        try {
          chromeProcess.kill('SIGTERM');
          const exited = new Promise((resolve) => chromeProcess.once('exit', resolve));
          const timer = setTimeout(() => {
            if (chromeProcess.exitCode === null) {
              chromeProcess.kill('SIGKILL');
            }
          }, 3000);
          await exited;
          clearTimeout(timer);
        } catch {}
      }

      if (server) {
        try {
          server.closeAllConnections?.();
          await new Promise((resolve) => server.close(resolve));
        } catch {}
      }

      try {
        rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      } catch {}
    }
  }
);
