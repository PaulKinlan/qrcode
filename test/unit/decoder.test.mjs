// Decoder fixture test: the real qrcode-lib decode path, without a browser or a worker.
//
// qrworker.js is thin glue around qrcode.decode(width, height, imageData), and qrcode.decode()
// is the polyfill that ships when BarcodeDetector is missing (Firefox/Safari) - so it is the
// path most users actually exercise. It was completely untested.
//
// The fixture (test/fixtures/qr-example-v2-L.json) is a fixed QR module grid, not an image:
//   - reviewable in a diff (no opaque PNG, no binary blob),
//   - no image decoder dependency in the test (node:test + node:fs only),
//   - rasterised here into the same {width, height, data} shape the worker is handed
//     (getImageData() output: RGBA, 4 bytes per pixel, 0 = black).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { qrcode } from '../../app/scripts/qrcode-lib.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixtureUrl = join(here, '..', 'fixtures', 'qr-example-v2-L.json');

function loadFixture() {
  return JSON.parse(readFileSync(fixtureUrl, 'utf8'));
}

/**
 * Expand a module grid (with its quiet zone) into RGBA pixels, the shape qrcode.decode expects.
 * @param {{rows: string[], scale: number, modules: number}} fixture
 * @returns {{width: number, height: number, data: Uint8ClampedArray}}
 */
function rasterise({ rows, scale, modules }) {
  assert.equal(rows.length, modules, 'fixture must have `modules` rows');
  const width = modules * scale;
  const data = new Uint8ClampedArray(width * width * 4);
  for (let y = 0; y < width; y++) {
    const row = rows[Math.floor(y / scale)];
    assert.equal(row.length, modules, 'every fixture row must be `modules` wide');
    for (let x = 0; x < width; x++) {
      // '1' = dark module. getPixel() weighs R/G/B, so grey-scale is enough.
      const value = row[Math.floor(x / scale)] === '1' ? 0 : 255;
      const i = (y * width + x) * 4;
      data[i] = value;
      data[i + 1] = value;
      data[i + 2] = value;
      data[i + 3] = 255;
    }
  }
  return { width, height: width, data };
}

test('decoder returns the payload encoded in the fixture QR', () => {
  const fixture = loadFixture();
  const image = rasterise(fixture);
  // A fresh copy: qrcode.decode() writes sampled pixels back into imageData.
  const decoded = qrcode.decode(image.width, image.height, {
    width: image.width,
    height: image.height,
    data: new Uint8ClampedArray(image.data),
  });
  assert.equal(decoded, fixture.expected);
});

test('decoder is repeatable: a second call on the same fixture decodes identically', () => {
  const fixture = loadFixture();
  const image = rasterise(fixture);
  const decode = () =>
    qrcode.decode(image.width, image.height, {
      width: image.width,
      height: image.height,
      data: new Uint8ClampedArray(image.data),
    });
  // qrcode keeps width/height/imageData on a module-level singleton, so interleaved calls
  // are exactly the case that used to leak state between scans.
  assert.equal(decode(), fixture.expected);
  assert.equal(decode(), fixture.expected);
});

test('decoder reports no QR code in a blank image by throwing', () => {
  // qrworker.js relies on this throwing (its catch is what returns `undefined` to the caller),
  // so the empty-result contract is part of the polyfill's behaviour, not an accident.
  const size = 132;
  const blank = new Uint8ClampedArray(size * size * 4).fill(255);
  assert.throws(() => qrcode.decode(size, size, { width: size, height: size, data: blank }));
});
