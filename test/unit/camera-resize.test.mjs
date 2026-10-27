// Window-resize coalescing for CameraManager (bead qrcode-01n).
//
// A window resize fires continuously while a window edge is dragged, and mobile
// browsers also fire it on address-bar show/hide and rotation. Each resize()
// reads layout and reallocates the canvas buffer, so the listener must collapse a
// burst of events into one relayout per animation frame while still honouring the
// synchronous initial resize.
//
// The test builds a real CameraManager over a minimal stub DOM so the wiring
// (window listener -> scheduleResize -> requestAnimationFrame -> resize) is
// exercised as shipped, not re-implemented here.
import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Install the smallest globals CameraManager + CameraFallbackManager touch.
 * Returns handles for driving resize events and animation frames.
 */
function installCameraEnvironment({ width = 400, height = 600 } = {}) {
  const saved = {
    window: globalThis.window,
    document: globalThis.document,
    location: globalThis.location,
    navigator: globalThis.navigator,
    Image: globalThis.Image,
    requestAnimationFrame: globalThis.requestAnimationFrame,
  };

  const windowListeners = new Map();
  const frames = [];
  let frameSeq = 0;

  const container = { offsetWidth: width, offsetHeight: height };

  const makeElement = (extra = {}) => ({
    style: {},
    classList: { add() {}, remove() {} },
    addEventListener() {},
    ...extra,
  });

  const sourceManagerElement = makeElement({
    querySelector: () => makeElement(),
  });

  const cameraCanvas = makeElement({ getContext: () => ({ drawImage() {} }) });
  const cameraOverlay = makeElement();

  const root = makeElement({
    parentNode: container,
    querySelector(selector) {
      if (selector === '.CameraRealtime' || selector === '.CameraFallback') {
        return sourceManagerElement;
      }
      if (selector === '.Camera-display') return cameraCanvas;
      if (selector === '.Camera-overlay') return cameraOverlay;
      return null;
    },
  });

  Object.defineProperty(globalThis, 'window', {
    value: {
      addEventListener(type, listener) {
        const list = windowListeners.get(type) ?? [];
        list.push(listener);
        windowListeners.set(type, list);
      },
    },
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, 'document', {
    value: { getElementById: () => root, addEventListener() {} },
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, 'location', {
    // #nogum keeps CameraManager on the camera-free fallback path.
    value: { hash: '#nogum' },
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, 'navigator', {
    value: { mediaDevices: { getUserMedia() {} } },
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, 'Image', {
    value: class {
      constructor() {
        this.naturalWidth = 640;
        this.naturalHeight = 480;
      }
    },
    configurable: true,
    writable: true,
  });
  Object.defineProperty(globalThis, 'requestAnimationFrame', {
    value(callback) {
      frames.push(callback);
      frameSeq += 1;
      return frameSeq;
    },
    configurable: true,
    writable: true,
  });

  return {
    dispatchResize(times = 1) {
      const listeners = windowListeners.get('resize') ?? [];
      for (let i = 0; i < times; i += 1) {
        for (const listener of listeners) listener({ type: 'resize' });
      }
    },
    get pendingFrames() {
      return frames.length;
    },
    /** Run every queued animation frame callback (like one display frame). */
    flushFrames() {
      const queued = frames.splice(0, frames.length);
      for (const callback of queued) callback(performance.now());
      return queued.length;
    },
    container,
    cameraCanvas,
    restore() {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) {
          delete globalThis[key];
        } else {
          Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
        }
      }
    },
  };
}

const { CameraManager } = await import('../../app/scripts/components/camera/CameraManager.js');

test('window resize bursts collapse into one relayout per frame', () => {
  const env = installCameraEnvironment();
  let sourceResizes = 0;
  const camera = new CameraManager('camera');
  const originalSourceResize = camera.sourceManager.resize.bind(camera.sourceManager);
  camera.sourceManager.resize = (...args) => {
    sourceResizes += 1;
    return originalSourceResize(...args);
  };
  try {
    // The initial resize in the constructor is synchronous, so the first frame
    // is already sized before any resize event arrives.
    assert.equal(env.pendingFrames, 0, 'initial resize must not wait for a frame');
    assert.equal(env.cameraCanvas.width, 336, 'initial canvas width for a 400x600 container');

    // A drag fires many resize events within one frame.
    env.dispatchResize(25);
    assert.equal(env.pendingFrames, 1, 'a burst must schedule exactly one frame');

    env.flushFrames();
    assert.equal(sourceResizes, 1, 'one relayout per frame, not one per event');
    assert.equal(env.cameraCanvas.width, 336);

    // After the frame drains, the next event schedules a new frame again.
    env.dispatchResize(3);
    assert.equal(env.pendingFrames, 1);

    // The coalesced relayout still applies the current container size.
    env.container.offsetWidth = 800;
    env.container.offsetHeight = 600;
    env.flushFrames();
    assert.equal(sourceResizes, 2);
    assert.equal(env.cameraCanvas.width, 536, 'coalesced resize must use the latest container size');
  } finally {
    env.restore();
  }
});
