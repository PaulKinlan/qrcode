import * as Comlink from 'comlink';
import { createNativeDetector } from './native-detector.js';
import { scanImageData, setModuleArgs } from '@undecaf/zbar-wasm';
import wasmUrl from '@undecaf/zbar-wasm/dist/zbar.wasm?url';

// Keep the binary separate from the worker bundle so the SW can precache it offline.
setModuleArgs({ locateFile: () => wasmUrl });

// Scan only QR symbols: other barcode formats must not become navigable URLs.
let workerDetector = async (width, height, imageData) => {
  const symbols = await scanImageData(imageData);
  return symbols.find((symbol) => symbol.typeName === 'ZBAR_QRCODE')?.decode();
};

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
        return createNativeDetector(
          new BarcodeDetector({formats: ['qr_code']}),
          workerDetector,
          () => { detector = workerDetector; }
        );
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
