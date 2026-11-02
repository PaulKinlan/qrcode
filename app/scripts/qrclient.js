import * as Comlink from 'comlink';

const worker = new Worker(new URL('./qrworker.js', import.meta.url), { type: 'module' });

// A module worker whose script fails to load or evaluate never posts a reply, so a Comlink
// call against it stays pending forever and the scan loop wedges on a promise that never
// settles (bead qrcode-sze). The Worker's 'error' event is the only signal such a failure
// produces: race every decode against it, and once the worker is dead fail fast instead of
// queueing calls that can never be answered.
let workerFailure = null;
const workerDied = new Promise((_, reject) => {
  worker.addEventListener('error', (event) => {
    workerFailure = new Error(`QR decoder worker failed: ${event.message ?? 'unknown error'}`);
    reject(workerFailure);
  });
});
// When no decode is in flight this rejection has no consumer; swallow it so it never surfaces
// as an unhandled rejection. Promise.race below still observes the original rejection.
workerDied.catch(() => {});

const proxy = Comlink.wrap(worker);

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
 *   failure or unreadable frame). Not called for an ordinary miss.
 * @returns {Promise<string|undefined>} Decoded payload, or undefined when no QR is found or
 *   decoding failed (onFailure distinguishes the two).
 */
export const decode = async function (context, onFailure) {
  try {
    if (workerFailure) throw workerFailure;
    let canvas = context.canvas;
    let width = canvas.width;
    let height = canvas.height;
    let imageData = context.getImageData(0, 0, width, height);
    return await Promise.race([proxy.detectUrl(width, height, imageData), workerDied]);
  } catch (err) {
    reportFailure(err);
    onFailure?.(err);
    return undefined;
  }
};
