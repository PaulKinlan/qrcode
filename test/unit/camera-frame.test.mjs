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

test('a failed decode is reported as a decoder failure, not as a miss, and the loop resumes', async () => {
  let attempts = 0;
  const failures = [];
  const camera = makeCamera(() => {
    if (++attempts === 1) return Promise.reject(new Error('decode failed'));
    return Promise.resolve(undefined);
  });
  camera.ondecodeerror = (error, streak) => failures.push([error.message, streak]);

  // The frame loop must stay alive: a rejecting decoder used to escape as an unhandled rejection.
  await camera.cameraManager.onframe({});
  await camera.cameraManager.onframe({});

  assert.equal(attempts, 2);
  assert.deepEqual(failures, [['decode failed', 1]], 'the failure is surfaced, the healthy miss is not reported');
});

test('a miss that follows a failure ends the failure streak', async () => {
  let failing = true;
  const streaks = [];
  const logged = [];
  const camera = makeCamera(() =>
    failing ? Promise.reject(new Error('worker gone')) : Promise.resolve(undefined)
  );
  camera.ondecodeerror = (error, streak) => streaks.push(streak);

  const originalError = console.error;
  console.error = (...args) => logged.push(args);
  try {
    await camera.cameraManager.onframe({});
    await camera.cameraManager.onframe({});
    failing = false;
    await camera.cameraManager.onframe({});
    failing = true;
    await camera.cameraManager.onframe({});
  } finally {
    console.error = originalError;
  }

  // A healthy decode (here a miss) resets the count, so the streak restarts at 1.
  assert.deepEqual(streaks, [1, 2, 1]);
  assert.deepEqual(logged, [], 'short failure streaks stay quiet');
});

test('a decoder that never works is reported once per streak, not once per frame', async () => {
  const streaks = [];
  const logged = [];
  const camera = makeCamera(() => Promise.reject(new Error('worker gone')));
  camera.ondecodeerror = (error, streak) => streaks.push(streak);

  const originalError = console.error;
  console.error = (...args) => logged.push(args);
  try {
    for (let frame = 0; frame < 5; frame++) {
      await camera.cameraManager.onframe({});
    }
  } finally {
    console.error = originalError;
  }

  assert.deepEqual(streaks, [1, 2, 3, 4, 5]);
  assert.equal(logged.length, 1, 'one broken decoder reports one loud error for the whole streak');
  assert.match(String(logged[0][0]), /decoder looks broken/);
  assert.match(String(logged[0].at(-1).message), /worker gone/);
});
