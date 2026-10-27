import test from 'node:test';
import assert from 'node:assert/strict';
import { QRCodeCallbackController } from '../../app/scripts/components/dialogs/QRCodeCallbackController.js';

function mountCallback(callback, referrer = '') {
  const listeners = new Map();
  const classes = new Set(['hidden']);
  const domain = { innerText: '' };
  const element = {
    querySelector: (selector) => selector.endsWith('-domain') ? domain : {},
    addEventListener: (type, listener) => listeners.set(type, listener),
    classList: { remove: (name) => classes.delete(name) },
  };
  globalThis.window = {
    location: new URL(`https://scanner.example/?x-callback-url=${encodeURIComponent(callback)}`),
    confirm: () => false,
  };
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

test('script, data and non-web callback URLs cannot receive a scanned payload', () => withBrowserGlobals(() => {
  for (const payload of ['javascript:globalThis.xss=1', 'data:text/html,<script>alert(1)</script>', 'mailto:attacker@example.com', 'tel:+12345']) {
    const { element, classes, listeners } = mountCallback(payload);
    new QRCodeCallbackController(element).setQrCode('https://example.com/qr');
    assert.equal(classes.has('hidden'), true, payload);
    assert.equal(listeners.has('click'), false, payload);
  }
}));

test('even a matching referrer cannot bypass explicit consent; refusal sends nothing', () => withBrowserGlobals(() => {
  const { element, classes, listeners, domain } = mountCallback('https://attacker.example/collect', 'https://attacker.example/lure');
  const controller = new QRCodeCallbackController(element);
  controller.setQrCode('SECRET-token-123');
  assert.equal(classes.has('hidden'), false);
  assert.equal(domain.innerText, 'https://attacker.example');
  let prompt;
  window.confirm = (text) => { prompt = text; return false; };
  listeners.get('click')();
  assert.match(prompt, /https:\/\/attacker\.example/);
  assert.match(prompt, /SECRET-token-123/);
  assert.equal(globalThis.location, null);
}));

test('a missing referrer can return a scanned value only after affirmative consent', () => withBrowserGlobals(() => {
  const { element, classes, listeners } = mountCallback('https://example.com/return');
  const controller = new QRCodeCallbackController(element);
  controller.setQrCode('https://example.com/qr');
  assert.equal(classes.has('hidden'), false);
  window.confirm = () => true;
  listeners.get('click')();
  assert.equal(globalThis.location.href, 'https://example.com/return?qrcode=https%3A%2F%2Fexample.com%2Fqr');
}));

test('callback navigation revalidates URL at click time and displays the current destination', () => withBrowserGlobals(() => {
  const { element, listeners } = mountCallback('https://example.com/return');
  const controller = new QRCodeCallbackController(element);
  controller.setQrCode('https://example.com/qr');
  window.confirm = () => true;

  controller.callbackUrl = new URL('javascript:globalThis.xss=1');
  listeners.get('click')();
  assert.equal(globalThis.location, null);

  controller.callbackUrl = new URL('https://other.example/collect');
  let prompt;
  window.confirm = (text) => { prompt = text; return false; };
  listeners.get('click')();
  assert.match(prompt, /https:\/\/other\.example/);
  assert.equal(globalThis.location, null);
}));
