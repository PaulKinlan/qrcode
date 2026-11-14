import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const cli = new URL('../../tools/deployed-header-smoke.mjs', import.meta.url);
const framing = { 'content-security-policy': "frame-ancestors 'none'", 'x-frame-options': 'DENY' };
const serviceCsp = "default-src 'none'; script-src 'self'; connect-src 'self'";
const decoderCsp = "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'";

async function run(headers = {}) {
  const server = createServer((req, res) => {
    const path = req.url;
    const [type, body, policy] = path === '/sw.js'
      ? ['text/javascript', '/* kill-sw */', serviceCsp]
      : path === '/scripts/qrworker.js'
        ? ['text/javascript', '/* zbar */', decoderCsp]
        : ['text/html', '<title>QR Snapper</title>', null];
    res.writeHead(200, {
      'content-type': type,
      ...(policy ? { 'content-security-policy': policy } : framing),
      ...headers[path],
    });
    res.end(body);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const child = spawn(process.execPath, [cli.pathname], {
      env: { ...process.env, DEPLOYED_ORIGIN: `http://127.0.0.1:${server.address().port}` },
    });
    let output = '';
    for (const stream of [child.stdout, child.stderr]) stream.on('data', (data) => { output += data; });
    const [code] = await once(child, 'exit');
    return { code, output };
  } finally {
    server.close();
  }
}

test('deployed smoke verifies real HTTP responses on document and both worker paths', async () => {
  const { code, output } = await run();
  assert.equal(code, 0, output);
  assert.match(output, /PASS/);
});

test('deployed smoke accepts case-insensitive CSP directive names and XFO token', async () => {
  const { code, output } = await run({
    '/': { 'content-security-policy': "Frame-Ancestors 'none'", 'x-frame-options': 'deny' },
    '/sw.js': { 'content-security-policy': "Default-Src 'none'; Script-Src 'self'; Connect-Src 'self'" },
    '/scripts/qrworker.js': { 'content-security-policy': "DEFAULT-SRC 'none'; SCRIPT-SRC 'self' 'wasm-unsafe-eval'; CONNECT-SRC 'self'" },
  });
  assert.equal(code, 0, output);
  assert.match(output, /PASS/);
});

test('deployed smoke still rejects a different frame-ancestors value', async () => {
  const { code, output } = await run({ '/': { 'content-security-policy': "Frame-Ancestors 'self'" } });
  assert.equal(code, 1);
  assert.match(output, /needs frame-ancestors 'none'/);
});

test('deployed smoke fails when host omits document framing protection', async () => {
  const { code, output } = await run({ '/': { 'x-frame-options': 'SAMEORIGIN' } });
  assert.equal(code, 1);
  assert.match(output, /X-Frame-Options expected DENY/);
});

test('deployed smoke fails when decoder worker loses its scoped CSP', async () => {
  const { code, output } = await run({ '/scripts/qrworker.js': { 'content-security-policy': serviceCsp } });
  assert.equal(code, 1);
  assert.match(output, /wasm-unsafe-eval/);
});

test('deployed smoke fails when service-worker response lacks its scoped CSP', async () => {
  const { code, output } = await run({ '/sw.js': { 'content-security-policy': "frame-ancestors 'none'" } });
  assert.equal(code, 1);
  assert.match(output, /GET \/sw\.js Content-Security-Policy missing default-src/);
});

test('deployed smoke rejects an HTML SPA fallback on the worker path', async () => {
  const { code, output } = await run({ '/sw.js': { 'content-type': 'text/html' } });
  assert.equal(code, 1);
  assert.match(output, /GET \/sw\.js expected 200 javascript/);
});

test('deployed smoke rejects a missing target instead of silently checking Vite', async () => {
  const child = spawn(process.execPath, [cli.pathname], { env: { ...process.env, DEPLOYED_ORIGIN: '' } });
  let output = '';
  child.stderr.on('data', (data) => { output += data; });
  const [code] = await once(child, 'exit');
  assert.equal(code, 1);
  assert.match(output, /set DEPLOYED_ORIGIN/);
});
