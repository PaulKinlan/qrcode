import test from 'node:test';
import assert from 'node:assert/strict';
import { QRCodeCallbackController } from '../../app/scripts/components/dialogs/QRCodeCallbackController.js';

function mountCallback(callback, referrer = 'https://example.com/start') {
  const listeners = new Map();
  const classes = new Set(['hidden']);
  const domain = { classList: { add: (name) => classes.add(name) }, innerText: '' };
  const element = {
    querySelector: (selector) => selector.endsWith('-domain') ? domain : {},
    addEventListener: (type, listener) => listeners.set(type, listener),
    classList: { remove: (name) => classes.delete(name) },
  };
  globalThis.window = { location: new URL(`https://scanner.example/?x-callback-url=${encodeURIComponent(callback)}`) };
  globalThis.document = { referrer };
  globalThis.location = null;
  return { element, classes, listeners, domain };
}

function withBrowserGlobals(run) {
  const saved = Object.fromEntries(['window', 'document', 'location'].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  try {
    return run();
  } finally {
    for (const [key, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
}

test('unsafe callback URL never exposes a clickable navigation target', () => withBrowserGlobals(() => {
  for (const payload of ['javascript:globalThis.xss=1', 'data:text/html,<script>alert(1)</script>']) {
    const { element, classes, listeners } = mountCallback(payload);
    const controller = new QRCodeCallbackController(element);
    controller.setQrCode('https://example.com/qr');
    assert.equal(classes.has('hidden'), true, payload);
    assert.equal(listeners.has('click'), false, payload);
  }
}));

test('callback navigation requires a matching HTTPS referrer', () => withBrowserGlobals(() => {
  for (const referrer of ['', 'https://other.example/start', 'http://example.com/start', 'not a URL']) {
    const { element, classes, listeners } = mountCallback('https://example.com/return', referrer);
    new QRCodeCallbackController(element).setQrCode('https://example.com/qr');
    assert.equal(classes.has('hidden'), true, referrer);
    assert.equal(listeners.has('click'), false, referrer);
    assert.equal(globalThis.location, null, referrer);
  }
}));

test('callback navigation revalidates the URL at click time', () => withBrowserGlobals(() => {
  const { element, classes, listeners } = mountCallback('https://example.com/return');
  const controller = new QRCodeCallbackController(element);
  controller.setQrCode('https://example.com/qr');
  assert.equal(classes.has('hidden'), false);
  assert.equal(listeners.has('click'), true);

  controller.callbackUrl = new URL('javascript:globalThis.xss=1');
  listeners.get('click')();
  assert.equal(globalThis.location, null);

  controller.callbackUrl = new URL('https://other.example/collect');
  listeners.get('click')();
  assert.equal(globalThis.location, null);

  controller.callbackUrl = new URL('https://example.com/return');
  document.referrer = 'https://other.example/start';
  listeners.get('click')();
  assert.equal(globalThis.location, null);

  document.referrer = 'https://example.com/start';
  listeners.get('click')();
  assert.equal(globalThis.location.href, 'https://example.com/return?qrcode=https%3A%2F%2Fexample.com%2Fqr');
}));
