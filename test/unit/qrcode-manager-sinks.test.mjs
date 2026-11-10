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
import { isTransportSafeUrl } from '../../app/scripts/utils/url-utils.js';

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
    ['.QRCodeSuccessDialog-status', { textContent: '' }],
    ['.QRCodeSuccessDialog-navigate', button('navigate')],
    ['.QRCodeSuccessDialog-ignore', button('ignore')],
    ['.QRCodeSuccessDialog-share', button('share')],
    ['.QRCodeSuccessDialog-copy', button('copy')],
    ['.QRCodeSuccessDialog-callback', button('callback')],
    ['.wsk-card--heading-text', { textContent: '' }],
  ]);

  // The result panel is a native <dialog> (bead qrcode-zzq), so the harness has to model one:
  // open/showModal()/close() plus the root 'close' listener the manager registers for Escape and
  // light dismiss. Without them the constructor throws and the sinks are never even wired.
  const root = {
    open: false,
    addEventListener: () => {},
    showModal() { this.open = true; },
    close() { this.open = false; },
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

  return { manager, listeners, root, shared, copied, restore, classes, status: nodes.get('.QRCodeSuccessDialog-status') };
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
      root.open = true;
      listeners.get('share')();
      assert.deepEqual(shared, [], `${payload} must not be shared`);
      assert.equal(root.open, false, 'the dialog closes like the blocked Open path');
    });
  }
});

test('an unsafe decoded payload never reaches the clipboard', async () => {
  for (const payload of UNSAFE) {
    await withManager({}, ({ manager, listeners, copied, root }) => {
      manager.currentUrl = new URL(payload);
      root.open = true;
      listeners.get('copy')();
      assert.deepEqual(copied, [], `${payload} must not be copied`);
      assert.equal(root.open, false, 'the dialog closes like the blocked Open path');
    });
  }
});

test('off-device plain HTTP never reaches Open, Share or Copy and visibly explains why', async () => {
  for (const href of ['http://example.com/qr', 'http://localhost.attacker.example/qr', 'http://127.0.0.1.attacker.example/qr']) {
    for (const [action, buttonName] of [['shared', 'share'], ['copied', 'copy'], ['opened', 'navigate']]) {
      await withManager({}, async ({ manager, listeners, root, shared, copied, status }) => {
        const url = new URL(href);
        manager.currentUrl = url;
        manager.showDialog(url);
        const originalLocation = window.location;
        window.confirm = () => { throw new Error('plain HTTP must be refused without a consent override'); };
        await listeners.get(buttonName)();
        assert.deepEqual(shared, [], href);
        assert.deepEqual(copied, [], href);
        assert.equal(window.location, originalLocation, href);
        assert.equal(root.open, true, 'staying open prevents camera re-detection flicker');
        assert.match(status.textContent, new RegExp(`Plain HTTP link not ${action}\\.`));
        assert.match(status.textContent, /Use HTTPS or a link on this device/);
        manager.closeDialog();
        assert.equal(status.textContent, '', 'status must clear when the result closes');
      });
    }
  }
});

test('loopback plain HTTP still reaches Open, Share and Copy unchanged', async () => {
  for (const href of ['http://localhost:8080/qr', 'http://127.0.0.2/qr', 'http://[::1]:8080/qr']) {
    await withManager({}, async ({ manager, listeners, root, shared, copied, status }) => {
      const url = new URL(href);
      manager.currentUrl = url;
      manager.showDialog(url);
      window.confirm = () => { throw new Error('loopback web links do not need external-app consent'); };
      await listeners.get('share')();
      assert.deepEqual(shared.map((data) => String(data.url)), [href]);
      manager.showDialog(url);
      await listeners.get('copy')();
      assert.deepEqual(copied.map(String), [href]);
      manager.showDialog(url);
      listeners.get('navigate')();
      assert.equal(String(window.location), href);
      assert.equal(root.open, false);
      assert.equal(status.textContent, '');
    });
  }
});

test('callback and result sinks agree on HTTPS-or-loopback web targets', async () => {
  await withManager({}, ({ manager }) => {
    for (const href of ['https://example.com/', 'http://example.com/', 'http://localhost:8080/', 'http://127.0.0.2/', 'http://[::1]/', 'http://localhost.attacker.example/']) {
      const url = new URL(href);
      assert.equal(isTransportSafeUrl(url), manager.callbackController.isWebCallback(url), href);
    }
  });
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
