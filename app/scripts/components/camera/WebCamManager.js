import { CameraSource } from './CameraSource.js';

/**
 * WebCamManager - Manages real-time webcam access and camera switching
 */
export class WebCamManager {
  constructor(cameraRoot) {
    this.cameraRoot = cameraRoot;
    this.width = null;
    this.height = null;
    
    this.cameraToggleInput = cameraRoot.querySelector('.Camera-toggle-input');
    this.cameraToggle = cameraRoot.querySelector('.Camera-toggle');
    this.cameraVideo = cameraRoot.querySelector('.Camera-video');
    
    this.source = new CameraSource(this.cameraVideo);
    
    this.setupEventListeners();
    this.initializeCamera();
  }

  setupEventListeners() {
    // Handle camera toggle switch
    this.cameraToggleInput.addEventListener('change', (e) => {
      const cameraIdx = e.target.checked ? 1 : 0;
      this.source.stop();
      this.source.setCamera(cameraIdx);
    });

    // Stop camera when page becomes hidden, restart when visible
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.stop();
      } else {
        this.start();
      }
    });
  }

  async initializeCamera() {
    // Set up source callbacks
    this.source.onDimensionsChanged = () => {
      this.onDimensionsChanged();
      this.resize();
    };

    this.source.onframeready = (imageData) => {
      this.onframeready(imageData);
    };

    // Get available cameras
    await this.source.getCameras((cameras) => {
      if (cameras.length <= 1) {
        // Hide camera toggle if only one camera
        this.cameraToggle.style.display = 'none';
      }
      
      // Start with first camera
      this.source.setCamera(0);
    });
  }

  /**
   * Resize video display
   * @param {number} w - Container width
   * @param {number} h - Container height
   */
  resize(w, h) {
    if (w && h) {
      this.width = w;
      this.height = h;
    }

    if (!this.width || !this.height) {
      return;
    }

    const videoDimensions = this.getDimensions();
    this.cameraVideo.style.transform = 
      `translate(-50%, -50%) scale(${videoDimensions.scaleFactor})`;
  }

  /**
   * Get video dimensions with scale factor
   * @returns {Object} Width, height, and scale factor
   */
  getDimensions() {
    const dimensions = this.source.getDimensions();
    const heightRatio = dimensions.height / this.height;
    const widthRatio = dimensions.width / this.width;
    const scaleFactor = 1 / Math.min(heightRatio, widthRatio);
    
    dimensions.scaleFactor = Number.isFinite(scaleFactor) ? scaleFactor : 1;
    return dimensions;
  }

  /**
   * Stop the camera
   */
  stop() {
    this.source.stop();
  }

  /**
   * Start the camera
   */
  start() {
    const cameraIdx = this.cameraToggleInput.checked ? 1 : 0;
    this.source.setCamera(cameraIdx);
  }

  // Callback methods to be overridden
  onDimensionsChanged() {}
  onframeready() {}
}
