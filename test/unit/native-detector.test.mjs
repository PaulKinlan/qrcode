import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeDetector } from '../../app/scripts/native-detector.js';

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
