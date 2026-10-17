// Keep native QR detection and its failure fallback testable without a browser worker.
export function createNativeDetector(detectorInstance, fallback) {
  let useNative = true;
  return async (width, height, imageData) => {
    if (!useNative) return fallback(width, height, imageData);
    try {
      const barcodes = await detectorInstance.detect(imageData);
      return barcodes[0]?.rawValue;
    } catch (error) {
      // A failing native decoder should not be retried on every camera frame.
      useNative = false;
      return fallback(width, height, imageData);
    }
  };
}
