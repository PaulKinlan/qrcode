// HTMLMediaElement.HAVE_METADATA: the first readyState at which videoWidth/
// videoHeight are meaningful. Below it both read 0.
const HAVE_METADATA = 1;

/**
 * CameraSource - Manages camera access and video streaming
 * Modernized to use only standard getUserMedia APIs (no deprecated prefixes)
 */
export class CameraSource {
  constructor(videoElement) {
    this.videoElement = videoElement;
    this.stream = null;
    this.animationFrameId = null;
    this.pendingDimensions = null;
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

    // A previous camera's dimension wait must not outlive this switch.
    this.abortPendingDimensions();

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

      // The user may have switched cameras or stopped the stream while
      // getUserMedia was pending; that request now owns the video element.
      if (this.currentCamera !== idx) {
        cameraStream.getTracks().forEach((track) => track.stop());
        return;
      }

      this.stream = cameraStream;
      this.videoElement.srcObject = this.stream;
      this.videoElement.load();

      // videoWidth/videoHeight are 0 until the element reaches HAVE_METADATA, so the
      // canvas must not be sized from them any earlier: a 0x0 source yields a
      // zero-sized drawing buffer and a crop rectangle outside the video.
      // Listeners are attached in this same task as load(), before any media event
      // can be dispatched (bead qrcode-xrv).
      const dimensionsReady = this.waitForDimensions();

      await this.videoElement.play();

      const hasDimensions = await dimensionsReady;

      // Switched away or stopped while waiting for metadata.
      if (this.currentCamera !== idx) {
        return;
      }

      if (!hasDimensions) {
        console.warn("CameraSource: no usable video dimensions for camera", idx);
        return;
      }

      this.onDimensionsChanged();
      this.startFrameLoop();
    } catch (error) {
      console.error("Camera access error:", error);
    }
  }

  /**
   * Whether the video element has decoded enough to report real dimensions
   * @returns {boolean}
   */
  hasVideoDimensions() {
    const video = this.videoElement;

    return Boolean(
      video &&
        video.readyState >= HAVE_METADATA &&
        video.videoWidth > 0 &&
        video.videoHeight > 0
    );
  }

  /**
   * Resolve once the video element reports real dimensions.
   *
   * A ready event without usable dimensions is not fatal: some platforms reach
   * HAVE_METADATA with videoWidth still 0 and only fill the dimensions in on a
   * later loadeddata/resize. Waiting across those events keeps the camera
   * starting when the dimensions do arrive, instead of stalling it for the life
   * of the page (bead qrcode-wjj). Resolves false only on stream error or when
   * stop()/a camera switch aborts the wait.
   * @returns {Promise<boolean>} True when dimensions are usable
   */
  waitForDimensions() {
    if (this.hasVideoDimensions()) {
      return Promise.resolve(true);
    }

    const video = this.videoElement;

    return new Promise((resolve) => {
      const finish = (ok) => {
        video.removeEventListener("loadedmetadata", onReady);
        video.removeEventListener("loadeddata", onReady);
        video.removeEventListener("canplay", onReady);
        video.removeEventListener("resize", onReady);
        video.removeEventListener("error", onError);
        this.pendingDimensions = null;
        resolve(ok);
      };

      const onReady = () => {
        if (this.hasVideoDimensions()) {
          finish(true);
        }
      };
      const onError = () => finish(false);

      this.pendingDimensions = finish;

      video.addEventListener("loadedmetadata", onReady);
      video.addEventListener("loadeddata", onReady);
      video.addEventListener("canplay", onReady);
      video.addEventListener("resize", onReady);
      video.addEventListener("error", onError);
    });
  }

  /**
   * Abort a pending dimension wait (camera switch or stop)
   */
  abortPendingDimensions() {
    const pending = this.pendingDimensions;

    if (pending) {
      this.pendingDimensions = null;
      pending(false);
    }
  }

  /**
   * Pump video frames to the onframeready callback
   */
  startFrameLoop() {
    const onframe = () => {
      if (this.videoElement.videoWidth > 0) {
        this.onframeready(this.videoElement);
      }
      if (this.currentCamera !== -1) {
        // If the camera is still running
        this.animationFrameId = requestAnimationFrame(onframe);
      }
    };

    this.animationFrameId = requestAnimationFrame(onframe);
  }

  /**
   * Stop the camera stream
   */
  stop() {
    this.currentCamera = -1;

    // Let a pending setCamera() finish instead of waiting on a stopped element.
    this.abortPendingDimensions();

    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
    }
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  /**
   * Get video dimensions. Both are 0 until the element reaches HAVE_METADATA.
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
