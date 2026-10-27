// Dimension-readiness regressions for the camera path (bead qrcode-xrv).
//
// video.videoWidth/videoHeight read 0 until the element reaches HAVE_METADATA, so
// anything that sizes the canvas straight after getUserMedia resolves allocates a
// zero-sized drawing buffer and a crop rectangle outside the video. These tests are
// pure module tests: fake media element, fake getUserMedia, no DOM and no browser.
import test from 'node:test';
import assert from 'node:assert/strict';

const { CameraSource } = await import('../../app/scripts/components/camera/CameraSource.js');
const { CameraManager } = await import('../../app/scripts/components/camera/CameraManager.js');

/** Minimal HTMLMediaElement stand-in with a manual event queue. */
class FakeVideo {
  constructor() {
    this.readyState = 0;
    this.videoWidth = 0;
    this.videoHeight = 0;
    this.srcObject = null;
    this.loadCalls = 0;
    this.playCalls = 0;
    this.listeners = new Map();
  }

  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
  }

  removeEventListener(type, fn) {
    this.listeners.get(type)?.delete(fn);
  }

  /** Simulate the element becoming decodable. */
  deliverMetadata(width, height) {
    this.readyState = 1;
    this.videoWidth = width;
    this.videoHeight = height;
    this.dispatch('loadedmetadata');
  }

  dispatch(type) {
    for (const fn of [...(this.listeners.get(type) ?? [])]) {
      fn({ type });
    }
  }

  load() {
    this.loadCalls += 1;
    this.readyState = 0;
    this.videoWidth = 0;
    this.videoHeight = 0;
  }

  play() {
    this.playCalls += 1;
    return Promise.resolve();
  }
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

/** Install the browser globals CameraSource touches, returning a restore function. */
function withBrowserGlobals({ getUserMedia }) {
  const saved = {
    navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator'),
    requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame,
  };

  Object.defineProperty(globalThis, 'navigator', {
    value: { mediaDevices: { enumerateDevices() {}, getUserMedia } },
    configurable: true,
    writable: true,
  });
  globalThis.requestAnimationFrame = (fn) => {
    globalThis.__frames = [...(globalThis.__frames ?? []), fn];
    return globalThis.__frames.length;
  };
  globalThis.cancelAnimationFrame = () => {};
  globalThis.__frames = [];

  return () => {
    if (saved.navigator) {
      Object.defineProperty(globalThis, 'navigator', saved.navigator);
    } else {
      delete globalThis.navigator;
    }
    globalThis.requestAnimationFrame = saved.requestAnimationFrame;
    globalThis.cancelAnimationFrame = saved.cancelAnimationFrame;
    delete globalThis.__frames;
  };
}

function makeStream() {
  const track = { stopped: false, stop() { this.stopped = true; } };
  return { getTracks: () => [track], track };
}

test('getDimensions stays 0x0 before HAVE_METADATA and reports the real size after', () => {
  const video = new FakeVideo();
  const source = new CameraSource(video);

  assert.equal(source.hasVideoDimensions(), false);
  assert.deepEqual(source.getDimensions(), { width: 0, height: 0 });

  video.deliverMetadata(1920, 1080);

  assert.equal(source.hasVideoDimensions(), true);
  assert.deepEqual(source.getDimensions(), { width: 1920, height: 1080 });
});

test('setCamera signals dimensions and starts frames only after metadata arrives', async () => {
  const video = new FakeVideo();
  const restore = withBrowserGlobals({ getUserMedia: async () => makeStream() });

  try {
    const source = new CameraSource(video);
    source.cameras = [{ deviceId: 'rear', kind: 'videoinput', label: 'back' }];

    const events = [];
    source.onDimensionsChanged = () => events.push('dimensions');
    source.onframeready = () => events.push('frame');

    const started = source.setCamera(0);
    await tick();
    await tick();

    // getUserMedia resolved and the element is loading, but nothing may be sized yet.
    assert.equal(video.playCalls, 1);
    assert.deepEqual(events, []);
    assert.deepEqual(globalThis.__frames, []);

    video.deliverMetadata(1280, 720);
    await started;

    assert.deepEqual(events, ['dimensions']);
    assert.equal(globalThis.__frames.length, 1);

    // The frame loop only emits frames once the video reports pixels.
    globalThis.__frames.shift()();
    assert.deepEqual(events, ['dimensions', 'frame']);
    assert.equal(globalThis.__frames.length, 1);
  } finally {
    restore();
  }
});

test('setCamera does not size or pump frames when the stream never reports dimensions', async () => {
  const video = new FakeVideo();
  const restore = withBrowserGlobals({ getUserMedia: async () => makeStream() });

  try {
    const source = new CameraSource(video);
    source.cameras = [{ deviceId: 'front', kind: 'videoinput', label: 'front' }];

    const events = [];
    source.onDimensionsChanged = () => events.push('dimensions');
    source.onframeready = () => events.push('frame');
    const warnings = [];
    const warn = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));

    try {
      const started = source.setCamera(0);
      await tick();
      await tick();

      // A dead stream fires error, not loadedmetadata.
      video.dispatch('error');
      await started;
    } finally {
      console.warn = warn;
    }

    assert.deepEqual(events, []);
    assert.deepEqual(globalThis.__frames, []);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /no video dimensions/);
  } finally {
    restore();
  }
});

/** CameraManager resize harness: real prototype method, fake collaborators. */
function makeManager(sourceDimensions) {
  const manager = Object.create(CameraManager.prototype);
  manager.element = 'camera';
  manager.cameraCanvas = { width: 7, height: 7 };
  manager.cameraOverlay = { style: {} };
  manager.sourceManager = {
    resize() {},
    getDimensions: () => ({ ...sourceDimensions }),
  };
  manager.dWidth = null;
  manager.dHeight = null;
  return manager;
}

test('resize leaves the canvas untouched while the source reports 0x0', () => {
  const manager = makeManager({ width: 0, height: 0, scaleFactor: 1 });

  manager.resize(400, 400);

  assert.equal(manager.cameraCanvas.width, 7);
  assert.equal(manager.cameraCanvas.height, 7);
  assert.equal(manager.dWidth, null);
  assert.deepEqual(manager.cameraOverlay.style, {});
});

test('resize sizes the canvas and crop from real source dimensions', () => {
  const manager = makeManager({ width: 1920, height: 1080, scaleFactor: 1.5 });

  manager.resize(400, 400);

  // getOverlayDimensions(400, 400): minLength 400, padding 32, width 336.
  assert.equal(manager.dWidth, 336 / 1.5);
  assert.equal(manager.dHeight, 336 / 1.5);
  assert.equal(manager.cameraCanvas.width, 336 / 1.5);
  assert.equal(manager.cameraCanvas.height, 336 / 1.5);
  assert.equal(manager.sx, 1920 / 2 - 336 / 1.5 / 2);
  assert.equal(manager.sy, 1080 / 2 - 336 / 1.5 / 2);
  assert.equal(manager.sWidth, 336 / 1.5);
  assert.equal(manager.sHeight, 336 / 1.5);
  assert.equal(manager.cameraOverlay.style.borderTopWidth, '32px');
});
