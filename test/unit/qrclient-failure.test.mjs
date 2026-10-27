import test from 'node:test';
import assert from 'node:assert/strict';

// Comlink constructs its Worker as soon as qrclient is imported.
globalThis.Worker = class {
  addEventListener(_type, listener) { this.listener = listener; }
  removeEventListener() {}
  postMessage(message) {
    queueMicrotask(() => this.listener({ data: {
      id: message.id,
      type: 'HANDLER',
      name: 'throw',
      value: { isError: true, value: { name: 'Error', message: 'worker decode failed' } },
    } }));
  }
};
const { decode } = await import('../../app/scripts/qrclient.js');
delete globalThis.Worker;

test('worker rejection invokes onFailure and resolves without a QR result', async () => {
  const errors = [];
  const result = await decode({
    canvas: { width: 2, height: 2 },
    getImageData() { return { data: new Uint8ClampedArray(16) }; },
  }, (error) => errors.push(error));
  assert.equal(result, undefined);
  assert.equal(errors.length, 1);
  assert.match(errors[0].message, /worker decode failed/);
});

test('decoder reports image read failures through onFailure rather than silently losing them', async () => {
  const failure = new Error('canvas unavailable');
  const errors = [];
  const result = await decode({
    canvas: { width: 2, height: 2 },
    getImageData() { throw failure; },
  }, (error) => errors.push(error));
  assert.equal(result, undefined);
  assert.deepEqual(errors, [failure]);
});
