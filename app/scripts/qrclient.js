import * as Comlink from './comlink.js';

function getWorkerDetector() {
  const proxy = Comlink.proxy(new Worker('/scripts/qrworker.js'));
  return (width, height, imageData) => {
    return proxy.detectUrl(width, height, imageData);
  };
}

async function getNativeDetector() {
  try {
    const formats = await BarcodeDetector.getSupportedFormats();
    if (formats.find(format => format === 'qr_code')) {
      let detector = new BarcodeDetector({formats: ['qr_code']});
      return async (width, height, imageData) => {
        try {
          const barcodes = await detector.detect(imageData);
          if (barcodes.length > 0)
            return barcodes[0].rawValue;
        } catch (e) {
          console.log("Error detecting barcode, falling back to polyfill.");
          detect = getWorkerDetector();
          return detect(width, height, imageData);
        }
      }
    } else {
      console.log("QR codes not supported, falling back to polyfill.");
    }
  } catch (e) {
    console.log("Error during feature detection, falling back to polyfill.");
  }
  return getWorkerDetector();
}

let detect = async (width, height, imageData) => {
  detect = await getNativeDetector();
  return detect(width, height, imageData);
}

export const decode = async function (context) {
  try {
    let canvas = context.canvas;
    let width = canvas.width;
    let height = canvas.height;
    let imageData = context.getImageData(0, 0, width, height);
    return await detect(width, height, imageData);
  } catch (err) {
    console.log(err);
  }
};
