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
    this.qrCodeHelpManager = new QRCodeHelpManager('about');
    
    this.processingFrame = false;

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
    this.cameraManager.onframe = async (context) => {
      // Prevent overlapping QR code detection
      if (this.processingFrame) {
        return;
      }

      this.processingFrame = true;
      
      try {
        const url = await this.qrCodeManager.detectQRCode(context);
        
        if (url !== undefined) {
          // QR code found!
          
          // Track with Google Analytics if available
          if ('ga' in window) {
            ga('send', 'event', 'urlfound');
          }

          // Haptic feedback if available
          if ('vibrate' in navigator) {
            navigator.vibrate([200]);
          }

          this.qrCodeManager.showDialog(url);
        }
      } finally {
        this.processingFrame = false;
      }
    };
  }
}
