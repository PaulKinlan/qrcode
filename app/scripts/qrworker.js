import * as Comlink from './comlink.js';
import {qrcode} from './qrcode.js';

// Use the native API's
let nativeDetector = (detectorInstance) => {
  return async (width, height, imageData) => {
    try {
      let barcodes = await detectorInstance.detect(imageData);
      // return the first barcode.
      if (barcodes.length > 0) {
        return barcodes[0].rawValue;
      }
    } catch(err) {
      detector = workerDetector;
    }
  };
};

// Use the polyfil
let workerDetector = async (width, height, imageData) => {
  try {
    return qrcode.decode(width, height, imageData);
  } catch (err) {
    // the library throws an excpetion when there are no qrcodes.
    return;
  }
}

const detectUrl = async (width, height, imageData) => {
  if (detector) {
    return await detector(width, height, imageData);
  }

  return null;
};

const getDetector = async () => {
  try {
    if ('BarcodeDetector' in self && 'getSupportedFormats' in BarcodeDetector) {
      const formats = await BarcodeDetector.getSupportedFormats();
      if (formats.find(format => format === 'qr_code')) {
        return nativeDetector(new BarcodeDetector({formats: ['qr_code']}));
      }
    }
  } catch (error) {
   // Fallback to worker detector;
   console.log(error);
  }
  
  return workerDetector;
};

let detector;
(async () => {
  detector = await getDetector();
})();

Comlink.expose({detectUrl}, self);
