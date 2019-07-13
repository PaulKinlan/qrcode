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

let detectUrl = async (width, height, imageData) => {
  return detector(width, height, imageData);
};

let detector = (async () => {
  if ('BarcodeDetector' in self && 'getSupportedFormats' in BarcodeDetector) {
    const formats = await BarcodeDetector.getSupportedFormats();
    if (formats.find(format => format === 'qr_code')) {
      return nativeDetector(new BarcodeDetector({formats: ['qr_code']}));
    }
  }
  
  return workerDetector;
})();

Comlink.expose({detectUrl}, self);
