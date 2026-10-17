import test from 'node:test';
import assert from 'node:assert/strict';
// qrclient constructs a browser Worker at import time; no worker work is needed here.
globalThis.Worker = class {
  addEventListener() {}
  removeEventListener() {}
  postMessage() {}
};
const { QRCodeCamera } = await import('../../app/scripts/components/QRCodeCamera.js');
delete globalThis.Worker;

// Exercise the real coordinator callback without constructing camera or DOM objects.
function makeCamera(detectQRCode) {
  const camera = Object.create(QRCodeCamera.prototype);
  camera.cameraManager = {};
  camera.qrCodeManager = { detectQRCode };
  camera.setupCameraCallback();
  return camera;
}

test('frame decoding drops overlap and resumes after completion', async () => {
  let resolveFirst;
  const contexts = [];
  const camera = makeCamera((context) => {
    contexts.push(context);
    if (contexts.length === 1) {
      return new Promise((resolve) => { resolveFirst = resolve; });
    }
    return Promise.resolve(undefined);
  });
  const first = camera.cameraManager.onframe('first');
  await camera.cameraManager.onframe('overlap');
  assert.deepEqual(contexts, ['first']);
  assert.equal(Object.hasOwn(camera, 'processingFrame'), false);

  resolveFirst(undefined);
  await first;
  await camera.cameraManager.onframe('next');
  assert.deepEqual(contexts, ['first', 'next']);
});

test('frame decoding resumes after a failed detection', async () => {
  let attempts = 0;
  const camera = makeCamera(() => {
    if (++attempts === 1) return Promise.reject(new Error('decode failed'));
    return Promise.resolve(undefined);
  });
  await assert.rejects(camera.cameraManager.onframe({}), /decode failed/);
  await camera.cameraManager.onframe({});
  assert.equal(attempts, 2);
});
