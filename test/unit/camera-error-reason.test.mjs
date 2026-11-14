import test from 'node:test';
import assert from 'node:assert/strict';

// qrclient creates a Worker at module import; these failure paths never start it.
globalThis.Worker = class {
  addEventListener() {}
  removeEventListener() {}
  postMessage() {}
};
const { QRCodeCamera } = await import('../../app/scripts/components/QRCodeCamera.js');
delete globalThis.Worker;

const MARKUP_TEXT = 'Scanning failed. Please try again.';

/**
 * A coordinator wired to stubbed collaborators, the shape
 * test/unit/camera-upload-error-wiring.test.mjs uses: the alert and the camera manager are
 * injected, so the assertions are about what the coordinator does with a failure reason.
 */
function setup({ withAlert = true } = {}) {
  const alert = { hidden: true, textContent: MARKUP_TEXT };
  const camera = Object.create(QRCodeCamera.prototype);
  camera.cameraManager = { onFailure: null, onframe: null };
  camera.qrCodeManager = { root: { open: false }, detectQRCode: async () => undefined };
  camera.scanError = withAlert ? alert : null;
  camera.setupCameraCallback();
  return { camera, alert };
}

test('a source failure reason replaces the generic alert text', () => {
  const { camera, alert } = setup();
  camera.cameraManager.onFailure(new Error('Choose an image no larger than 40 megapixels.'));
  assert.equal(alert.hidden, false);
  assert.equal(alert.textContent, 'Choose an image no larger than 40 megapixels.',
    'the actionable reason is what the user reads, not "try again"');
});

test('a failure without a reason falls back to the markup text, not a stale reason', () => {
  const { camera, alert } = setup();
  camera.cameraManager.onFailure(new Error('Choose an image smaller than 10 MiB.'));
  // A camera fault with no message must not leave the previous upload rejection on screen.
  camera.cameraManager.onFailure();
  assert.equal(alert.hidden, false);
  assert.equal(alert.textContent, MARKUP_TEXT);
});

test('a decode failure after a reason also restores the markup text', async () => {
  const { camera, alert } = setup();
  camera.cameraManager.onFailure(new Error('Choose a supported image file.'));
  camera.qrCodeManager.detectQRCode = async (context, onFailure) => {
    onFailure();
    return undefined;
  };
  await camera.cameraManager.onframe({});
  assert.equal(alert.hidden, false);
  assert.equal(alert.textContent, MARKUP_TEXT);
});

test('a decode failure on its own keeps the markup text', async () => {
  const { camera, alert } = setup();
  camera.qrCodeManager.detectQRCode = async (context, onFailure) => {
    onFailure();
    return undefined;
  };
  await camera.cameraManager.onframe({});
  assert.equal(alert.hidden, false);
  assert.equal(alert.textContent, MARKUP_TEXT);
});

test('a failure reason is shown as text, never as markup', () => {
  const { camera, alert } = setup();
  const reason = 'Choose an image <img src=x onerror=alert(1)> no larger than 40 megapixels.';
  camera.cameraManager.onFailure(new Error(reason));
  assert.equal(alert.textContent, reason, 'the reason is assigned verbatim as text content');
});

test('pages without the optional #camera-error element do not throw on a failure', () => {
  const { camera } = setup({ withAlert: false });
  assert.doesNotThrow(() => camera.cameraManager.onFailure(new Error('anything')));
});
