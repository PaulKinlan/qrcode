// Keep incoming frames pending until the decoder is initialized; null is an ordinary QR miss,
// not a safe answer for an early request while native support/WASM is still loading.
export function createDetectUrl(getDetector) {
  // TODO(baseline/top-level-await): Await initialization at worker module scope after the
  // worker build target supports top-level await; remove this readiness-promise wrapper.
  const detectorReady = getDetector();
  // Avoid an unhandled rejection if startup fails before the first frame arrives. A call still
  // observes the original rejection so the client reports an error, not a false QR miss.
  detectorReady.catch(() => {});
  return async (width, height, imageData) => {
    const detector = await detectorReady;
    return detector(width, height, imageData);
  };
}
