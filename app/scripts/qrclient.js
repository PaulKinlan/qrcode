import * as Comlink from 'comlink';

const proxy = Comlink.wrap(new Worker(new URL('./qrworker.js', import.meta.url), { type: 'module' }));

/**
 * A failure in the decode pipeline itself: the worker could not be reached, the Comlink call
 * rejected, or the frame could not be read. It is deliberately NOT the same thing as a miss.
 * @see decode
 */
export class DecodeError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'DecodeError';
  }
}

/**
 * Build a decoder around a worker proxy.
 *
 * The contract callers depend on (bead qrcode-8iz): `undefined` means the decoder ran and found
 * no QR code in the frame, and nothing else does. A broken decoder throws a DecodeError, so a
 * decoder that never works can no longer look like a camera pointed at an empty wall.
 *
 * @param {() => {detectUrl: Function}} getProxy - Supplies the Comlink worker proxy.
 * @returns {(context: CanvasRenderingContext2D) => Promise<string|undefined>}
 */
export function createDecoder(getProxy) {
  return async function decode(context) {
    let width;
    let height;
    let imageData;

    try {
      const canvas = context.canvas;
      width = canvas.width;
      height = canvas.height;
      imageData = context.getImageData(0, 0, width, height);
    } catch (err) {
      throw new DecodeError('Could not read the camera frame for decoding.', { cause: err });
    }

    let found;

    try {
      found = await getProxy().detectUrl(width, height, imageData);
    } catch (err) {
      throw new DecodeError('The QR decoder worker failed.', { cause: err });
    }

    // `null` comes back while the worker is still choosing a detector: nothing decoded yet, not
    // a failure. Only a real payload is a hit.
    return found ?? undefined;
  };
}

export const decode = createDecoder(() => proxy);
