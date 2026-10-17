// Keep the WASM scan path importable without Vite's worker-only ?url loader.
export function createWorkerDetector(scanImageData, getQrScanner) {
  return async (width, height, imageData) => {
    const symbols = await scanImageData(imageData, await getQrScanner());
    return symbols.find((symbol) => symbol.typeName === 'ZBAR_QRCODE')?.decode();
  };
}
