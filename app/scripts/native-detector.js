// Keep native QR detection and its failure fallback testable without a browser worker.
export function createNativeDetector(detectorInstance, fallback) {
  let useNative = true;
  return async (width, height, imageData) => {
    if (!useNative) return fallback(width, height, imageData);
    let barcodes;
    try {
      barcodes = await detectorInstance.detect(imageData);
    } catch (error) {
      // A failing native decoder should not be retried on every camera frame.
      useNative = false;
      return fallback(width, height, imageData);
    }
    // A native miss is only authoritative for this decoder, not for ZBar.
    return barcodes[0]?.rawValue ?? fallback(width, height, imageData);
  };
}
