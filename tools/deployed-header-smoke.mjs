#!/usr/bin/env node
// Opt-in check of the actual deployed host. Vite preview cannot prove that a hosting provider
// applied app/_headers: preview sends document headers itself and cannot path-scope worker CSP.
const originSetting = process.env.DEPLOYED_ORIGIN;
if (!originSetting) {
  console.error('[deployed-header-smoke] FAIL: set DEPLOYED_ORIGIN to the deployed site origin');
  process.exitCode = 1;
} else {
  try {
    const origin = new URL(originSetting);
    if (!['https:', 'http:'].includes(origin.protocol) || origin.username || origin.password ||
        origin.pathname !== '/' || origin.search || origin.hash ||
        (origin.protocol === 'http:' && !['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname))) {
      throw new Error('DEPLOYED_ORIGIN must be an HTTPS origin (HTTP allowed only for loopback tests) without path, query or credentials');
    }

    async function request(path, type) {
      const response = await fetch(new URL(path, origin), {
        redirect: 'manual',
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      });
      if (response.status !== 200 || !response.headers.get('content-type')?.includes(type)) {
        throw new Error(`GET ${path} expected 200 ${type}, got ${response.status} ${response.headers.get('content-type')}`);
      }
      return response;
    }

    // CSP directive names are case-insensitive; keep values intact when comparing policies.
    function directives(csp) {
      return csp?.split(';').map((part) => part.trim().replace(/^[^\s]+/, (name) => name.toLowerCase())) ?? [];
    }

    const document = await request('/', 'text/html');
    const documentCsp = document.headers.get('content-security-policy');
    if (!directives(documentCsp).includes("frame-ancestors 'none'")) {
      throw new Error(`GET / Content-Security-Policy needs frame-ancestors 'none' (got ${documentCsp})`);
    }
    if (document.headers.get('x-frame-options')?.trim().toUpperCase() !== 'DENY') {
      throw new Error(`GET / X-Frame-Options expected DENY (got ${document.headers.get('x-frame-options')})`);
    }
    if (!/<title>[^<]+<\/title>/i.test(await document.text())) {
      throw new Error('GET / is not the app document (missing title)');
    }

    for (const [path, scriptDirective] of [
      ['/sw.js', "script-src 'self'"],
      ['/scripts/qrworker.js', "script-src 'self' 'wasm-unsafe-eval'"],
    ]) {
      const worker = await request(path, 'javascript');
      const body = await worker.text();
      if (path === '/sw.js' ? !body.includes('kill-sw') : !body.includes('zbar')) {
        throw new Error(`GET ${path} is not the built worker (possible SPA fallback)`);
      }
      const csp = worker.headers.get('content-security-policy');
      const workerDirectives = directives(csp);
      for (const required of ["default-src 'none'", scriptDirective, "connect-src 'self'"]) {
        if (!workerDirectives.includes(required)) {
          throw new Error(`GET ${path} Content-Security-Policy missing ${required} (got ${csp})`);
        }
      }
    }
    console.log(`[deployed-header-smoke] PASS: ${origin.origin} serves framing and path-scoped worker CSP headers`);
  } catch (error) {
    console.error('[deployed-header-smoke] FAIL:', error.message);
    process.exitCode = 1;
  }
}
