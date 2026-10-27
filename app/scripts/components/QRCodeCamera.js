import { CameraManager } from './camera/CameraManager.js';
import { QRCodeManager } from './dialogs/QRCodeManager.js';
import { QRCodeHelpManager } from './dialogs/QRCodeHelpManager.js';

// Consecutive decode failures before the loop says the decoder looks broken. A single flaky frame
// must not spam the console, but a decoder that never works must not stay silent either.
const DECODE_FAILURE_REPORT_STREAK = 3;

/**
 * QRCodeCamera - Main application coordinator
 * Connects camera, QR detection, and UI components
 */
export class QRCodeCamera {
  constructor() {
    this.cameraManager = new CameraManager('camera');
    this.qrCodeManager = new QRCodeManager('qrcode');
    this.qrCodeHelpManager = new QRCodeHelpManager('about');
    
    this.setupHelpButton();
    this.setupCameraCallback();
  }

  setupHelpButton() {
    const helpButton = document.querySelector('.about');
    helpButton.onclick = () => {
      this.qrCodeHelpManager.showDialog();
    };
  }

  setupCameraCallback() {
    let isDecoding = false;
    let decodeFailures = 0;

    this.cameraManager.onframe = async (context) => {
      // Drop incoming frames while the worker is decoding the previous one.
      if (isDecoding) {
        return;
      }

      isDecoding = true;
      
      try {
        const url = await this.qrCodeManager.detectQRCode(context);

        // The decoder answered, so the pipeline is healthy even when the frame held no QR code.
        decodeFailures = 0;
        
        if (url !== undefined) {
          // QR code found!
          
          // Haptic feedback if available
          if ('vibrate' in navigator) {
            navigator.vibrate([200]);
          }

          this.qrCodeManager.showDialog(url);
        }
      } catch (error) {
        // A broken decoder must not look like an empty frame (bead qrcode-8iz): count the failure,
        // report it once per streak rather than once per frame, and keep the camera loop running.
        decodeFailures += 1;

        if (decodeFailures === DECODE_FAILURE_REPORT_STREAK) {
          console.error(
            `QR decoding failed on ${decodeFailures} frames in a row: the decoder looks broken, the frames are not empty.`,
            error
          );
        }

        this.ondecodeerror?.(error, decodeFailures);
      } finally {
        isDecoding = false;
      }
    };
  }
}
