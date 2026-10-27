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
    this.scanError = document.getElementById('camera-error');
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
    this.cameraManager.onframe = async (context) => {
      // Drop incoming frames while the worker is decoding the previous one.
      if (isDecoding) {
        return;
      }

      isDecoding = true;
      
      try {
        let failed = false;
        const url = await this.qrCodeManager.detectQRCode(context, () => {
          failed = true;
          this.scanError.hidden = false;
        });
        if (!failed) this.scanError.hidden = true;

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
}
