import { WebCamManager } from './WebCamManager.js';
import { CameraFallbackManager } from './CameraFallbackManager.js';

/**
 * CameraManager - Main camera controller that handles canvas rendering
 * and coordinates between camera source and QR detection
 */
export class CameraManager {
  constructor(element) {
    this.element = element;
    this.debug = false;
    
    // Check if camera is available
    const hasCamera = this.checkCameraSupport();
    
    // Check for debug modes from URL hash
    if (location.hash === '#nogum') {
      this.hasCamera = false;
    } else {
      this.hasCamera = hasCamera;
    }
    
    if (location.hash === '#canvasdebug') {
      this.debug = true;
    }

    const root = document.getElementById(element);
    const cameraRoot = this.hasCamera 
      ? root.querySelector('.CameraRealtime')
      : root.querySelector('.CameraFallback');
    
    // Initialize appropriate source manager
    this.sourceManager = this.hasCamera
      ? new WebCamManager(cameraRoot)
      : new CameraFallbackManager(cameraRoot);

    if (this.debug) {
      root.classList.add('debug');
    }

    cameraRoot.classList.remove('hidden');

    // Set up canvas and overlay
    this.cameraCanvas = root.querySelector('.Camera-display');
    this.cameraOverlay = root.querySelector('.Camera-overlay');
    this.context = this.cameraCanvas.getContext('2d');

    // Canvas dimensions
    this.dWidth = null;
    this.dHeight = null;
    
    // Source position
    this.sx = 0;
    this.sy = 0;
    this.sHeight = null;
    this.sWidth = null;

    this.setupSourceManager();
    
    // Listen for window resize
    window.addEventListener('resize', () => this.resize());
    
    // Initial resize
    this.resize();
  }

  /**
   * Check if camera/getUserMedia is supported
   * Modernized - no more webkit/moz/ms prefix checks
   */
  checkCameraSupport() {
    return 'mediaDevices' in navigator 
      && 'getUserMedia' in navigator.mediaDevices;
  }

  setupSourceManager() {
    // Set up frame ready callback
    this.sourceManager.onframeready = (frameData) => {
      // Draw the frame to canvas
      this.context.drawImage(
        frameData, 
        this.sx, this.sy, this.sWidth, this.sHeight,
        0, 0, this.dWidth, this.dHeight
      );
      
      // Pass context to external callback
      if (this.onframe) {
        this.onframe(this.context);
      }
    };

    // Set up dimensions changed callback
    this.sourceManager.onDimensionsChanged = () => this.resize();
  }

  /**
   * Calculate overlay dimensions
   */
  getOverlayDimensions(width, height) {
    const minLength = Math.min(width, height);
    const paddingHeight = (height + 64 - minLength) / 2;
    const paddingWidth = (width + 64 - minLength) / 2;

    return {
      minLength: minLength,
      width: minLength - 64,
      height: minLength - 64,
      paddingHeight: paddingHeight,
      paddingWidth: paddingWidth
    };
  }

  /**
   * Draw the scanning overlay
   */
  drawOverlay(overlayDimensions) {
    this.cameraOverlay.style.borderTopWidth = overlayDimensions.paddingHeight + 'px';
    this.cameraOverlay.style.borderLeftWidth = overlayDimensions.paddingWidth + 'px';
    this.cameraOverlay.style.borderRightWidth = overlayDimensions.paddingWidth + 'px';
    this.cameraOverlay.style.borderBottomWidth = overlayDimensions.paddingHeight + 'px';
  }

  /**
   * Resize canvas and overlay to fit container
   */
  resize(containerWidth, containerHeight) {
    if (!containerWidth || !containerHeight) {
      const root = document.getElementById(this.element);
      containerWidth = root.parentNode.offsetWidth;
      containerHeight = root.parentNode.offsetHeight;
    }

    this.sourceManager.resize(containerWidth, containerHeight);
    const sourceDimensions = this.sourceManager.getDimensions();

    // Video source size
    const sourceHeight = sourceDimensions.height;
    const sourceWidth = sourceDimensions.width;

    // Target size in device coordinates
    const overlaySize = this.getOverlayDimensions(containerWidth, containerHeight);

    // The canvas should be the same size as the overlay in video size
    this.dHeight = this.dWidth = overlaySize.width / sourceDimensions.scaleFactor;

    // Set canvas dimensions
    this.cameraCanvas.width = this.dWidth;
    this.cameraCanvas.height = this.dWidth;

    // Calculate source crop (center of video)
    this.sx = (sourceWidth / 2) - (this.dWidth / 2);
    this.sy = (sourceHeight / 2) - (this.dHeight / 2);
    this.sWidth = this.dWidth;
    this.sHeight = this.dHeight;

    this.drawOverlay(overlaySize);
  }

  // Callback to be overridden
  onframe() {}
}
