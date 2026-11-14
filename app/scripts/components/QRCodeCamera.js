import { CameraManager } from './camera/CameraManager.js';
import { QRCodeManager } from './dialogs/QRCodeManager.js';
import { QRCodeHelpManager } from './dialogs/QRCodeHelpManager.js';

/**
 * QRCodeCamera - Main application coordinator
 * Connects camera, QR detection, and UI components
 */
export class QRCodeCamera {
  constructor() {
    this.cameraManager = new CameraManager('camera');
    this.qrCodeManager = new QRCodeManager('qrcode');
    // Optional page markup (bead qrcode-dqr): decoder failures are reported here when the
    // element exists, and must never crash the frame loop when it does not.
    this.scanError = document.getElementById('camera-error');
    this.qrCodeHelpManager = new QRCodeHelpManager('about');
    
    this.setupHelpButton();
    this.setupCameraCallback();
  }

  setupHelpButton() {
    const helpButton = document.querySelector('.about');
    // .about is a real <button type=button> (bead qrcode-e4c): Enter/Space activation is the
    // browser's native click, so one listener serves pointer and keyboard alike.
    helpButton.addEventListener('click', () => {
      this.qrCodeHelpManager.showDialog();
    });
  }

  setupCameraCallback() {
    // A source failure carries the reason (unsupported file, the size/decoded-pixel limits, a
    // camera fault). Showing the markup's fixed "try again" hides the one thing the user can
    // act on, because re-selecting the same file fails identically.
    this.cameraManager.onFailure = (error) => {
      this.showScanError(error?.message);
    };
    let isDecoding = false;
    this.cameraManager.onframe = async (context) => {
      // Keep the camera preview running, but do not decode or vibrate behind a modal result.
      // Scanning resumes naturally after Ignore, Escape, back or light-dismiss.
      if (isDecoding || this.qrCodeManager.root.open) {
        return;
      }

      isDecoding = true;
      
      try {
        let failed = false;
        const url = await this.qrCodeManager.detectQRCode(context, () => {
          failed = true;
          this.showScanError();
        });
        if (!failed && this.scanError) this.scanError.hidden = true;
        
        if (url !== undefined) {
          // QR code found!
          
          // Haptic feedback if available
          if ('vibrate' in navigator) {
            navigator.vibrate([200]);
          }

          this.qrCodeManager.showDialog(url);
        }
      } finally {
        isDecoding = false;
      }
    };
  }

  /**
   * Surface a failure on the alert, preferring the specific reason over the markup's
   * generic text. The markup's own text is captured once so a later failure without a
   * reason can fall back to it instead of leaving a stale, unrelated reason on screen.
   * @param {string} [reason]
   */
  showScanError(reason) {
    if (!this.scanError) return;
    if (reason) {
      this.scanErrorDefaultText ??= this.scanError.textContent;
      // textContent, never innerHTML: the alert shows a failure reason, not authored markup.
      this.scanError.textContent = reason;
    } else if (this.scanErrorDefaultText !== undefined) {
      // Nothing specific to say: put back the markup's own text rather than leave a stale reason.
      this.scanError.textContent = this.scanErrorDefaultText;
    }
    this.scanError.hidden = false;
  }
}
