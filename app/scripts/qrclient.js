import * as Comlink from 'comlink';

// A decode that never settles is indistinguishable from a slow one until it is bounded (bead
// qrcode-g4y): a WASM decode stuck in a loop on a hostile/corrupt frame, or a Comlink reply that
// is never posted, leaves the race pending for ever. The scan loop awaits decode() before it
// schedules the next frame, so the whole scan stops - no error, no onFailure, no console trail,
// no recovery short of a reload. The frames this app decodes are at most a few hundred pixels
// square (CameraManager.dWidth), so a few hundred milliseconds is already many times a healthy
// decode; past that the frame is not coming back.
export const DECODE_TIMEOUT_MS = 500;

// One timed-out decode can be a slow phone. Several in a row means the worker itself is wedged -
// a WASM instance stuck in a loop never answers again, which is a dead worker in practice - and
// only terminating and re-creating it restores scanning.
export const MAX_CONSECUTIVE_DECODE_TIMEOUTS = 3;

let worker;
let proxy;
let workerFailure = null;
let workerDied;
let consecutiveTimeouts = 0;

/**
 * Create the decoder worker and the promise that settles when that worker dies.
 */
const startWorker = () => {
  worker = new Worker(new URL('./qrworker.js', import.meta.url), { type: 'module' });
  workerFailure = null;
  // A module worker whose script fails to load or evaluate never posts a reply, so a Comlink
  // call against it stays pending forever and the scan loop wedges on a promise that never
  // settles (bead qrcode-sze). The Worker's 'error' event is the only signal such a failure
  // produces: race every decode against it, and once the worker is dead fail fast instead of
  // queueing calls that can never be answered.
  workerDied = new Promise((_, reject) => {
    worker.addEventListener('error', (event) => {
      workerFailure = new Error(`QR decoder worker failed: ${event.message ?? 'unknown error'}`);
      reject(workerFailure);
    });
  });
  // When no decode is in flight this rejection has no consumer; swallow it so it never surfaces
  // as an unhandled rejection. Promise.race in decode() still observes the original rejection.
  workerDied.catch(() => {});
  proxy = Comlink.wrap(worker);
};

/**
 * Replace a wedged decoder worker. Its pending Comlink call can never be answered, so the only
 * way back to a working decoder is a fresh worker.
 */
const restartWorker = () => {
  consecutiveTimeouts = 0;
  try {
    worker.terminate();
  } catch {
    // Already gone: nothing to release.
  }
  try {
    startWorker();
  } catch (err) {
    // No replacement could be created, so the decoder is gone for this page load. Fail fast from
    // here on: a decode that hangs is exactly the bug this whole path exists to prevent.
    workerFailure = err instanceof Error ? err : new Error(`QR decoder worker unavailable: ${err}`);
  }
};

startWorker();

// A failed decode is surfaced in the UI through onFailure, but it also has to leave a trail in
// devtools (bead qrcode-krv): without one, a dead worker, a failed wasm load and an unreadable
// canvas look identical to an ordinary "no QR here" miss. The scan loop calls decode() once per
// animation frame, so an unchanged failure would print up to 60 identical lines a second; report
// each DISTINCT failure once and count the repeats instead of repeating the line.
let reportedFailure = null;
let suppressedRepeats = 0;

const reportFailure = (err) => {
  const key = `${err?.name ?? 'Error'}: ${err?.message ?? String(err)}`;
  if (key === reportedFailure) {
    suppressedRepeats += 1;
    return;
  }
  if (reportedFailure !== null && suppressedRepeats > 0) {
    console.warn(`QR decoder: ${suppressedRepeats} further identical failure(s) suppressed`);
  }
  console.warn('QR decoder failure:', err);
  reportedFailure = key;
  suppressedRepeats = 0;
};

/**
 * Decode a camera frame.
 * @param {CanvasRenderingContext2D} context - Canvas context with the frame to scan
 * @param {(error: Error) => void} [onFailure] - Called when decoding itself fails (worker
 *   failure, decode timeout or unreadable frame). Not called for an ordinary miss.
 * @returns {Promise<string|undefined>} Decoded payload, or undefined when no QR is found or
 *   decoding failed (onFailure distinguishes the two).
 */
export const decode = async function (context, onFailure) {
  let timer = null;
  try {
    if (workerFailure) throw workerFailure;
    const canvas = context.canvas;
    const width = canvas.width;
    const height = canvas.height;
    const imageData = context.getImageData(0, 0, width, height);
    // Capture this call's worker-death signal: a restart below replaces workerDied, and this call
    // belongs to the worker it was sent to.
    const died = workerDied;
    const timedOut = new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(new DOMException('QR decode timed out', 'TimeoutError')),
        DECODE_TIMEOUT_MS,
      );
    });
    const result = await Promise.race([proxy.detectUrl(width, height, imageData), died, timedOut]);
    consecutiveTimeouts = 0;
    return result;
  } catch (err) {
    if (err?.name === 'TimeoutError') {
      consecutiveTimeouts += 1;
      if (consecutiveTimeouts >= MAX_CONSECUTIVE_DECODE_TIMEOUTS) restartWorker();
    } else {
      consecutiveTimeouts = 0;
    }
    reportFailure(err);
    onFailure?.(err);
    return undefined;
  } finally {
    // A settled decode must not leave its timer behind: the scan loop decodes up to 60 times a
    // second, so an uncleared timeout per frame would be a steady leak of pending timers.
    if (timer !== null) clearTimeout(timer);
  }
};
