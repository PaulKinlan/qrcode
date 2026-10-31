// Unit tier: the About dialog manager owns the keyboard/focus contract (bead qrcode-e4c) —
// opening moves focus into the dialog, Escape closes it, and closing returns focus to the
// control that opened it. The manager only touches getElementById, querySelector,
// addEventListener, style.display, focus() and document.activeElement, so a small DOM stub
// keeps those assertions in the fast tier (`npm run test:fast` runs no browser). The real
// keystrokes are driven headlessly in test/browser/smoke.test.mjs.
//
// Every test builds its OWN stub document (fresh root/close/trigger): the manager reads
// `root.style.display` to decide whether it is opening, so a shared root would leak one
// test's open dialog into the next and mask the focus-return path.
import test from 'node:test';
import assert from 'node:assert/strict';

import { QRCodeHelpManager } from '../../app/scripts/components/dialogs/QRCodeHelpManager.js';

class StubElement {
  constructor() {
    this.style = { display: '' };
    this.listeners = new Map();
    this.focusCalls = 0;
  }

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }

  dispatch(type, event) {
    for (const handler of this.listeners.get(type) ?? []) handler(event);
  }

  focus() {
    this.focusCalls += 1;
    document.activeElement = this;
  }
}

/**
 * One independent harness per test: a fresh dialog root, its Close control, and a manager
 * wired to them through a fresh global `document`.
 */
function makeHarness() {
  const close = new StubElement();
  const root = new StubElement();
  root.querySelector = (selector) => (selector === '.QRCodeAboutDialog-close' ? close : null);

  globalThis.HTMLElement = StubElement;
  globalThis.document = { activeElement: null, getElementById: (id) => (id === 'about' ? root : null) };

  return { close, root, manager: new QRCodeHelpManager('about') };
}

test('showDialog reveals the dialog and moves focus to its Close control', () => {
  const { close, root, manager } = makeHarness();
  document.activeElement = new StubElement();

  manager.showDialog();

  assert.equal(root.style.display, 'block');
  assert.equal(document.activeElement, close);
  assert.ok(close.focusCalls > 0, 'the manager must call focus() on the Close control');
});

test('closeDialog hides the dialog and returns focus to the opening control', () => {
  const { close, root, manager } = makeHarness();
  const trigger = new StubElement();
  document.activeElement = trigger;
  manager.showDialog();
  assert.equal(document.activeElement, close);

  manager.closeDialog();

  assert.equal(root.style.display, 'none');
  assert.equal(document.activeElement, trigger);
  assert.ok(trigger.focusCalls > 0, 'the manager must call focus() on the trigger');
});

test('Escape closes the dialog and restores focus; other keys are ignored', () => {
  const { root, manager } = makeHarness();
  const trigger = new StubElement();
  document.activeElement = trigger;
  manager.showDialog();

  root.dispatch('keydown', { key: 'Tab' });
  assert.equal(root.style.display, 'block', 'a non-Escape keydown must not close the dialog');

  root.dispatch('keydown', { key: 'Escape' });
  assert.equal(root.style.display, 'none');
  assert.equal(document.activeElement, trigger);
});

test('clicking Close closes the dialog and restores focus to the trigger', () => {
  const { close, root, manager } = makeHarness();
  const trigger = new StubElement();
  document.activeElement = trigger;
  manager.showDialog();

  close.dispatch('click', {});

  assert.equal(root.style.display, 'none');
  assert.equal(document.activeElement, trigger);
});
