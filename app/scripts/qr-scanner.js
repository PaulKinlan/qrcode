import { ZBarConfigType, ZBarScanner, ZBarSymbolType } from '@undecaf/zbar-wasm';

// A worker reuses one scanner; ZBar loads on the first native miss and scans every missed frame.
// This costs an extra decode per miss, but lets ZBar recover QR codes the native decoder misses.
let scannerPromise;

export function getQrScanner() {
  return scannerPromise ??= ZBarScanner.create().then((scanner) => {
    scanner.setConfig(ZBarSymbolType.ZBAR_NONE, ZBarConfigType.ZBAR_CFG_ENABLE, 0);
    scanner.setConfig(ZBarSymbolType.ZBAR_QRCODE, ZBarConfigType.ZBAR_CFG_ENABLE, 1);
    // Match ZBar's default scanner: preserve UTF-8 QR payload bytes instead of transcoding them.
    scanner.setConfig(ZBarSymbolType.ZBAR_NONE, ZBarConfigType.ZBAR_CFG_BINARY, 1);
    return scanner;
  }).catch((error) => {
    scannerPromise = undefined;
    throw error;
  });
}
