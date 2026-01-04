/**
 * CameraFallbackManager - Handles QR code scanning from uploaded images
 * Used when camera access is not available
 */
export class CameraFallbackManager {
  constructor(element) {
    this.element = element;
    this.uploadForm = element.querySelector('.CameraFallback-form');
    this.inputElement = element.querySelector('.CameraFallback-input');
    this.image = new Image();

    this.setupEventListeners();
  }

  setupEventListeners() {
    // Prevent form submission
    this.uploadForm.addEventListener('submit', (e) => {
      e.preventDefault();
      return false;
    });

    // Handle image file selection
    this.inputElement.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        const objectURL = URL.createObjectURL(e.target.files[0]);
        
        this.image.onload = () => {
          this.onDimensionsChanged();
          this.onframeready(this.image);
          URL.revokeObjectURL(objectURL);
        };

        this.image.src = objectURL;
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

  // Callback methods to be overridden
  onDimensionsChanged() {}
  onframeready() {}
}
