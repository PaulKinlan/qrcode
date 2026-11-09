import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createDetectUrl } from '../../app/scripts/detector-ready.js';

test('frames arriving before initialization wait and are decoded when the detector is ready', async () => {
  let release;
  const ready = new Promise((resolve) => { release = resolve; });
  let starts = 0;
  const frames = [];
  const detectUrl = createDetectUrl(() => { starts++; return ready; });
  const first = detectUrl(2, 3, { frame: 1 });
  const second = detectUrl(4, 5, { frame: 2 });
  let settled = false;
  first.then(() => { settled = true; }, () => { settled = true; });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(settled, false, 'an early frame must not be reported as a QR miss');
  release(async (width, height, image) => {
    frames.push({ width, height, image });
    return `QR ${image.frame}`;
  });
  assert.deepEqual(await Promise.all([first, second]), ['QR 1', 'QR 2']);
  assert.equal(starts, 1, 'initialize the detector only once');
  assert.deepEqual(frames.map(({ width, height, image }) => [width, height, image.frame]),
    [[2, 3, 1], [4, 5, 2]]);
});

test('startup failure rejects a queued frame rather than returning an ordinary miss', async () => {
  const detectUrl = createDetectUrl(() => Promise.reject(new Error('decoder failed to start')));
  await assert.rejects(detectUrl(1, 1, {}), /decoder failed to start/);
});

test('worker entry sends early frames through the readiness wrapper', () => {
  const entry = readFileSync(new URL('../../app/scripts/qrworker.js', import.meta.url), 'utf8');
  assert.match(entry, /createDetectUrl\(getDetector\)/);
  assert.doesNotMatch(entry, /if\s*\(\s*detector\s*\)|return null/);
});
