import test from 'node:test';
import assert from 'node:assert/strict';

// qrclient creates a Worker at module import; the upload failure path never starts it.
globalThis.Worker = class {
  addEventListener() {}
  removeEventListener() {}
  postMessage() {}
};
const { QRCodeCamera } = await import('../../app/scripts/components/QRCodeCamera.js');
delete globalThis.Worker;
const { CameraManager } = await import('../../app/scripts/components/camera/CameraManager.js');

test('fallback upload error travels through real camera source and coordinator to the existing alert', () => {
  const previous = {
    Image: globalThis.Image, window: globalThis.window,
    document: globalThis.document, location: globalThis.location,
    navigator: globalThis.navigator, consoleError: console.error,
  };
  let change;
  let logs = 0;
  const alert = { hidden: true };
  const input = { addEventListener(type, handler) {
    assert.equal(type, 'change');
    change = handler;
  } };
  const sourceRoot = {
    classList: { remove() {} }, querySelector: () => input,
  };
  const canvas = { getContext: () => ({ drawImage() {} }) };
  const overlay = { style: {} };
  const root = {
    parentNode: { offsetWidth: 400, offsetHeight: 600 },
    querySelector(selector) {
      if (selector === '.CameraFallback') return sourceRoot;
      if (selector === '.Camera-display') return canvas;
      if (selector === '.Camera-overlay') return overlay;
      return null;
    },
  };
  try {
    globalThis.Image = class { naturalWidth = 640; naturalHeight = 480; };
    globalThis.window = { addEventListener() {} };
    globalThis.document = { getElementById: () => root };
    globalThis.location = { hash: '#nogum' };
    Object.defineProperty(globalThis, 'navigator', {
      value: { mediaDevices: {} }, configurable: true, writable: true,
    });
    console.error = () => { logs += 1; };

    const camera = Object.create(QRCodeCamera.prototype);
    camera.cameraManager = new CameraManager('camera');
    camera.qrCodeManager = { root: { open: false } };
    camera.scanError = alert;
    camera.setupCameraCallback();

    change({ target: { files: [{ type: 'text/plain', size: 50 }] } });
    assert.equal(alert.hidden, false, 'real source -> manager -> coordinator unhides the alert');
    assert.equal(logs, 1, 'rejection leaves a console error');

    camera.scanError = null;
    assert.doesNotThrow(() => change({ target: { files: [{ type: 'text/plain', size: 50 }] } }),
      'optional alert is safe on pages without #camera-error');
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      const name = key === 'consoleError' ? null : key;
      if (!name) { console.error = value; continue; }
      if (value === undefined) delete globalThis[name];
      else Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    }
  }
});
