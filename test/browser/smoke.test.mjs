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

// Load tolerance for a shared VM (bead qrcode-4tl). These ceilings were sized for an idle box, and
// this tier runs next to several other lanes: on a starved CPU *every* phase stretches, not just
// Chrome's startup. The first red run under load was the 15s DevToolsActivePort poll; with that
// raised, the very next run died on the 15s "App to load and CameraFallback to become visible"
// wait instead. So the fix is one tolerance rather than two numbers: PHASE_TIMEOUT_SCALE multiplies
// every deadline wait (page boot, WASM decode, worker install, offline reload) and Chrome's startup
// poll is simply the largest of them. The default 4 turns the original 15s/20s/10s ceilings into
// 60s/80s/40s; a box slower still can raise QR_SNAPPER_BROWSER_TIMEOUT_SCALE instead of editing
// this file. Because these ceilings are now load-tolerant rather than tight, a hang is caught by
// the runner ceiling below (and, above it, by tools/fleet-check.conf's CHECK_TIMEOUT), not by an
// individual phase.
const requestedScale = Number(process.env.QR_SNAPPER_BROWSER_TIMEOUT_SCALE ?? 4);
const PHASE_TIMEOUT_SCALE = Number.isFinite(requestedScale) && requestedScale > 0 ? requestedScale : 4;

/**
 * Scale a phase deadline for the VM the tier is running on.
 * @param {number} baseMs
 * @returns {number}
 */
function phaseTimeout(baseMs) {
  return Math.round(baseMs * PHASE_TIMEOUT_SCALE);
}

const CHROME_STARTUP_TIMEOUT_MS = phaseTimeout(15_000); // 60s at the default scale
const SMOKE_TEST_TIMEOUT_MS = 300_000;

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
  { timeoutMs = phaseTimeout(15_000), intervalMs = 50, message = 'Condition timed out' } = {}
) {
  const start = Date.now();
  let lastError;
  while (Date.now() - start < timeoutMs) {
    try {
      const result = await fn();
      if (result) {
        // Where a wait's time went is the only way to tell "slow box" from "dead app" after the
        // fact, and the log is the artefact a later flake hunt will read.
        if (process.env.QR_SNAPPER_BROWSER_DEBUG === '1') {
          console.error(`[browser-smoke] ${message}: ${Date.now() - start}ms`);
        }
        return result;
      }
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

  // One-shot CDP operations have no retry: a bare `cdp.send('Page.navigate', ...)` that times out
  // rejects the test immediately, unlike an eval inside pollUntil (which is caught and retried
  // inside a scaled window). So the connect/send/eval defaults go through phaseTimeout too (bead
  // qrcode-jrq): 10s and 15s were sized on the same idle box the polls were, and a starved VM can
  // lose a single round-trip for that long. 60s at the default scale is still far below the runner
  // ceiling, so a genuinely wedged DevTools connection is still caught by the runner, not by this.
  static async connect(wsUrl, timeoutMs = phaseTimeout(10_000)) {
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

  send(method, params = {}, timeoutMs = phaseTimeout(15_000)) {
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

  async eval(expression, { awaitPromise = true, timeoutMs = phaseTimeout(15_000) } = {}) {
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
  { timeout: SMOKE_TEST_TIMEOUT_MS },
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
        { timeoutMs: CHROME_STARTUP_TIMEOUT_MS, message: 'DevToolsActivePort file to be written by Chrome' }
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

      // Hermetic run: a third-party request is a regression, not a dependency. Intercept every
      // request so the tier never relies on external network access (ADR qrcode-vyq); continue
      // same-origin requests and fail anything else immediately. Assert below that none occurred.
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
      // CSP enforcement evidence (bead qrcode-3bc). The page policy no longer carries
      // 'unsafe-inline', and a script the policy refuses does not throw: it simply never runs, so
      // neither an exception nor a 404 would report it. Chromium logs the refusal as a security
      // entry, and the document also gets a securitypolicyviolation event, so count both. Zero
      // violations while the app boots, decodes and registers its worker is the proof that the
      // tightened policy still covers everything the page does.
      await cdp.send('Log.enable');
      const cspViolations = [];
      cdp.on('Log.entryAdded', ({ entry }) => {
        if (entry?.source === 'security' || /content security policy/i.test(entry?.text ?? '')) {
          cspViolations.push(entry.text || 'security entry');
        }
      });
      await cdp.send('Page.addScriptToEvaluateOnNewDocument', {
        source:
          'window.__cspViolations = 0;' +
          'document.addEventListener("securitypolicyviolation", function () { window.__cspViolations++; });',
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
        { timeoutMs: phaseTimeout(15_000), message: 'App to load and CameraFallback to become visible' }
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
        { timeoutMs: phaseTimeout(15_000), message: 'QR polyfill decoding to render result in .QRCodeSuccessDialog-data' }
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

      // 4b. The About control must be real UI, not a decoration (bead qrcode-e4c): a <button>
      // with an accessible name, opened with a real Enter keystroke (not a synthetic .click()),
      // focus landing on the dialog's Close control; Escape closes and hands focus back to the
      // trigger. This is the headless proof of the keyboard path the unit stub cannot give.
      const aboutControl = await cdp.eval(`
        (() => {
          const el = document.querySelector('.about');
          return {
            tag: el ? el.tagName : null,
            label: el ? el.getAttribute('aria-label') : null,
          };
        })()
      `);
      assert.equal(aboutControl.tag, 'BUTTON', 'the About control must be a <button>, not an image');
      assert.equal(aboutControl.label, 'About QR Snapper', 'the About button must expose an accessible name');

      await cdp.eval('document.querySelector(".about").focus()');
      // text:'\r' is required: without it Chromium delivers the keydown (a document-level
      // listener sees it) but does not synthesise the button's activation click, so the dialog
      // never opens. This matches what real key delivery and Puppeteer both send for Enter.
      await cdp.send('Input.dispatchKeyEvent', {
        type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, text: '\r',
      });
      await cdp.send('Input.dispatchKeyEvent', {
        type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13,
      });

      await pollUntil(
        async () => {
          const state = await cdp.eval(`
            (() => {
              const dialog = document.querySelector('#about');
              const active = document.activeElement;
              return {
                visible: window.getComputedStyle(dialog).display !== 'none',
                focusInDialog: dialog.contains(active),
                activeIsClose: Boolean(active?.classList?.contains('QRCodeAboutDialog-close')),
              };
            })()
          `);
          return state.visible && state.focusInDialog && state.activeIsClose ? state : null;
        },
        { timeoutMs: phaseTimeout(10_000), message: 'Enter on the About button to open the dialog with focus on Close' }
      );

      // 4b-1 (bead qrcode-319, finding 1): a real pointer click on the dialog body moves focus
      // off the Close button (inside a native modal dialog Chromium puts it on the dialog
      // element itself - a synthetic .click() would not move focus at all and could never
      // reproduce this) - and Escape must still close the dialog from wherever focus landed.
      const paraRect = await cdp.eval(`
        (() => {
          const r = document.querySelector('.QRCodeAboutDialog-data p').getBoundingClientRect();
          return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
        })()
      `);
      await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: paraRect.x, y: paraRect.y, button: 'left', clickCount: 1 });
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: paraRect.x, y: paraRect.y, button: 'left', clickCount: 1 });
      await pollUntil(
        async () => cdp.eval('document.activeElement === document.querySelector("#about")'),
        { timeoutMs: phaseTimeout(5_000), message: 'the pointer click on dialog copy to move focus to the dialog element' }
      );
      await cdp.send('Input.dispatchKeyEvent', {
        type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27,
      });
      await cdp.send('Input.dispatchKeyEvent', {
        type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27,
      });
      await pollUntil(
        async () => cdp.eval('window.getComputedStyle(document.querySelector("#about")).display === "none"'),
        { timeoutMs: phaseTimeout(10_000), message: 'Escape to close the dialog even with focus blurred to body' }
      );

      // 4b-2 (bead qrcode-319, finding 2): forward Tab must reach the dialog's links, which sit
      // before Close in DOM order. Chromium's canonical modal traversal (verified against a
      // bare-page dialog with only an opener/input and two links: identical sequence) is:
      // Tab from the last focusable steps to BODY for one hop, the next Tab RE-ENTERS the
      // modal scope at its first focusable, and the cycle then stays inside the dialog -
      // outside content is never reachable by forward Tab. Assert that contract, not a
      // single-step wrap no real modal dialog performs.
      await cdp.eval('document.querySelector(".about").focus()');
      await cdp.send('Input.dispatchKeyEvent', {
        type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13, text: '\r',
      });
      await cdp.send('Input.dispatchKeyEvent', {
        type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13,
      });
      await pollUntil(
        async () => cdp.eval('document.activeElement?.classList?.contains("QRCodeAboutDialog-close") === true'),
        { timeoutMs: phaseTimeout(10_000), message: 'the reopened dialog to autofocus its Close button' }
      );
      const dispatchTab = async () => {
        await cdp.send('Input.dispatchKeyEvent', {
          type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9,
        });
        await cdp.send('Input.dispatchKeyEvent', {
          type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9, nativeVirtualKeyCode: 9,
        });
      };
      const focusState = () =>
        cdp.eval(`
          (() => {
            const dialog = document.querySelector('#about');
            const active = document.activeElement;
            return { inside: dialog.contains(active), onBody: active === document.body, tag: active?.tagName };
          })()
        `);
      await dispatchTab();
      const firstHop = await focusState();
      assert.ok(
        firstHop.onBody || firstHop.inside,
        `Tab from Close must hop to body or stay inside the dialog, got ${JSON.stringify(firstHop)}`
      );
      await dispatchTab();
      const secondHop = await focusState();
      assert.ok(
        secondHop.inside && secondHop.tag === 'A',
        `the next Tab must re-enter the dialog on its first link, got ${JSON.stringify(secondHop)}`
      );
      await dispatchTab();
      const thirdHop = await focusState();
      assert.ok(thirdHop.inside, `the Tab cycle must stay inside the dialog, got ${JSON.stringify(thirdHop)}`);

      // Escape (native cancel) closes; focus returns to the trigger.
      await cdp.send('Input.dispatchKeyEvent', {
        type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27,
      });
      await cdp.send('Input.dispatchKeyEvent', {
        type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27,
      });

      await pollUntil(
        async () => {
          const state = await cdp.eval(`
            (() => ({
              visible: window.getComputedStyle(document.querySelector('#about')).display !== 'none',
              focusOnTrigger: Boolean(document.activeElement?.classList?.contains('about')),
            }))()
          `);
          return !state.visible && state.focusOnTrigger ? state : null;
        },
        { timeoutMs: phaseTimeout(10_000), message: 'Escape to close the About dialog and restore focus to the trigger' }
      );

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
        { timeoutMs: phaseTimeout(15_000), message: 'Service worker to register successfully' }
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
        { timeoutMs: phaseTimeout(15_000), message: 'the service worker to precache the build and control the page' }
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
        { timeoutMs: phaseTimeout(20_000), message: 'the app to load from the service worker cache with the network off' }
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
        { timeoutMs: phaseTimeout(20_000), message: 'the offline app to decode the uploaded QR fixture' }
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
        { timeoutMs: phaseTimeout(15_000), message: '/about.html to load and its CameraFallback to become visible' }
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
        { timeoutMs: phaseTimeout(20_000), message: '/about.html to decode the uploaded QR fixture' }
      );
      assert.equal(aboutDecoded, EXPECTED_PAYLOAD, '/about.html must decode an uploaded QR, not just render the page');
      assert.deepEqual(pageErrors.slice(errorsBeforeAbout), [], '/about.html threw while decoding');
      assert.deepEqual(cspViolations, [], 'no page may violate its own Content-Security-Policy');
      assert.equal(await cdp.eval('window.__cspViolations'), 0,
        'the app and about documents must report no securitypolicyviolation events');
      if (process.env.QR_SNAPPER_SCREENSHOT) {
        const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
        writeFileSync(process.env.QR_SNAPPER_SCREENSHOT, Buffer.from(data, 'base64'));
        t.diagnostic(`about.html screenshot: ${process.env.QR_SNAPPER_SCREENSHOT}`);
      }

      // 5d. The kill switch is armed only by the exact same-origin root URL (beads qrcode-1ks,
      // qrcode-6a3). Check the negative case FIRST, while a worker and its precache still exist: a
      // kill-sw parameter on another same-origin path must be an ordinary page load, not a silent
      // unregister + cache wipe.
      const precacheNames = await cdp.eval(
        '(async () => (await caches.keys()).filter(name => name.startsWith("qr-precache-")))()'
      );
      assert.ok(precacheNames.length > 0, 'expected a precache to exist before the kill-switch phase');

      await cdp.send('Page.navigate', { url: `${origin}/about.html?kill-sw=true` });
      await pollUntil(
        async () => cdp.eval('location.pathname === "/about.html" && document.readyState === "complete"'),
        { timeoutMs: phaseTimeout(10_000), message: '/about.html?kill-sw=true to load' }
      );
      await cdp.eval('new Promise(resolve => setTimeout(resolve, 300))');
      assert.equal(
        await cdp.eval('(async () => (await navigator.serviceWorker.getRegistrations()).length)()'),
        1,
        'a kill-sw parameter off the root path must not unregister the worker'
      );
      assert.deepEqual(
        await cdp.eval('(async () => (await caches.keys()).filter(name => name.startsWith("qr-precache-")))()'),
        precacheNames,
        'a kill-sw parameter off the root path must not touch the app precache'
      );

      // A subresource request for the root kill URL must fall through to the ordinary cache-first
      // route, even though its URL is identical to the destructive navigation below.
      assert.equal(await cdp.eval(`(async () => {
        const response = await fetch('/?kill-sw=true', { mode: 'no-cors' });
        return response.ok;
      })()`), true, 'the root kill URL should still be served as a subresource');
      assert.equal(
        await cdp.eval('(async () => (await navigator.serviceWorker.getRegistrations()).length)()'),
        1,
        'a root kill URL fetched as a subresource must not unregister the worker'
      );
      assert.deepEqual(
        await cdp.eval('(async () => (await caches.keys()).filter(name => name.startsWith("qr-precache-")))()'),
        precacheNames,
        'a root kill URL fetched as a subresource must not delete the precache'
      );

      // The root kill URL must unregister the worker and clear the app precache, and the page's
      // registration script must not immediately re-register it during that same load.
      await cdp.send('Page.navigate', { url: `${origin}/?source=offline&kill-sw=true` });
      await pollUntil(
        async () => cdp.eval(`(async () =>
          location.pathname === '/' && location.search === '?source=offline&kill-sw=true' &&
          document.readyState === 'complete' &&
          (await navigator.serviceWorker.getRegistrations()).length === 0 &&
          !(await caches.keys()).some(name => name.startsWith('qr-precache-'))
        )()`),
        { timeoutMs: phaseTimeout(10_000), message: 'the root kill navigation to unregister the worker and clear the app precache' }
      );

      // Interception keeps the run hermetic; any third-party request is a regression. The
      // cross-origin half of the kill-switch scope (bead qrcode-6a3) cannot be driven from this
      // page at all: the shipped CSP (default-src 'self', connect-src 'self', img-src 'self' data:
      // blob:) refuses every cross-origin request, so nothing here can reach the worker's fetch
      // listener from another origin. test/unit/sw-kill-switch.test.mjs pins that case against the
      // real route table instead, and this assertion is the browser-level half: no third-party
      // request is even attempted.
      assert.deepEqual(externalRequests, [], 'the app must not request third-party resources');
      assert.deepEqual(cspViolations, [], 'the kill-switch pages must not violate the CSP either');
      assert.equal(await cdp.eval('window.__cspViolations'), 0,
        'the kill-switch pages must report no securitypolicyviolation events');
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
