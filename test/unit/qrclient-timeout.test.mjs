// Bead qrcode-g4y: decode() raced only the proxy call and the worker's 'error' event, so a worker
// that is alive but never answers - a WASM decode stuck in a loop on a hostile frame, or a Comlink
// reply that is never posted - left the race pending for ever. The scan loop awaits decode() before
// scheduling the next frame, so scanning stopped permanently with no error and no recovery.
//
// This drives the shipped qrclient module over the real Comlink wire protocol with a stub Worker
// endpoint that simply never replies. Deleting the timeout arm from the race makes these tests
// hang rather than pass, which is the point: they are the regression guard for the missing bound.
import test from 'node:test';
import assert from 'node:assert/strict';

const PAYLOAD = 'https://example.com/after-worker-restart';
const RECOVERY_FRAME = { canvas: { width: 2, height: 2 }, getImageData() { return { data: new Uint8ClampedArray(16) }; } };

// What the next constructed worker does with a decode request: 'hang' never answers ('hang' is
// exactly the wedged-WASM case), 'reply' answers like a healthy worker.
let behavior = 'hang';
const constructed = [];

globalThis.Worker = class {
  constructor() {
    constructed.push(this);
    this.terminated = false;
  }
  addEventListener(type, listener) {
    // Comlink attaches its "message" listener in wrap(); the stub answers through it.
    if (type === 'message') this.messageListener = listener;
  }
  removeEventListener() {}
  postMessage(message) {
    if (this.terminated || behavior !== 'reply') return;
    queueMicrotask(() => this.messageListener?.({ data: { id: message.id, type: 'RAW', value: PAYLOAD } }));
  }
  terminate() { this.terminated = true; }
};

const { decode, DECODE_TIMEOUT_MS, MAX_CONSECUTIVE_DECODE_TIMEOUTS } =
  await import('../../app/scripts/qrclient.js');
// The stub stays installed: this module creates a replacement worker when a decode wedges it.

test('a decode that never answers is bounded and reported through onFailure', async () => {
  const errors = [];
  const started = Date.now();
  const result = await decode(RECOVERY_FRAME, (error) => errors.push(error));
  const elapsed = Date.now() - started;

  assert.equal(result, undefined, 'a timed-out decode resolves like any other failed decode');
  assert.equal(errors.length, 1, 'the failure must reach the caller, not vanish');
  assert.equal(errors[0].name, 'TimeoutError');
  assert.match(errors[0].message, /timed out/);
  assert.ok(elapsed >= DECODE_TIMEOUT_MS - 50, `waited less than the bound: ${elapsed}ms`);
  assert.ok(elapsed < DECODE_TIMEOUT_MS + 2000, `did not settle near the bound: ${elapsed}ms`);
});

test('a wedged worker is replaced and scanning resumes on the new one', async () => {
  // Enough consecutive timeouts to trip the escalation, whatever the previous test left behind.
  for (let i = 0; i < MAX_CONSECUTIVE_DECODE_TIMEOUTS; i++) {
    assert.equal(await decode(RECOVERY_FRAME), undefined);
  }

  assert.ok(constructed.length > 1, 'a wedged worker must be terminated and re-created');
  assert.ok(constructed[0].terminated, 'the wedged worker is the one that gets terminated');

  behavior = 'reply';
  const result = await decode(RECOVERY_FRAME);
  assert.equal(result, PAYLOAD, 'a healthy replacement worker restores decoding without a reload');
});

test('a healthy decode is not delayed by the bound and clears its timer', async () => {
  behavior = 'reply';
  let cleared = 0;
  const originalClearTimeout = globalThis.clearTimeout;
  globalThis.clearTimeout = (handle) => {
    cleared += 1;
    return originalClearTimeout(handle);
  };

  const started = Date.now();
  const result = await decode(RECOVERY_FRAME);
  const elapsed = Date.now() - started;
  globalThis.clearTimeout = originalClearTimeout;

  assert.equal(result, PAYLOAD);
  assert.ok(elapsed < DECODE_TIMEOUT_MS, `a settled decode must not wait for the bound: ${elapsed}ms`);
  assert.ok(cleared >= 1, 'the per-decode timeout is cleared instead of left pending every frame');
});
