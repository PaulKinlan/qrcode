import { ZBarConfigType, ZBarScanner, ZBarSymbolType } from '@undecaf/zbar-wasm';

// A worker owns one scanner for its lifetime; avoid loading WASM when native QR detection works.
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
