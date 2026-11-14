/**
 * Uploads whose decoded bitmap exceeds this many natural pixels are rejected on the image's
 * `load` event. Setting `src` has already started the browser decode by then, so this bounds the
 * pixels handed to the canvas and ZBar, not the decode allocation itself - the 10 MiB file cap is
 * the only pre-decode control (THREAT_MODEL.md §6, invariant 11).
 */
export const MAX_UPLOAD_PIXELS = 40_000_000;

const MAX_UPLOAD_MEGAPIXELS = MAX_UPLOAD_PIXELS / 1_000_000;

/**
 * CameraFallbackManager - Handles QR code scanning from uploaded images
 * Used when camera access is not available
 */
export class CameraFallbackManager {
  constructor(element) {
    this.element = element;
    this.inputElement = element.querySelector('.CameraFallback-input');
    this.image = new Image();
    this.pendingObjectURL = null;

    this.setupEventListeners();
  }

  setupEventListeners() {
    // Handle image file selection
    this.inputElement.addEventListener('change', (e) => {
      // A new choice supersedes any decode still in progress.
      this.image.onload = this.image.onerror = null;
      if (this.pendingObjectURL) {
        URL.revokeObjectURL(this.pendingObjectURL);
        this.pendingObjectURL = null;
      }

      const file = e.target.files?.[0];
      // Re-arm the control even when decoding fails, so choosing the same file retries.
      e.target.value = '';
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        this.reportFailure(new Error('Choose a supported image file.'));
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        this.reportFailure(new Error('Choose an image smaller than 10 MiB.'));
        return;
      }

      try {
        const objectURL = URL.createObjectURL(file);
        this.pendingObjectURL = objectURL;
        const settle = () => {
          if (this.pendingObjectURL !== objectURL) return false;
          this.pendingObjectURL = null;
          this.image.onload = this.image.onerror = null;
          URL.revokeObjectURL(objectURL);
          return true;
        };
        this.image.onload = () => {
          if (!settle()) return;
          if (this.image.naturalWidth * this.image.naturalHeight > MAX_UPLOAD_PIXELS) {
            this.reportFailure(
              new Error(`Choose an image no larger than ${MAX_UPLOAD_MEGAPIXELS} megapixels.`),
            );
            return;
          }
          this.onDimensionsChanged();
          this.onframeready(this.image);
        };
        this.image.onerror = () => {
          if (settle()) this.reportFailure(new Error('Unable to load the selected image.'));
        };
        this.image.src = objectURL;
      } catch (error) {
        if (this.pendingObjectURL) {
          URL.revokeObjectURL(this.pendingObjectURL);
          this.pendingObjectURL = null;
        }
        this.image.onload = this.image.onerror = null;
        this.reportFailure(error);
      }
    });
  }

  /**
   * Get image dimensions
   * @returns {Object} Width, height, and scale factor
   */
  getDimensions() {
    return {
      width: this.image.naturalWidth,
      height: this.image.naturalHeight,
      scaleFactor: 1
    };
  }

  // No-op methods for API compatibility with CameraSource
  resize() {}

  reportFailure(error) {
    console.error('Camera upload failed:', error);
    this.onFailure(error);
  }

  // Callback methods to be overridden
  onDimensionsChanged() {}
  onframeready() {}
  onFailure() {}
}
