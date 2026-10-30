#!/usr/bin/env node
// Preview smoke: serve dist/ with `vite preview` and assert BODY and CONTENT-TYPE - never a
// bare status code.
//
// Why this exists (bead qrcode-an4): `vite preview` answers 200 + index.html for ANY path
// (SPA fallback), so "GET /app/sw.js -> 200" and "GET /?kill-sw=true -> 200" prove nothing -
// a missing path is indistinguishable from a served one by status alone. Every assertion here
// is on the response body or content-type, and the fallback behaviour itself is pinned so a
// future reader cannot mistake a 200 for evidence.
//
// Cleanup (beads qrcode-1dl, qrcode-8xk): the server is spawned as the leader of its OWN
// process group, and every exit path from this script - graceful end, startup failure, thrown
// assertion, SIGTERM/SIGINT/SIGHUP (the fleet's mandated `timeout -k` wrapper is exactly a
// SIGTERM) - kills that whole group. Cleanup is then VERIFIED by scanning /proc for the unique
// port, never claimed. A hard deadline timer keeps the event loop alive so a bug in this script
// can never again look like a silent exit 0 (bead qrcode-deq).
//
// Usage: npm run build && npm run smoke:preview
// Not part of any gate tier (it needs a built dist/ and spawns a server); it is the standard
// hand-off smoke for changes touching the build output or the preview/dev server.
import { spawn, execFile } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const viteBin = join(root, 'node_modules', 'vite', 'bin', 'vite.js');

const log = (...args) => console.log('[preview-smoke]', ...args);
const fail = (msg) => { throw new Error(msg); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Hard deadline: a non-unref'd timer, so even if every other await in this script were to hang
// the process still exits 1 with a message instead of drifting to a silent exit 0 (qrcode-deq).
const HARD_DEADLINE_MS = 120000;
const deadline = setTimeout(() => {
  console.error('[preview-smoke] FAIL: hard deadline exceeded - internal bug, not a pass');
  process.exit(1);
}, HARD_DEADLINE_MS);

// An unused port, so parallel lanes' smokes can never collide (tests must be independent).
// TOCTOU note: another process could grab the port between probe and bind; --strictPort then
// makes vite exit non-zero, which the startup wait below reports as a FAIL with the server
// output - never a false green.
const freePort = () => new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
});

const get = (port, path) => fetch(`http://127.0.0.1:${port}${path}`, { redirect: 'manual' })
  .then(async (res) => ({
    status: res.status,
    type: res.headers.get('content-type') || '',
    body: await res.text(),
  }));

// A pid counts as a stray server only if its OWN argv is node running vite.js: bash wrappers,
// pgrep itself and this script all contain the port string in their command lines but must not
// be counted (or filtered away by a loose substring rule - qrcode-an4 review).
const isViteServer = (pid) => {
  try {
    const argv = readFileSync(`/proc/${pid}/cmdline`, 'utf8').split('\0').filter(Boolean);
    return argv.length >= 2 && /(^|\/)node$/.test(argv[0]) && argv.some((a) => a.endsWith('vite.js'));
  } catch {
    return false; // process is already gone
  }
};

// resolve: array of stray pids (possibly empty). reject: the scan itself could not run - an
// unverifiable scan must FAIL the smoke, never read as "clean" (qrcode-an4 review).
const straysForPort = (port) => new Promise((resolve, reject) => {
  execFile('pgrep', ['-f', `vite.js preview --port ${port}`], (err, stdout) => {
    // pgrep exit 1 means "no matches" - that is a clean scan, not an error.
    if (err && err.code !== 1) {
      reject(new Error(`stray scan could not run (pgrep: ${err.code ?? err.message})`));
      return;
    }
    const pids = (stdout || '').split('\n').filter(Boolean).map(Number)
      .filter((pid) => Number.isInteger(pid) && pid > 0 && pid !== process.pid)
      .filter(isViteServer);
    resolve(pids);
  });
});

let child = null;
let childExit = null; // promise, attached AT SPAWN so it can never miss the exit event (qrcode-deq)
let childExitResult = null;
let activePort = null; // set once the port is chosen, so signal handlers can scan for strays

const killGroup = (signal) => {
  if (!child || childExitResult) return;
  try { process.kill(-child.pid, signal); } catch { /* group already gone */ }
};

// The fleet runs everything under `timeout -k 30 N`, which SIGTERMs this script. Default signal
// behaviour would kill node WITHOUT running finally blocks and orphan the server (qrcode-8xk),
// so every terminating signal kills the child's process group first and exits non-zero.
for (const [sig, code] of [['SIGTERM', 143], ['SIGINT', 130], ['SIGHUP', 129]]) {
  process.on(sig, () => {
    killGroup('SIGKILL');
    // Best effort under interruption (the caller's `timeout -k` may SIGKILL us mid-scan):
    // verify the group kill landed, report, and exit non-zero - an interrupted smoke is a
    // FAILED smoke, never a silent one.
    (async () => {
      await sleep(200);
      let note = 'stray scan did not complete before exit';
      try {
        const strays = activePort === null ? [] : await straysForPort(activePort);
        note = strays.length === 0 ? 'cleanup verified: no server process survives' : `STRAYS SURVIVE: pids ${strays.join(', ')}`;
      } catch (err) {
        note = `stray scan failed: ${err.message}`;
      }
      console.error(`[preview-smoke] FAIL: interrupted by ${sig}; killed server process group - ${note}`);
      process.exit(code);
    })();
  });
}

async function waitForServer(port, timeoutMs = 30000) {
  const deadlineMs = Date.now() + timeoutMs;
  while (Date.now() < deadlineMs) {
    if (childExitResult) {
      fail(`preview server exited during startup (code ${childExitResult.code}, signal ${childExitResult.signal}). Server output:\n${serverOutput || '(empty)'}`);
    }
    try {
      const res = await get(port, '/');
      if (res.status === 200) return;
    } catch { /* not up yet */ }
    await sleep(300);
  }
  fail(`preview server did not answer on :${port} within ${timeoutMs}ms. Server output:\n${serverOutput || '(empty)'}`);
}

let serverOutput = '';

async function smoke() {
  if (!existsSync(join(dist, 'index.html'))) {
    fail('dist/index.html missing: run `npm run build` first');
  }
  if (!existsSync(viteBin)) {
    fail('node_modules/vite missing: run `fleet-deps` (or npm install) first');
  }

  const port = await freePort();
  activePort = port;
  child = spawn(process.execPath, [viteBin, 'preview', '--port', String(port), '--strictPort'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true, // own process group: every kill path can take the whole tree with -pid
  });
  child.stdout.on('data', (d) => { serverOutput += d; });
  child.stderr.on('data', (d) => { serverOutput += d; });
  // Attached synchronously at spawn: unlike a listener added in a finally block, this cannot
  // miss an 'exit' that already fired and leave an await unsettled (qrcode-deq).
  childExit = new Promise((resolve) => {
    child.once('exit', (code, signal) => {
      childExitResult = { code, signal };
      resolve(childExitResult);
    });
  });

  try {
    await waitForServer(port);
    log(`vite preview up on :${port} (server pid ${child.pid}, group -${child.pid})`);

    // 1. The app entry: HTML, and the real app shell (title from index.html).
    const indexPage = await get(port, '/');
    if (indexPage.status !== 200 || !indexPage.type.includes('text/html')) {
      fail(`GET / expected 200 text/html, got ${indexPage.status} ${indexPage.type}`);
    }
    const title = indexPage.body.match(/<title>([^<]*)<\/title>/)?.[1];
    if (!title) fail('GET / body has no <title>: not the app shell');
    log(`GET / -> 200 text/html <title>${title}</title>`);

    // 2. The DEPLOYED service worker (sw-register.js registers '/sw.js'): must be JavaScript
    //    and must contain the kill-route branch - a body assertion, not a status assertion.
    const sw = await get(port, '/sw.js');
    if (sw.status !== 200 || !sw.type.includes('javascript')) {
      fail(`GET /sw.js expected 200 text/javascript, got ${sw.status} ${sw.type}`);
    }
    if (!sw.body.includes('kill-sw')) {
      fail('GET /sw.js body has no kill-sw branch: served file is not the built worker');
    }
    log(`GET /sw.js -> 200 ${sw.type} (${sw.body.length} bytes, kill-route branch present)`);

    // 3. Pin the trap itself: a path that does NOT exist answers 200 with the index body.
    //    This is the false green qrcode-an4 flagged; asserting it here means nobody can read
    //    a 200 from this server as proof a resource exists.
    const missing = await get(port, '/definitely-not-a-real-path-xyz');
    if (missing.status !== 200 || missing.body !== indexPage.body) {
      log(`note: missing path answered ${missing.status} (not the SPA fallback body) - vite preview behaviour changed; re-check assertions`);
    } else {
      log('GET /definitely-not-a-real-path-xyz -> 200 with the index body (SPA fallback confirmed: status alone proves nothing)');
    }

    // 4. The kill route is a service-worker navigation route, not a server route: over plain
    //    HTTP it must serve the app shell (the SW intercepts it only in a browser). Assert the
    //    BODY is the app shell - the old status-only check could not fail.
    const kill = await get(port, '/?kill-sw=true');
    if (kill.status !== 200 || kill.body !== indexPage.body) {
      fail(`GET /?kill-sw=true expected the app shell body, got ${kill.status}`);
    }
    log('GET /?kill-sw=true -> 200 app shell (SW behaviour is covered by test/unit/sw-kill-switch.test.mjs)');

    log('PASS: all body/content-type assertions hold');
  } finally {
    // Graceful path: TERM the group, escalate to KILL. Uses the spawn-time childExit promise,
    // so a child that is ALREADY dead settles immediately instead of hanging (qrcode-deq).
    killGroup('SIGTERM');
    const exited = await Promise.race([childExit, sleep(5000).then(() => null)]);
    if (exited === null) {
      killGroup('SIGKILL');
      await Promise.race([childExit, sleep(5000).then(() => null)]);
    }
    // Do not claim cleanup: verify it. A survivor OR an unverifiable scan is a hard failure.
    await sleep(300);
    let strays;
    try {
      strays = await straysForPort(port);
    } catch (scanErr) {
      console.error(`[preview-smoke] FAIL: ${scanErr.message} - cleanup cannot be verified`);
      process.exitCode = 1;
      return;
    }
    if (strays.length > 0) {
      console.error(`[preview-smoke] FAIL: stray servers survive for port ${port}: pids ${strays.join(', ')}`);
      process.exitCode = 1;
    } else {
      log(`cleanup verified: /proc scan finds no 'node vite.js preview --port ${port}' process`);
    }
  }
}

smoke()
  .catch((err) => {
    console.error('[preview-smoke] FAIL:', err.message);
    process.exitCode = 1;
  })
  .finally(() => clearTimeout(deadline));
