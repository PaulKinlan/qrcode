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
  // Models the parts of HTMLImageElement the manager touches. Detaching the source is how
  // a browser unloads a decoded image, so the fake reproduces the consequence (no source,
  // reported size 0x0) instead of absorbing the call: that is what makes "the rejected
  // bitmap was released" something this suite can assert.
  globalThis.Image = class {
    naturalWidth = 0;
    naturalHeight = 0;
    src = '';
    removeAttribute(name) {
      assert.equal(name, 'src');
      this.src = '';
      this.naturalWidth = 0;
      this.naturalHeight = 0;
    }
  };
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

test('decoded image over 40 megapixels is rejected before canvas/frame callbacks', () => {
  const env = setup();
  try {
    let dimensionsChanged = 0;
    let frames = 0;
    const seenByFailureHandler = [];
    env.manager.onDimensionsChanged = () => { dimensionsChanged += 1; };
    env.manager.onframeready = () => { frames += 1; };
    env.manager.onFailure = () => {
      env.alert.hidden = false;
      // Snapshot inside the handler: releasing before reporting means even a handler
      // that inspects (or throws in) the manager cannot keep the bitmap alive.
      seenByFailureHandler.push({
        src: env.manager.image.src,
        width: env.manager.image.naturalWidth,
        height: env.manager.image.naturalHeight,
      });
    };
    env.select(imageFile); // compressed size is only 1 KiB; decoded pixels are the hazard
    env.manager.image.naturalWidth = 8000;
    env.manager.image.naturalHeight = 5001;
    env.manager.image.onload();
    assert.deepEqual(env.revoked, ['blob:test-1']);
    assert.equal(env.alert.hidden, false);
    assert.match(env.errors[0][1].message, /no larger than 40 megapixels/);
    assert.equal(dimensionsChanged, 0);
    assert.equal(frames, 0);
    // Revoking the URL is not enough: the element keeps a fully decoded image alive, and
    // it is reused for later selections. The rejection must release the decoded bitmap.
    assert.equal(env.manager.image.src, '', 'rejected source detached');
    assert.equal(env.manager.image.naturalWidth, 0, 'width released');
    assert.equal(env.manager.image.naturalHeight, 0, 'height released');
    assert.deepEqual(
      seenByFailureHandler,
      [{ src: '', width: 0, height: 0 }],
      'released before the failure is reported',
    );

    env.alert.hidden = true;
    env.select(imageFile);
    env.manager.image.naturalWidth = 8000;
    env.manager.image.naturalHeight = 5000; // exactly 40 MP is allowed
    env.manager.image.onload();
    assert.deepEqual(env.revoked, ['blob:test-1', 'blob:test-2']);
    assert.equal(env.alert.hidden, true);
    assert.equal(dimensionsChanged, 1);
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
