// app/scripts/sw-register.js is shipped to the page as a CLASSIC script (bead qrcode-3bc), so it
// has no exports to import - but it is plain ESM-compatible source and executing the import runs
// exactly what the browser runs. It is worth a unit test rather than only the browser smoke:
// the file is the only remaining place the page registers the worker, and `npm run test:fast`
// (the tier implementers and the fast gate run) never launches a browser.
//
// Each case imports the file under its own query string, so every case gets a fresh module
// instance: the registration is a top-level `if`, evaluated once per module.
import test from 'node:test';
import assert from 'node:assert/strict';

function run(href) {
  const registrations = [];
  const define = (name, value) =>
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });

  define('location', { href });
  define('navigator', {
    serviceWorker: {
      register(...args) {
        registrations.push(args);
        return Promise.resolve();
      },
    },
  });

  return import(`../../app/scripts/sw-register.js?href=${encodeURIComponent(href)}`)
    .then(() => registrations);
}

test('the page script registers the module worker at the root scope', async () => {
  const registrations = await run('https://qr-snapper.test/index.html');
  assert.deepEqual(registrations, [['/sw.js', { scope: '/', type: 'module' }]]);
});

test('the page script keeps registration off the root kill-switch navigation', async () => {
  // The kill route must survive page load: the worker unregisters itself, and re-registering here
  // would immediately undo it (bead qrcode-tho). A later, non-leading parameter counts too.
  assert.deepEqual(await run('https://qr-snapper.test/?kill-sw=true'), []);
  assert.deepEqual(await run('https://qr-snapper.test/?source=offline&kill-sw=true'), []);
});

test('a kill-sw parameter off the root path is not the kill switch, so the page still registers', async () => {
  // Only the root URL arms the kill switch (app/sw.js, bead qrcode-1ks). Suppressing registration
  // on any other path would leave that page silently without a worker.
  for (const href of [
    'https://qr-snapper.test/index.html?source=offline&kill-sw=true',
    'https://qr-snapper.test/about.html?kill-sw=true',
  ]) {
    assert.equal((await run(href)).length, 1, `${href} should still register the worker`);
  }
});

test('near-miss kill-switch values still register', async () => {
  // Same matching rule as app/sw.js: only the literal value 'true' arms the kill switch.
  for (const query of ['?kill-sw=false', '?kill-sw=trueish', '?not-kill-sw=true']) {
    const registrations = await run(`https://qr-snapper.test/${query}`);
    assert.equal(registrations.length, 1, `${query} should still register the worker`);
  }
});

test('a browser without service workers is a no-op, not a throw', async () => {
  // Registration must never throw on a browser without service workers: the app still scans.
  Object.defineProperty(globalThis, 'location', {
    value: { href: 'https://qr-snapper.test/index.html' },
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });
  await import('../../app/scripts/sw-register.js?href=no-service-worker');
});
