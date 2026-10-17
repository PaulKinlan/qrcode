// Decoder fixture test: the ZBar WASM fallback, without a browser or a worker.
// The worker calls scanImageData() when BarcodeDetector is unavailable.
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

import { scanImageData } from '@undecaf/zbar-wasm';

const here = dirname(fileURLToPath(import.meta.url));
const fixtureUrl = join(here, '..', 'fixtures', 'qr-example-v2-L.json');

function loadFixture() {
  return JSON.parse(readFileSync(fixtureUrl, 'utf8'));
}

/**
 * Expand a module grid (with its quiet zone) into RGBA pixels, the shape scanImageData expects.
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
      // '1' = dark module. Grayscale RGB pixels preserve the fixture contrast.
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

test('WASM decoder returns the QR payload encoded in the fixture', async () => {
  const fixture = loadFixture();
  const symbols = await scanImageData(rasterise(fixture));
  assert.equal(symbols.find((symbol) => symbol.typeName === 'ZBAR_QRCODE')?.decode(), fixture.expected);
});

test('WASM decoder returns the same QR payload on repeated scans', async () => {
  const fixture = loadFixture();
  for (let i = 0; i < 2; i++) {
    const symbols = await scanImageData(rasterise(fixture));
    assert.equal(symbols.find((symbol) => symbol.typeName === 'ZBAR_QRCODE')?.decode(), fixture.expected);
  }
});

test('WASM decoder returns no symbols in a blank image', async () => {
  const size = 132;
  const blank = new Uint8ClampedArray(size * size * 4).fill(255);
  assert.deepEqual(await scanImageData({ width: size, height: size, data: blank }), []);
});
