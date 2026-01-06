/**
 * CameraSource - Manages camera access and video streaming
 * Modernized to use only standard getUserMedia APIs (no deprecated prefixes)
 */
export class CameraSource {
  constructor(videoElement) {
    this.videoElement = videoElement;
    this.stream = null;
    this.animationFrameId = null;
    this.cameras = null;
    this.currentCamera = -1;

    // Modern API check - no more webkit/moz/ms prefixes needed in 2026
    this.hasMediaDevices =
      "mediaDevices" in navigator &&
      "enumerateDevices" in navigator.mediaDevices &&
      "getUserMedia" in navigator.mediaDevices;
  }

  /**
   * Get list of available video input devices (cameras)
   * @param {Function} cb - Callback function to receive camera list
   */
  async getCameras(cb) {
    cb = cb || function () {};

    if (!this.hasMediaDevices) {
      // No camera support
      this.cameras = [];
      cb(this.cameras);
      return;
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(
        (device) => device.kind === "videoinput"
      );

      this.cameras = [];
      videoDevices.forEach((device) => {
        // Prefer rear/environment facing cameras (better for QR scanning)
        if (
          device.label.toLowerCase().includes("back") ||
          device.label.toLowerCase().includes("rear") ||
          device.label.toLowerCase().includes("environment")
        ) {
          // Move rear-facing cameras to the front of the list
          this.cameras.unshift(device);
        } else {
          this.cameras.push(device);
        }
      });

      cb(this.cameras);
    } catch (error) {
      console.error("Enumeration Error", error);
      this.cameras = [];
      cb(this.cameras);
    }
  }

  /**
   * Set and start the camera at the specified index
   * @param {number} idx - Index of camera in the cameras array
   */
  async setCamera(idx) {
    if (this.currentCamera === idx || this.cameras === null) {
      return;
    }

    this.currentCamera = idx;
    const videoSource = this.cameras[idx];

    // Cancel any pending frame analysis
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }

    let params;
    if (videoSource === undefined && this.cameras.length === 0) {
      // No source information, assume user-facing
      params = { video: true, audio: false };
    } else {
      // Use modern constraint syntax with ideal deviceId to avoid OverconstrainedError
      params = {
        video: {
          deviceId: { ideal: videoSource.deviceId },
          // Prefer higher resolution for QR code scanning
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      };
    }

    try {
      const cameraStream = await navigator.mediaDevices.getUserMedia(params);
      this.stream = cameraStream;

      this.videoElement.addEventListener(
        "loadeddata",
        () => {
          const onframe = () => {
            if (this.videoElement.videoWidth > 0) {
              this.onframeready(this.videoElement);
            }
            if (this.currentCamera !== -1) {
              // If the camera is still running
              this.animationFrameId = requestAnimationFrame(onframe);
            }
          };

          this.onDimensionsChanged();
          this.animationFrameId = requestAnimationFrame(onframe);
        },
        { once: true }
      );

      this.videoElement.srcObject = this.stream;
      this.videoElement.load();
      await this.videoElement.play();
    } catch (error) {
      console.error("Camera access error:", error);
    }
  }

  /**
   * Stop the camera stream
   */
  stop() {
    this.currentCamera = -1;
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
    }
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
    }
  }

  /**
   * Get video dimensions
   * @returns {Object} Width and height of video
   */
  getDimensions() {
    return {
      width: this.videoElement.videoWidth,
      height: this.videoElement.videoHeight,
    };
  }

  // Callback methods to be overridden
  onDimensionsChanged() {}
  onframeready() {}
}
