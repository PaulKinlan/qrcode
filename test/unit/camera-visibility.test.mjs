import test from 'node:test';
import assert from 'node:assert/strict';
import { WebCamManager } from '../../app/scripts/components/camera/WebCamManager.js';

const settle = () => new Promise((resolve) => setImmediate(resolve));

function cameraEnvironment(initialVisibility, { enumerate, acquire } = {}) {
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const listeners = new Map();
  const counts = { enumerate: 0, acquire: 0, streams: [] };
  const document = {
    visibilityState: initialVisibility,
    addEventListener(type, fn) { listeners.set(type, fn); },
  };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: document });
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { mediaDevices: {
      async enumerateDevices() {
        counts.enumerate++;
        return enumerate ? enumerate() : [{ kind: 'videoinput', deviceId: 'camera', label: 'rear' }];
      },
      async getUserMedia() {
        counts.acquire++;
        if (acquire) return acquire();
        const track = { stopped: false, stop() { this.stopped = true; } };
        const stream = { getTracks: () => [track], track };
        counts.streams.push(stream);
        return stream;
      },
    } },
  });
  const video = { srcObject: null, addEventListener() {}, load() {}, async play() {} };
  const toggle = { style: {} };
  const input = { checked: false, addEventListener() {} };
  const root = { querySelector(selector) {
    return { '.Camera-video': video, '.Camera-toggle': toggle, '.Camera-toggle-input': input }[selector];
  } };
  return {
    counts, document, video,
    create() { return new WebCamManager(root); },
    visibility(value) { document.visibilityState = value; listeners.get('visibilitychange')(); },
    restore() {
      if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument);
      else delete globalThis.document;
      if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator);
      else delete globalThis.navigator;
    },
  };
}

test('initially hidden page does not enumerate devices or acquire a camera until visible', async () => {
  const env = cameraEnvironment('hidden');
  try {
    env.create();
    await settle();
    assert.deepEqual([env.counts.enumerate, env.counts.acquire], [0, 0]);
    assert.equal(env.video.srcObject, null);
    env.visibility('visible');
    await settle();
    assert.deepEqual([env.counts.enumerate, env.counts.acquire], [1, 1]);
    assert.equal(env.video.srcObject, env.counts.streams[0]);
    env.visibility('visible');
    await settle();
    assert.equal(env.counts.acquire, 1, 'a duplicate visible event must not reacquire the same camera');
  } finally { env.restore(); }
});

test('visible-at-load page still starts once, and a later hide stops its track', async () => {
  const env = cameraEnvironment('visible');
  try {
    env.create();
    await settle();
    assert.deepEqual([env.counts.enumerate, env.counts.acquire], [1, 1]);
    env.visibility('hidden');
    assert.equal(env.counts.streams[0].track.stopped, true);
    env.visibility('visible');
    await settle();
    assert.equal(env.counts.acquire, 2, 'resuming after stop is a new acquisition');
  } finally { env.restore(); }
});

test('visibility flaps during enumeration start at most one camera when visible', async () => {
  let finishEnumeration;
  const env = cameraEnvironment('hidden', { enumerate: () => new Promise((resolve) => {
    finishEnumeration = resolve;
  }) });
  try {
    env.create();
    env.visibility('visible');
    env.visibility('hidden');
    env.visibility('visible');
    assert.equal(env.counts.enumerate, 1);
    finishEnumeration([{ kind: 'videoinput', deviceId: 'camera', label: 'rear' }]);
    await settle();
    assert.equal(env.counts.acquire, 1);
  } finally { env.restore(); }
});

test('enumeration completing while hidden waits until the next visible event', async () => {
  let finishEnumeration;
  const env = cameraEnvironment('visible', { enumerate: () => new Promise((resolve) => {
    finishEnumeration = resolve;
  }) });
  try {
    env.create();
    env.visibility('hidden');
    finishEnumeration([{ kind: 'videoinput', deviceId: 'camera', label: 'rear' }]);
    await settle();
    assert.equal(env.counts.acquire, 0);
    env.visibility('visible');
    await settle();
    assert.deepEqual([env.counts.enumerate, env.counts.acquire], [1, 1]);
  } finally { env.restore(); }
});

test('hiding while getUserMedia is pending stops the stream when it resolves', async () => {
  let finishAcquisition;
  const track = { stopped: false, stop() { this.stopped = true; } };
  const stream = { getTracks: () => [track] };
  const env = cameraEnvironment('visible', { acquire: () => new Promise((resolve) => {
    finishAcquisition = resolve;
  }) });
  try {
    env.create();
    await settle();
    assert.equal(env.counts.acquire, 1);
    env.visibility('hidden');
    finishAcquisition(stream);
    await settle();
    assert.equal(track.stopped, true, 'hidden tab must not retain a late camera stream');
  } finally { env.restore(); }
});
