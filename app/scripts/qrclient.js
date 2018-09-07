import  * as Comlink from './comlink.js';

const QRApi = Comlink.proxy(new Worker('/scripts/qrworker.js')); 

// Use the native API's
let nativeDetector = async () => {
  let barcodeDetector = new BarcodeDetector();
  let barcodes = await barcodeDetector.detect(context.canvas);
  // return the first barcode.
  if (barcodes.length > 0) {
    return barcodes[0].rawValue;
  }
};

// Use the polyfil
let workerDetector = async () => {
  var canvas = context.canvas;
  var imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  return await QRApi.detect(imageData);
}

let detector = ('BarcodeDetector' in window) ? nativeDetector : workerDetector; 

export const decode = async function (context) {
  try {
    return detector();
  } catch (err) {
    // There was an error fallback to worker;
    detector = workerDetector;
  }
};
