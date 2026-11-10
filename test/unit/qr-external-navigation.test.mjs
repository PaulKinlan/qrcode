import test from 'node:test';
import assert from 'node:assert/strict';
import {isSafeUrl} from '../../app/scripts/utils/url-utils.js';

// QRCodeManager imports qrclient, whose worker is constructed at module evaluation.
globalThis.Worker = class {
  addEventListener() {}
  removeEventListener() {}
  postMessage() {}
};
const {QRCodeManager} = await import('../../app/scripts/components/dialogs/QRCodeManager.js');
delete globalThis.Worker;

function mount({headingPresent = true} = {}) {
  const buttons = new Map();
  const makeButton = () => ({
    classList: {remove() {}},
    addEventListener(type, fn) { this[type] = fn; },
  });
  for (const name of ['navigate', 'ignore', 'share', 'copy']) buttons.set(name, makeButton());
  const heading = {textContent: ''};
  const data = {innerText: ''};
  const callback = makeButton();
  callback.querySelector = () => ({innerText: ''});
  const root = {
    open: false,
    listeners: {},
    addEventListener(type, fn) { this.listeners[type] = fn; },
    showModal() { this.open = true; },
    close() { this.open = false; this.listeners.close?.(); },
    querySelector(selector) {
      if (selector === '.wsk-card--heading-text') return headingPresent ? heading : null;
      if (selector === '.QRCodeSuccessDialog-data') return data;
      if (selector === '.QRCodeSuccessDialog-callback') return callback;
      return buttons.get(selector.replace('.QRCodeSuccessDialog-', ''));
    },
  };
  const saved = Object.fromEntries(['window', 'document', 'navigator']
    .map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.defineProperty(globalThis, 'window', {configurable: true, value: {
    location: new URL('https://scanner.example/'), confirm: () => false,
  }});
  Object.defineProperty(globalThis, 'document', {configurable: true, value: {
    getElementById: () => root,
  }});
  Object.defineProperty(globalThis, 'navigator', {configurable: true, value: {}});
  const manager = new QRCodeManager('qrcode');
  return {
    manager, root, heading, data, navigate: buttons.get('navigate'),
    restore() {
      for (const [key, descriptor] of Object.entries(saved)) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
    },
  };
}

test('external protocols disclose their scheme and require a second decision before leaving', () => {
  const mounted = mount();
  try {
    for (const [value, app] of [
      ['mailto:person@example.com?body=hello', 'email app'],
      ['tel:+12025550123', 'phone app'],
      ['sms:+12025550123?body=hello', 'messaging app'],
    ]) {
      const url = new URL(value);
      mounted.manager.currentUrl = url;
      mounted.manager.showDialog(url);
      assert.match(mounted.heading.textContent, new RegExp(`${url.protocol} opens ${app}`));
      assert.equal(mounted.data.innerText, url);
      const before = window.location;
      let prompt;
      window.confirm = (text) => { prompt = text; return false; };
      mounted.navigate.click();
      assert.match(prompt, new RegExp(`${url.protocol}`));
      assert.match(prompt, /prefill a recipient or message/);
      assert.equal(window.location, before, 'cancel must not navigate');
      assert.equal(mounted.root.open, true, 'cancel preserves the result dialog');
      window.confirm = () => true;
      mounted.navigate.click();
      assert.equal(window.location, url, 'accept navigates to the exact parsed payload');
      assert.equal(mounted.root.open, false);
      window.location = before;
    }
  } finally { mounted.restore(); }
});

test('a missing heading does not lose the scanned content or callback state', () => {
  const mounted = mount({headingPresent: false});
  try {
    const url = new URL('mailto:person@example.com?body=hello');
    mounted.manager.currentUrl = url;
    assert.doesNotThrow(() => mounted.manager.showDialog(url));
    assert.equal(mounted.root.open, true, 'a missing heading must not prevent showModal');
    assert.equal(mounted.data.innerText, url);
    assert.equal(mounted.manager.callbackController.qrcodeUrl, url,
      'a missing heading must not skip the callback payload update');
    const before = window.location;
    let prompt;
    window.confirm = (text) => { prompt = text; return false; };
    mounted.navigate.click();
    assert.match(prompt, /email app \(mailto:\)/);
    assert.equal(window.location, before, 'cancel must still block the external handoff');
    assert.equal(mounted.root.open, true, 'cancel must keep the native result dialog open');
  } finally { mounted.restore(); }
});

test('HTTPS and loopback HTTP still open immediately and keep the usual heading', () => {
  const mounted = mount();
  try {
    for (const href of ['https://example.com/path', 'http://localhost/path']) {
      const url = new URL(href);
      mounted.manager.currentUrl = url;
      mounted.manager.showDialog(url);
      assert.equal(mounted.heading.textContent, 'QR Code found');
      window.confirm = () => { throw new Error('web URLs should not prompt'); };
      mounted.navigate.click();
      assert.equal(window.location, url);
      assert.equal(mounted.root.open, false);
    }
  } finally { mounted.restore(); }
});

test('unknown non-web protocols show an app heading and require consent only if allowlisted', () => {
  const mounted = mount();
  const loggedError = console.error;
  const loggedWarn = console.warn;
  try {
    console.warn = () => {};
    const url = new URL('geo:0,0?q=map');
    const allowed = isSafeUrl(url);
    mounted.manager.currentUrl = url;
    mounted.manager.showDialog(url);
    if (allowed) assert.match(mounted.heading.textContent, /geo: opens .+/);
    else assert.equal(mounted.heading.textContent, 'QR Code found', 'refused schemes must not promise an app handoff');
    const before = window.location;
    let prompted = 0;
    window.confirm = (message) => {
      prompted++;
      assert.match(message, /\(geo:\)/);
      return false;
    };
    console.error = () => {};
    mounted.navigate.click();
    assert.equal(window.location, before, 'neither rejection nor a declined prompt may navigate');
    assert.equal(prompted, Number(allowed),
      'if geo: is ever allowlisted, its external-app handoff must ask first');
  } finally { console.error = loggedError; console.warn = loggedWarn; mounted.restore(); }
});

test('refused URL schemes never promise an external-app handoff', () => {
  const mounted = mount();
  const loggedWarn = console.warn;
  try {
    console.warn = () => {};
    for (const value of ['javascript:alert(1)', 'data:text/html,<b>x</b>', 'file:///etc/passwd', 'ftp://example.com/x']) {
      const url = new URL(value);
      mounted.manager.currentUrl = url;
      mounted.manager.showDialog(url);
      assert.equal(mounted.heading.textContent, 'QR Code found', `${url.protocol} is not allowed`);
      assert.equal(mounted.root.open, true);
    }
  } finally { console.warn = loggedWarn; mounted.restore(); }
});
