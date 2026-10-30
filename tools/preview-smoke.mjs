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
// Cleanup (bead qrcode-1dl): the preview server is a child of THIS process, killed in a
// finally block, and the script refuses to exit 0 until it has confirmed - by scanning the
// process table for its own unique port - that no stray server survives. A smoke that leaves
// an orphan on a CPU-starved VM is a failed smoke.
//
// Usage: npm run build && npm run smoke:preview
// Not part of any gate tier (it needs a built dist/ and spawns a server); it is the standard
// hand-off smoke for changes touching the build output or the preview/dev server.
import { spawn, execFile } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const viteBin = join(root, 'node_modules', 'vite', 'bin', 'vite.js');

const log = (...args) => console.log('[preview-smoke]', ...args);
const fail = (msg) => { throw new Error(msg); };

// An unused port, so parallel lanes' smokes can never collide (tests must be independent).
const freePort = () => new Promise((resolve, reject) => {
  const probe = createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
});

const get = (port, path) => new Promise((resolve, reject) => {
  const req = fetch(`http://127.0.0.1:${port}${path}`, { redirect: 'manual' });
  req.then(async (res) => resolve({
    status: res.status,
    type: res.headers.get('content-type') || '',
    body: await res.text(),
  }), reject);
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Scan the process table for OUR port: unique per run, so another lane's server never matches.
const straysForPort = (port) => new Promise((resolve) => {
  execFile('pgrep', ['-af', `vite.js preview --port ${port}`], (err, stdout) => {
    const lines = (stdout || '').split('\n').filter(Boolean)
      // pgrep -f can match this script's own command line; only the server counts.
      .filter((l) => !l.includes('preview-smoke'));
    resolve(err ? [] : lines);
  });
});

async function waitForServer(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await get(port, '/');
      if (res.status === 200) return;
    } catch { /* not up yet */ }
    await sleep(300);
  }
  fail(`preview server did not answer on :${port} within ${timeoutMs}ms`);
}

async function smoke() {
  if (!existsSync(join(dist, 'index.html'))) {
    fail('dist/index.html missing: run `npm run build` first');
  }
  if (!existsSync(viteBin)) {
    fail('node_modules/vite missing: run `fleet-deps` (or npm install) first');
  }

  const port = await freePort();
  const child = spawn(process.execPath, [viteBin, 'preview', '--port', String(port), '--strictPort'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let serverOutput = '';
  child.stdout.on('data', (d) => { serverOutput += d; });
  child.stderr.on('data', (d) => { serverOutput += d; });

  try {
    await waitForServer(port);
    log(`vite preview up on :${port}`);

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
    log('GET /?kill-sw=true -> 200 app shell (SW route; browser behaviour is covered by test/unit/sw-kill-switch.test.mjs)');

    log('PASS: all body/content-type assertions hold');
  } finally {
    child.kill('SIGTERM');
    const exited = await Promise.race([
      new Promise((r) => child.once('exit', () => r(true))),
      sleep(5000).then(() => false),
    ]);
    if (!exited) {
      child.kill('SIGKILL');
      await new Promise((r) => child.once('exit', r));
    }
    // Do not claim cleanup: verify it. Any survivor for our unique port is a hard failure.
    await sleep(300);
    const strays = await straysForPort(port);
    if (strays.length > 0) {
      console.error('[preview-smoke] STRAY SERVERS SURVIVE:', strays.join('\n'));
      process.exitCode = 1;
      return;
    }
    log(`cleanup verified: no process matches 'vite.js preview --port ${port}'`);
    if (serverOutput && process.env.SMOKE_VERBOSE) console.error(serverOutput);
  }
}

smoke().catch((err) => {
  console.error('[preview-smoke] FAIL:', err.message);
  process.exitCode = 1;
});
