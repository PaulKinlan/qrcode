// Share and Copy are sinks for the decoded payload (bead qrcode-4ow): both handed
// this.currentUrl to the OS / clipboard with no protocol check while Open refused the same
// value, so an attacker-controlled `javascript:`/`data:`/`file:` payload could leave the app
// through the two sinks that were not gated. These tests mount the real QRCodeManager against a
// fake DOM and pin the gate on both.
//
// QRCodeManager imports qrclient.js, which constructs a real Worker at module load, so the
// Worker is stubbed before the dynamic import - the manager never decodes here, it only drives
// the button listeners.
import test from 'node:test';
import assert from 'node:assert/strict';

globalThis.Worker = class {
  addEventListener() {}
  removeEventListener() {}
  postMessage() {}
  terminate() {}
};

const { QRCodeManager } = await import('../../app/scripts/components/dialogs/QRCodeManager.js');

const SAFE = 'https://example.com/qr';
const UNSAFE = ['javascript:globalThis.xss=1', 'data:text/html,<script>alert(1)</script>', 'file:///etc/passwd'];

function mountManager({ share = true, clipboard = true } = {}) {
  const listeners = new Map();
  const classes = new Set(['hidden']);
  const button = (name) => ({
    name,
    innerText: '',
    // QRCodeCallbackController queries its own name/domain children inside the callback button.
    querySelector: (selector) => selector.endsWith('-domain') ? { innerText: '' } : { innerText: '' },
    classList: {
      add: (value) => classes.add(`${name}:${value}`),
      remove: (value) => classes.delete(`${name}:${value}`),
      contains: (value) => classes.has(`${name}:${value}`),
    },
    addEventListener: (type, listener) => listeners.set(name, listener),
  });

  const nodes = new Map([
    ['.QRCodeSuccessDialog-data', { innerText: '' }],
    ['.QRCodeSuccessDialog-navigate', button('navigate')],
    ['.QRCodeSuccessDialog-ignore', button('ignore')],
    ['.QRCodeSuccessDialog-share', button('share')],
    ['.QRCodeSuccessDialog-copy', button('copy')],
    ['.QRCodeSuccessDialog-callback', button('callback')],
  ]);

  const root = {
    style: {},
    querySelector: (selector) => nodes.get(selector) ?? null,
  };

  const shared = [];
  const copied = [];
  // Node exposes navigator as a getter-only global, so every stub is installed with
  // defineProperty (configurable) and restored from the saved descriptor afterwards.
  const saved = Object.fromEntries(
    ['window', 'navigator', 'document'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)])
  );
  const install = (key, value) => Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });

  install('document', { getElementById: () => root });
  install('window', { location: new URL('https://scanner.example/') });
  install('navigator', {
    ...(share ? { share: (data) => shared.push(data) } : {}),
    ...(clipboard ? { clipboard: { writeText: (text) => copied.push(text) } } : {}),
  });

  const manager = new QRCodeManager('qrcode');

  const restore = () => {
    for (const [key, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  };

  return { manager, listeners, root, shared, copied, restore, classes };
}

const withManager = async (options, run) => {
  const harness = mountManager(options);
  try {
    await run(harness);
  } finally {
    harness.restore();
  }
};

test('an unsafe decoded payload never reaches navigator.share', async () => {
  for (const payload of UNSAFE) {
    await withManager({}, ({ manager, listeners, shared, root }) => {
      manager.currentUrl = new URL(payload);
      root.style.display = 'block';
      listeners.get('share')();
      assert.deepEqual(shared, [], `${payload} must not be shared`);
      assert.equal(root.style.display, 'none', 'the dialog closes like the blocked Open path');
    });
  }
});

test('an unsafe decoded payload never reaches the clipboard', async () => {
  for (const payload of UNSAFE) {
    await withManager({}, ({ manager, listeners, copied, root }) => {
      manager.currentUrl = new URL(payload);
      root.style.display = 'block';
      listeners.get('copy')();
      assert.deepEqual(copied, [], `${payload} must not be copied`);
      assert.equal(root.style.display, 'none', 'the dialog closes like the blocked Open path');
    });
  }
});

test('a safe decoded payload is still shared and copied unchanged', async () => {
  await withManager({}, async ({ manager, listeners, shared, copied }) => {
    manager.currentUrl = new URL(SAFE);
    listeners.get('share')();
    // currentUrl is a URL; the platform coerces it, so compare its string form.
    assert.deepEqual(shared.map((data) => [String(data.title), String(data.text), String(data.url)]), [[SAFE, SAFE, SAFE]]);
  });

  await withManager({}, async ({ manager, listeners, copied }) => {
    manager.currentUrl = new URL(SAFE);
    listeners.get('copy')();
    assert.deepEqual(copied.map(String), [SAFE]);
  });
});

test('the allow-listed non-web schemes still share and copy', async () => {
  for (const payload of ['mailto:hello@example.com', 'tel:+15551234']) {
    await withManager({}, ({ manager, listeners, shared, copied }) => {
      manager.currentUrl = new URL(payload);
      listeners.get('share')();
      listeners.get('copy')();
      assert.equal(shared.length, 1, `${payload} is a user-transferable value`);
      assert.deepEqual(copied.map(String), [payload]);
    });
  }
});

test('an unset currentUrl is refused rather than handed to a sink', async () => {
  await withManager({}, ({ manager, listeners, shared, copied }) => {
    manager.currentUrl = undefined;
    listeners.get('share')();
    listeners.get('copy')();
    assert.deepEqual(shared, []);
    assert.deepEqual(copied, []);
  });
});
