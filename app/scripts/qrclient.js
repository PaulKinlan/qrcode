import  * as Comlink from './comlink.js';

const qrProxy = Comlink.proxy(new Worker('/scripts/qrworker.js')); 

// Use the native API's
let nativeDetector = async (context) => {
  let barcodeDetector = new BarcodeDetector();
  let barcodes = await barcodeDetector.detect(context.canvas);
  // return the first barcode.
  if (barcodes.length > 0) {
    return barcodes[0].rawValue;
  }
};

// Use the polyfil
let workerDetector = async (context) => {
  let canvas = context.canvas;
  let imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  try {
    return await qrProxy.decode(canvas.width, canvas.height, imageData);
  } catch (err) {
    // the library throws an excpetion when there are no qrcodes.
    return;
  }
}

let detector = ('BarcodeDetector' in window) ? nativeDetector : workerDetector; 

export const decode = async function (context) {
  try {
    return await detector(context);
  } catch (err) {
    // There was an error fallback to worker;
    detector = workerDetector;
  }
};
