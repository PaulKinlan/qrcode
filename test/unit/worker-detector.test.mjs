import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scanImageData } from '@undecaf/zbar-wasm';
import { getQrScanner } from '../../app/scripts/qr-scanner.js';
import { createWorkerDetector } from '../../app/scripts/worker-detector.js';

const fixture = JSON.parse(readFileSync(new URL('../fixtures/ean13-negative-control.json', import.meta.url), 'utf8'));

test('the worker entry wires its real scan and QR-only scanner into the tested detector', () => {
  const entry = readFileSync(new URL('../../app/scripts/qrworker.js', import.meta.url), 'utf8');
  assert.match(entry, /import\s*\{\s*createWorkerDetector\s*\}\s*from\s*['"]\.\/worker-detector\.js['"]/);
  assert.match(entry, /createWorkerDetector\(scanImageData,\s*getQrScanner\)/);
});

function barcodeImage({ bars, scale, height, quietModules }) {
  const width = (bars.length + quietModules * 2) * scale;
  const data = new Uint8ClampedArray(width * height * 4).fill(255);
  for (let x = 0; x < bars.length; x++) {
    if (bars[x] !== '1') continue;
    for (let dx = 0; dx < scale; dx++) {
      for (let y = 5; y < height - 5; y++) {
        const pixel = (y * width + (quietModules + x) * scale + dx) * 4;
        data[pixel] = data[pixel + 1] = data[pixel + 2] = 0;
      }
    }
  }
  return { width, height, data };
}

test('worker fallback passes the QR-only scanner to ZBar for non-QR frames', async () => {
  const image = barcodeImage(fixture);
  // Prove this is a live negative control: an unconfigured scan actually detects the barcode.
  assert.equal((await scanImageData(image)).find(s => s.typeName === 'ZBAR_EAN13')?.decode(), fixture.expected);

  const scanner = await getQrScanner();
  const calls = [];
  const detector = createWorkerDetector(async (frame, configuredScanner) => {
    calls.push({ frame, configuredScanner });
    // The scanner itself is validated against this fixture in decoder.test.mjs.
    // Do not scan the same image twice with ZBar's implicit shared default scanner.
    return [];
  }, getQrScanner);

  assert.equal(await detector(image.width, image.height, image), undefined);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].frame, image);
  assert.ok(calls[0].configuredScanner === scanner, 'worker must pass its QR-only scanner, not the default scanner');
});
