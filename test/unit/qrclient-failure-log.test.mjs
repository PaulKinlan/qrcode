import test from 'node:test';
import assert from 'node:assert/strict';

// Bead qrcode-krv: a failed decode is reported to the user, but it also has to be diagnosable in
// devtools - otherwise a dead worker, a failed wasm load and an unreadable canvas all look like
// the ordinary "no QR code in this frame" miss. The scan loop decodes once per animation frame,
// so the diagnostic must not repeat an unchanged failure at frame rate either.
globalThis.Worker = class {
  addEventListener() {}
  removeEventListener() {}
  postMessage() {}
};
const { decode } = await import('../../app/scripts/qrclient.js');
delete globalThis.Worker;

/** Run one decode whose frame read throws `message`, capturing console.warn while it runs. */
const decodeFailingFrame = async (message, onFailure) => {
  const warns = [];
  const original = console.warn;
  console.warn = (...args) => warns.push(args);
  try {
    const result = await decode({
      canvas: { width: 2, height: 2 },
      getImageData() { throw new Error(message); },
    }, onFailure);
    assert.equal(result, undefined);
  } finally {
    console.warn = original;
  }
  return warns;
};

test('a decode failure leaves a console diagnostic naming the error', async () => {
  const warns = await decodeFailingFrame('krv-log-first: canvas unavailable');
  assert.equal(warns.length, 1, 'exactly one diagnostic line for one distinct failure');
  assert.equal(warns[0][0], 'QR decoder failure:');
  assert.equal(warns[0][1]?.message, 'krv-log-first: canvas unavailable');
});

test('an unchanged failure repeated every frame is logged once and counted, not repeated', async () => {
  const warned = [];
  let repeatedOnly = 0;
  const original = console.warn;
  console.warn = (...args) => warned.push(args);
  try {
    const frame = (message) => decode({
      canvas: { width: 2, height: 2 },
      getImageData() { throw new Error(message); },
    });
    await frame('krv-log-repeat: worker was terminated');
    await frame('krv-log-repeat: worker was terminated');
    await frame('krv-log-repeat: worker was terminated');
    repeatedOnly = warned.length;
    // A different cause is a different diagnostic: it is reported, and it says how many repeats
    // it collapsed so the frame-rate flood is not lost silently.
    await frame('krv-log-repeat: canvas lost, second cause');
  } finally {
    console.warn = original;
  }

  assert.equal(repeatedOnly, 1, 'the same failure on three frames logs one line');
  assert.match(warned[0][1].message, /worker was terminated/);
  assert.equal(warned.length, 3, 'new cause logs its own line, preceded by the suppressed count');
  assert.match(warned[1][0], /2 further identical failure\(s\) suppressed/);
  assert.match(warned[2][1].message, /second cause/);
});

test('logging does not change what onFailure is told: every failure still reaches the caller', async () => {
  const errors = [];
  const onFailure = (error) => errors.push(error);
  const warns = [];
  const original = console.warn;
  console.warn = (...args) => warns.push(args);
  try {
    const frame = () => decode({
      canvas: { width: 2, height: 2 },
      getImageData() { throw new Error('krv-log-callback: unreadable frame'); },
    }, onFailure);
    await frame();
    await frame();
  } finally {
    console.warn = original;
  }

  assert.equal(errors.length, 2, 'onFailure is called per failure, deduplicated logging or not');
  assert.equal(warns.length, 1, 'but the console only gets the first one');
});
