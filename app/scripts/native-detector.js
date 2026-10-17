// Keep native QR detection and its failure fallback testable without a browser worker.
export function createNativeDetector(detectorInstance, fallback, onFailure) {
  return async (width, height, imageData) => {
    try {
      const barcodes = await detectorInstance.detect(imageData);
      return barcodes[0]?.rawValue;
    } catch (error) {
      onFailure();
      return fallback(width, height, imageData);
    }
  };
}
