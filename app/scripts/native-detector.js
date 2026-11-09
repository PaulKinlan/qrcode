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
    if (!Array.isArray(barcodes)) {
      // A malformed native result is a decoder failure, not a reason to lose every frame.
      useNative = false;
      return fallback(width, height, imageData);
    }
    // The constructor requests QR only, but do not trust a decoder returning another format.
    // A native QR miss is only authoritative for this decoder, not for ZBar.
    return barcodes.find((barcode) => barcode?.format === 'qr_code')?.rawValue
      ?? fallback(width, height, imageData);
  };
}
