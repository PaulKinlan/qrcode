// Unit tier: the About dialog is a native <dialog> managed by QRCodeHelpManager (beads
// qrcode-e4c, qrcode-319). Everything a keyboard user touches - Escape-to-close, Tab
// containment, focus return to the trigger, autofocus Close - is platform behaviour of
// showModal(), exercised by the real-keystroke phase in test/browser/smoke.test.mjs. What is
// left to unit-test in the fast tier is this class's own contract: the modal open/close
// guards (showModal() and close() both throw on a double call, so the manager must not make
// one). Each test uses its own stub element: the open state is what the guards read, so a
// shared stub would leak between tests.
import test from 'node:test';
import assert from 'node:assert/strict';
import { QRCodeHelpManager } from '../../app/scripts/components/dialogs/QRCodeHelpManager.js';

class StubDialog {
  constructor() {
    this.open = false;
    this.showModalCalls = 0;
    this.closeCalls = 0;
    this.listeners = new Map();
  }

  showModal() {
    this.showModalCalls += 1;
    this.open = true;
  }

  close() {
    this.closeCalls += 1;
    this.open = false;
  }

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }

  dispatch(type, event) {
    for (const handler of this.listeners.get(type) ?? []) handler(event);
  }
}

function makeHarness() {
  const close = new StubDialog();
  close.addEventListener = StubDialog.prototype.addEventListener;
  const root = new StubDialog();
  root.querySelector = (selector) => (selector === '.QRCodeAboutDialog-close' ? close : null);
  globalThis.document = { getElementById: (id) => (id === 'about' ? root : null) };
  return { root, close, manager: new QRCodeHelpManager('about') };
}

test('showDialog opens the dialog modally exactly once while it is already open', () => {
  const { root, manager } = makeHarness();

  manager.showDialog();
  manager.showDialog();

  assert.equal(root.showModalCalls, 1, 'a repeated showDialog while open must not call showModal again');
  assert.equal(root.open, true);
});

test('closeDialog closes the dialog and is safe while it is already closed', () => {
  const { root, manager } = makeHarness();
  manager.showDialog();

  manager.closeDialog();
  manager.closeDialog();

  assert.equal(root.closeCalls, 1, 'a repeated closeDialog while closed must not call close again');
  assert.equal(root.open, false);
});

test('a pointer click on Close closes the dialog', () => {
  const { close, root, manager } = makeHarness();
  manager.showDialog();

  close.dispatch('click', {});

  assert.equal(root.open, false);
});
