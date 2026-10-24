import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scanImageData } from '@undecaf/zbar-wasm';
import { createNativeDetector } from '../../app/scripts/native-detector.js';
import { createWorkerDetector } from '../../app/scripts/worker-detector.js';
import { getQrScanner } from '../../app/scripts/qr-scanner.js';

test('native detector failure returns the fallback result and switches future scans to fallback', async () => {
  const image = { width: 1, height: 1, data: new Uint8ClampedArray(4) };
  let nativeCalls = 0;
  let fallbackCalls = 0;
  const fallback = async (width, height, input) => {
    assert.equal(width, 1);
    assert.equal(height, 1);
    assert.equal(input, image);
    fallbackCalls++;
    return 'https://example.com/fallback';
  };
  const native = createNativeDetector({
    async detect(input) {
      assert.equal(input, image);
      nativeCalls++;
      throw new Error('native QR decoder failed');
    },
  }, fallback);

  assert.equal(await native(1, 1, image), 'https://example.com/fallback');
  assert.equal(await native(1, 1, image), 'https://example.com/fallback');
  assert.equal(nativeCalls, 1);
  assert.equal(fallbackCalls, 2);
});

test('native miss falls back for this frame without disabling native detection', async () => {
  const image = { width: 1, height: 1, data: new Uint8ClampedArray(4) };
  let nativeCalls = 0;
  let fallbackCalls = 0;
  const detect = createNativeDetector({
    async detect(input) {
      assert.equal(input, image);
      nativeCalls++;
      return nativeCalls === 1 ? [] : [{ rawValue: 'https://example.com/native' }];
    },
  }, async (width, height, input) => {
    assert.equal(width, 1);
    assert.equal(height, 1);
    assert.equal(input, image);
    fallbackCalls++;
    return 'https://example.com/zbar';
  });

  assert.equal(await detect(1, 1, image), 'https://example.com/zbar');
  assert.equal(await detect(1, 1, image), 'https://example.com/native');
  assert.equal(nativeCalls, 2);
  assert.equal(fallbackCalls, 1);
});

test('native miss passes a real QR frame through to the ZBar WASM decoder', async () => {
  const { rows, scale, modules, expected } = JSON.parse(readFileSync(
    new URL('../fixtures/qr-example-v2-L.json', import.meta.url), 'utf8'
  ));
  const width = modules * scale;
  const data = new Uint8ClampedArray(width * width * 4);
  for (let y = 0; y < width; y++) {
    for (let x = 0; x < width; x++) {
      const pixel = (y * width + x) * 4;
      const value = rows[Math.floor(y / scale)][Math.floor(x / scale)] === '1' ? 0 : 255;
      data[pixel] = data[pixel + 1] = data[pixel + 2] = value;
      data[pixel + 3] = 255;
    }
  }
  const image = { width, height: width, data };
  const detect = createNativeDetector({ async detect() { return []; } },
    createWorkerDetector(scanImageData, getQrScanner));
  assert.equal(await detect(width, width, image), expected);
});

test('native detector success returns its QR value without invoking the fallback', async () => {
  const image = { width: 1, height: 1, data: new Uint8ClampedArray(4) };
  let nativeCalls = 0;
  const detect = createNativeDetector({
    async detect(input) {
      assert.equal(input, image);
      nativeCalls++;
      return [{ rawValue: 'https://example.com/native' }];
    },
  }, () => { throw new Error('fallback should not run'); });

  assert.equal(await detect(1, 1, image), 'https://example.com/native');
  assert.equal(await detect(1, 1, image), 'https://example.com/native');
  assert.equal(nativeCalls, 2);
});
