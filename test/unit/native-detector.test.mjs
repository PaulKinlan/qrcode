import test from 'node:test';
import assert from 'node:assert/strict';
import { createNativeDetector } from '../../app/scripts/native-detector.js';

test('native detector failure returns the fallback result and switches future scans to fallback', async () => {
  const image = { width: 1, height: 1, data: new Uint8ClampedArray(4) };
  let nativeCalls = 0;
  let fallbackCalls = 0;
  let scan;
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
  }, fallback, () => { scan = fallback; });
  scan = native;

  assert.equal(await scan(1, 1, image), 'https://example.com/fallback');
  assert.equal(await scan(1, 1, image), 'https://example.com/fallback');
  assert.equal(nativeCalls, 1);
  assert.equal(fallbackCalls, 2);
});
