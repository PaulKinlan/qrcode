import test from 'node:test';
import assert from 'node:assert/strict';
import { CameraFallbackManager } from '../../app/scripts/components/camera/CameraFallbackManager.js';

/**
 * The parts of HTMLInputElement the manager depends on. A real file input is
 * not two independent fields: assigning '' to its value also empties its
 * FileList. Modelling that coupling is what makes the capture-before-clear
 * ordering in CameraFallbackManager observable - with independent fields a
 * handler that re-arms the input before reading files[0] would still pass.
 */
class MockFileInput {
  #value = '';
  files = [];

  addEventListener(type, callback) {
    assert.equal(type, 'change');
    this.onchange = callback;
  }

  get value() {
    return this.#value;
  }

  set value(next) {
    this.#value = next;
    if (next === '') this.files = [];
  }
}

function setup() {
  const previousImage = globalThis.Image;
  const previousURL = globalThis.URL;
  const previousConsoleError = console.error;
  const revoked = [];
  const errors = [];
  let created = 0;
  const input = new MockFileInput();
  globalThis.Image = class { naturalWidth = 100; naturalHeight = 100; };
  globalThis.URL = {
    createObjectURL() { return `blob:test-${++created}`; },
    revokeObjectURL(url) { revoked.push(url); },
  };
  console.error = (...args) => errors.push(args);
  const manager = new CameraFallbackManager({ querySelector: () => input });
  const alert = { hidden: true };
  manager.onFailure = () => { alert.hidden = false; };
  return {
    manager, alert, errors, revoked, input,
    get created() { return created; },
    select(file) {
      // Simulates the picker: it populates value and files, then fires change.
      const value = file ? 'C:\\fakepath\\selected.png' : '';
      if (input.value === value) return;
      input.value = value;
      input.files = file ? [file] : [];
      input.onchange({ target: input });
    },
    restore() {
      globalThis.Image = previousImage;
      globalThis.URL = previousURL;
      console.error = previousConsoleError;
    },
  };
}

const imageFile = { type: 'image/png', size: 1024 };

test('invalid type or oversized upload is rejected before object URL creation and shows error', () => {
  const env = setup();
  try {
    env.select({ type: 'text/plain', size: 8 });
    assert.equal(env.created, 0);
    assert.equal(env.alert.hidden, false);
    assert.equal(env.errors.length, 1, 'failure leaves a console trail');
    assert.match(env.errors[0][1].message, /supported image file/);
    env.alert.hidden = true;
    env.select({ type: 'image/png', size: 10 * 1024 * 1024 + 1 });
    assert.equal(env.created, 0);
    assert.equal(env.alert.hidden, false);
    assert.match(env.errors[1][1].message, /smaller than 10 MiB/);
  } finally { env.restore(); }
});

test('failed image decode revokes URL once and shows error; successful retry still scans', () => {
  const env = setup();
  try {
    let frames = 0;
    env.manager.onframeready = () => { frames += 1; };
    env.select(imageFile);
    env.manager.image.onerror();
    assert.deepEqual(env.revoked, ['blob:test-1']);
    assert.equal(env.alert.hidden, false);
    assert.equal(env.errors.length, 1);
    env.select(imageFile);
    env.manager.image.onload();
    assert.deepEqual(env.revoked, ['blob:test-1', 'blob:test-2']);
    assert.equal(frames, 1);
  } finally { env.restore(); }
});

test('choosing the identical file again after a failed decode starts another attempt', () => {
  const env = setup();
  try {
    env.select(imageFile);
    assert.equal(env.input.value, '', 'file input re-armed after the selection');
    assert.deepEqual(env.input.files, [], 're-arming empties files, as a browser does');
    env.manager.image.onerror();
    env.select(imageFile);
    assert.equal(env.created, 2, 'same file selection must dispatch a new change');
  } finally { env.restore(); }
});

test('rapid reselection revokes pending URL and ignores stale decode callback', () => {
  const env = setup();
  try {
    let frames = 0;
    env.manager.onframeready = () => { frames += 1; };
    env.select(imageFile);
    const staleOnload = env.manager.image.onload;
    env.select(imageFile);
    assert.deepEqual(env.revoked, ['blob:test-1']);
    staleOnload();
    assert.equal(frames, 0);
    env.manager.image.onload();
    assert.deepEqual(env.revoked, ['blob:test-1', 'blob:test-2']);
    assert.equal(frames, 1);
  } finally { env.restore(); }
});
