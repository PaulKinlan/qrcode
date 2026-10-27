// qrclient must never let a broken decoder look like an empty frame (bead qrcode-8iz).
//
// The shipped module spawns a real Worker at import time, so the pipeline contract is tested
// through createDecoder() with fake worker proxies, and the real wiring is asserted against the
// source plus the Worker the import actually constructed. That keeps these tests pure-module
// (fast tier: no worker protocol, no network, no browser).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const workers = [];
globalThis.Worker = class {
  constructor(url) {
    workers.push(url);
  }
  addEventListener() {}
  removeEventListener() {}
  postMessage() {}
};

const { createDecoder, DecodeError } = await import('../../app/scripts/qrclient.js');

/** A canvas-context stand-in with a readable frame, unless the test wants an unreadable one. */
function makeContext({ width = 2, height = 2, unreadable = false } = {}) {
  const imageData = { width, height, data: new Uint8ClampedArray(width * height * 4) };
  return {
    canvas: { width, height },
    getImageData(x, y, w, h) {
      if (unreadable) throw new Error('canvas is not readable');
      return imageData;
    },
    imageData,
  };
}

test('a miss is undefined and a hit is the payload', async () => {
  const calls = [];
  const decodeMiss = createDecoder(() => ({
    detectUrl: async (width, height, imageData) => {
      calls.push({ width, height, imageData });
    },
  }));

  const context = makeContext({ width: 3, height: 5 });
  assert.equal(await decodeMiss(context), undefined);
  assert.deepEqual(calls, [{ width: 3, height: 5, imageData: context.imageData }]);

  const decodeHit = createDecoder(() => ({ detectUrl: async () => 'https://example.com/' }));
  assert.equal(await decodeHit(makeContext()), 'https://example.com/');
});

test('a worker still choosing its detector (null) is a miss, not a failure', async () => {
  const decode = createDecoder(() => ({ detectUrl: async () => null }));
  assert.equal(await decode(makeContext()), undefined);
});

test('a rejecting worker is a DecodeError, not a miss', async () => {
  const cause = new Error('worker terminated before it answered');
  const decode = createDecoder(() => ({
    detectUrl: async () => {
      throw cause;
    },
  }));

  await assert.rejects(decode(makeContext()), (error) => {
    assert.ok(error instanceof DecodeError, 'a failed decode must be typed, not undefined');
    assert.equal(error.name, 'DecodeError');
    assert.match(error.message, /decoder worker failed/);
    assert.equal(error.cause, cause, 'the underlying failure must stay inspectable');
    return true;
  });
});

test('a worker proxy that cannot even be reached is a DecodeError', async () => {
  const decode = createDecoder(() => {
    throw new Error('no worker');
  });

  await assert.rejects(decode(makeContext()), (error) => {
    assert.ok(error instanceof DecodeError);
    assert.match(error.message, /decoder worker failed/);
    return true;
  });
});

test('an unreadable frame is a DecodeError, not a miss', async () => {
  const decode = createDecoder(() => ({ detectUrl: async () => 'never reached' }));

  await assert.rejects(decode(makeContext({ unreadable: true })), (error) => {
    assert.ok(error instanceof DecodeError);
    assert.match(error.message, /read the camera frame/);
    return true;
  });
});

test('the shipped decode() drives the real Comlink worker proxy', () => {
  const source = readFileSync(new URL('../../app/scripts/qrclient.js', import.meta.url), 'utf8');
  assert.match(source, /Comlink\.wrap\(new Worker\(new URL\('\.\/qrworker\.js', import\.meta\.url\)/);
  assert.match(source, /export const decode = createDecoder\(\(\) => proxy\)/);
  assert.equal(workers.length, 1, 'importing qrclient should construct exactly one worker');
  assert.match(workers[0].href ?? String(workers[0]), /qrworker\.js$/);
});
