import test from 'node:test';
import assert from 'node:assert/strict';
import { CameraSource, cameraFailureReason } from '../../app/scripts/components/camera/CameraSource.js';
import { WebCamManager } from '../../app/scripts/components/camera/WebCamManager.js';

const settle = () => new Promise((resolve) => setImmediate(resolve));

function withMediaDevices(getUserMedia, { enumerate } = {}) {
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      mediaDevices: {
        async enumerateDevices() {
          return enumerate ? enumerate() : [{ kind: 'videoinput', deviceId: 'camera', label: 'rear' }];
        },
        getUserMedia,
      },
    },
  });
  return {
    restore() {
      if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator);
      else delete globalThis.navigator;
    },
  };
}

function withDocument(visibilityState = 'visible') {
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const listeners = new Map();
  const document = {
    visibilityState,
    addEventListener(type, fn) { listeners.set(type, fn); },
  };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: document });
  return {
    restore() {
      if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
      else delete globalThis.document;
    },
  };
}

test('a blocked camera is explained in words the user can act on', () => {
  assert.match(cameraFailureReason({ name: 'NotAllowedError', message: 'Permission denied' }),
    /allow the camera.*upload an image/i);
  assert.match(cameraFailureReason({ name: 'NotFoundError' }), /no camera was found/i);
  assert.match(cameraFailureReason({ name: 'NotReadableError' }), /another app may be using it/i);
  assert.match(cameraFailureReason({ name: 'OverconstrainedError' }), /does not support the resolution/i);
  // An unrecognised DOMException keeps the browser's own words, but still names the way out.
  assert.equal(cameraFailureReason({ name: 'SomeFutureError', message: 'Unexpected device state' }),
    'Unexpected device state. Upload an image instead.');
  assert.equal(cameraFailureReason(undefined),
    'The camera could not be started. Upload an image instead.');
});

test('a rejected getUserMedia reaches onFailure with the mapped reason and keeps the console trail', async () => {
  const env = withMediaDevices(async () => {
    throw Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });
  });
  const previousConsoleError = console.error;
  const logged = [];
  console.error = (...args) => logged.push(args);
  try {
    const source = new CameraSource({ srcObject: null, addEventListener() {}, load() {}, async play() {} });
    source.cameras = [{ kind: 'videoinput', deviceId: 'camera' }];
    const failures = [];
    source.onFailure = (error) => failures.push(error);
    await source.setCamera(0);
    assert.equal(failures.length, 1, 'exactly one failure is reported');
    assert.match(failures[0].message, /allow the camera.*upload an image/i);
    assert.equal(logged.length, 1, 'the console trail the old catch produced is kept');
    assert.equal(logged[0][0], 'Camera access error:');
  } finally {
    console.error = previousConsoleError;
    env.restore();
  }
});

test('WebCamManager forwards a camera failure to its own onFailure', async () => {
  const doc = withDocument('visible');
  const env = withMediaDevices(async () => {
    throw Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });
  });
  try {
    const video = { srcObject: null, addEventListener() {}, load() {}, async play() {} };
    const toggle = { style: {} };
    const input = { checked: false, addEventListener() {} };
    const root = {
      querySelector(selector) {
        return {
          '.Camera-video': video,
          '.Camera-toggle': toggle,
          '.Camera-toggle-input': input,
        }[selector];
      },
    };
    const manager = new WebCamManager(root);
    const failures = [];
    manager.onFailure = (error) => failures.push(error);
    await settle();
    await settle();
    assert.equal(failures.length, 1, 'the manager reports the fault instead of only logging it');
    assert.match(failures[0].message, /camera access is blocked/i);
  } finally {
    env.restore();
    doc.restore();
  }
});

test('a live-camera fault travels the real chain to the user-visible alert', async () => {
  // The same end-to-end shape test/unit/camera-upload-error-wiring.test.mjs uses for the upload
  // path: real CameraSource, real WebCamManager, real CameraManager, real QRCodeCamera wiring.
  const previous = {
    document: Object.getOwnPropertyDescriptor(globalThis, 'document'),
    window: Object.getOwnPropertyDescriptor(globalThis, 'window'),
    location: Object.getOwnPropertyDescriptor(globalThis, 'location'),
    navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator'),
    consoleError: console.error,
  };
  globalThis.Worker = class { addEventListener() {} removeEventListener() {} postMessage() {} };
  const { QRCodeCamera } = await import('../../app/scripts/components/QRCodeCamera.js');
  delete globalThis.Worker;
  const { CameraManager } = await import('../../app/scripts/components/camera/CameraManager.js');

  const alert = { hidden: true, textContent: 'Scanning failed. Please try again.' };
  const video = { srcObject: null, style: {}, addEventListener() {}, load() {}, async play() {} };
  const realtimeRoot = {
    classList: { remove() {} },
    querySelector(selector) {
      return {
        '.Camera-video': video,
        '.Camera-toggle': { style: {} },
        '.Camera-toggle-input': { checked: false, addEventListener() {} },
      }[selector] ?? null;
    },
  };
  const overlay = { style: {} };
  const canvas = { width: 0, height: 0, getContext: () => ({ drawImage() {} }) };
  const root = {
    parentNode: { offsetWidth: 400, offsetHeight: 600 },
    querySelector(selector) {
      return {
        '.CameraRealtime': realtimeRoot,
        '.CameraFallback': realtimeRoot,
        '.Camera-display': canvas,
        '.Camera-overlay': overlay,
      }[selector] ?? null;
    },
  };
  console.error = () => {};
  try {
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: {
        visibilityState: 'visible',
        getElementById: () => root,
        addEventListener() {},
      },
    });
    Object.defineProperty(globalThis, 'window', { configurable: true, value: { addEventListener() {} } });
    Object.defineProperty(globalThis, 'location', { configurable: true, value: { hash: '' } });
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        mediaDevices: {
          async enumerateDevices() { return [{ kind: 'videoinput', deviceId: 'cam', label: 'rear' }]; },
          async getUserMedia() {
            throw Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });
          },
        },
      },
    });

    const camera = Object.create(QRCodeCamera.prototype);
    camera.cameraManager = new CameraManager('camera');
    camera.qrCodeManager = { root: { open: false } };
    camera.scanError = alert;
    camera.setupCameraCallback();

    await settle();
    await settle();
    await settle();

    assert.equal(alert.hidden, false, 'a blocked camera must not leave the user looking at a blank panel');
    assert.match(alert.textContent, /allow the camera.*upload an image/i);
  } finally {
    console.error = previous.consoleError;
    for (const [key, descriptor] of Object.entries(previous)) {
      if (key === 'consoleError') continue;
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
