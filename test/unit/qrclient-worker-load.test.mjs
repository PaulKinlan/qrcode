import test from 'node:test';
import assert from 'node:assert/strict';

// Bead qrcode-sze: a module worker whose script fails to load never posts a reply, so the
// Comlink call would stay pending forever and the scan loop would wedge. qrclient must settle
// decode() via the Worker's 'error' event instead. This stub captures the constructed worker
// and never answers postMessage; errorListener() fires the 'error' event the way a
// module-script load failure does.
let workerInstance;
globalThis.Worker = class {
  constructor() { workerInstance = this; }
  addEventListener(type, listener) { if (type === 'error') this.errorListener = listener; }
  removeEventListener() {}
  postMessage() {}
};
const { decode } = await import('../../app/scripts/qrclient.js');
delete globalThis.Worker;

const frame = {
  canvas: { width: 2, height: 2 },
  getImageData() { return { data: new Uint8ClampedArray(16) }; },
};

test('worker load failure settles a pending decode, then later decodes fail fast', async () => {
  const errors = [];
  const hung = new Promise((_, reject) => setTimeout(() => reject(new Error('decode never settled')), 1000));

  // A decode in flight when the worker dies must settle, not hang the frame loop.
  const pending = decode(frame, (error) => errors.push(error));
  workerInstance.errorListener({ message: 'Failed to load module script' });
  assert.equal(await Promise.race([pending, hung]), undefined);
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /worker/i);

  // A later decode must fail fast rather than queue behind a worker that can never answer.
  const again = decode(frame, (error) => errors.push(error));
  assert.equal(await Promise.race([again, hung]), undefined);
  assert.equal(errors.length, 2);
});
