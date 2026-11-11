// Unit tier: pins that CameraSource selects a camera by `facingMode` rather
// than relying solely on `deviceId` (bead qrcode-ios-selfie, issue #58).
//
// iOS Safari does not reliably expose stable deviceIds; selecting the selfie
// (front) camera by a `deviceId` constraint fails to open it. The fix requests
// the camera via `facingMode: { ideal: 'user' | 'environment' }` and keeps
// `deviceId` only as a best-effort hint. This test mocks navigator.mediaDevices
// and asserts the correct facingMode is sent for the rear (index 0) and front
// (index 1) cameras.
//
// Pure logic: no DOM, no browser, no network - it belongs in the fast tier.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CameraSource } from '../../app/scripts/components/camera/CameraSource.js';

function installNavigator(cameras) {
  let lastParams = null;
  const mediaDevices = {
    enumerateDevices: async () => cameras,
    getUserMedia: async (params) => {
      lastParams = params;
      return { getTracks: () => [] };
    },
  };
  const nav = { mediaDevices };
  try {
    globalThis.navigator = nav;
  } catch {
    Object.defineProperty(globalThis, 'navigator', {
      value: nav,
      configurable: true,
      writable: true,
    });
  }
  return {
    lastParams: () => lastParams,
    reset: () => {
      lastParams = null;
    },
  };
}

function fakeVideo() {
  return {
    addEventListener() {},
    load() {},
    async play() {},
    set srcObject(_v) {},
    videoWidth: 0,
    videoHeight: 0,
  };
}

test('rear camera (index 0) is requested with facingMode environment', async () => {
  const probe = installNavigator([
    { kind: 'videoinput', label: 'Back Camera', deviceId: 'rear-id' },
    { kind: 'videoinput', label: 'Front Camera', deviceId: 'front-id' },
  ]);
  const source = new CameraSource(fakeVideo());
  await source.getCameras();
  probe.reset();

  await source.setCamera(0);

  const params = probe.lastParams();
  assert.ok(params, 'getUserMedia should have been called');
  assert.equal(params.video.facingMode.ideal, 'environment');
  // deviceId is kept as a best-effort hint alongside facingMode
  assert.equal(params.video.deviceId.ideal, 'rear-id');
});

test('front camera (index 1) is requested with facingMode user', async () => {
  const probe = installNavigator([
    { kind: 'videoinput', label: 'Back Camera', deviceId: 'rear-id' },
    { kind: 'videoinput', label: 'Front Camera', deviceId: 'front-id' },
  ]);
  const source = new CameraSource(fakeVideo());
  await source.getCameras();
  probe.reset();

  await source.setCamera(1);

  const params = probe.lastParams();
  assert.ok(params, 'getUserMedia should have been called');
  assert.equal(params.video.facingMode.ideal, 'user');
  assert.equal(params.video.deviceId.ideal, 'front-id');
});

test('facingMode is used and empty deviceId omitted (iOS before permission)', async () => {
  const probe = installNavigator([
    { kind: 'videoinput', label: '', deviceId: '' },
    { kind: 'videoinput', label: '', deviceId: '' },
  ]);
  const source = new CameraSource(fakeVideo());
  await source.getCameras();
  probe.reset();

  // Both cameras enumerated with empty labels/ids (iOS pre-permission state).
  // The fix must still request a camera via facingMode and must NOT send an
  // empty deviceId, which is what breaks the selfie camera on iOS (issue #58).
  await source.setCamera(1);
  const params = probe.lastParams();
  assert.ok(params, 'getUserMedia should have been called');
  assert.equal(params.video.facingMode.ideal, 'user');
  assert.equal(params.video.deviceId, undefined, 'empty deviceId must be omitted');
});
