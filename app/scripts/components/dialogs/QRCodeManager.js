import { decode } from '../../qrclient.js';
import { QRCodeCallbackController } from './QRCodeCallbackController.js';
import { isSafeUrl } from '../../utils/url-utils.js';

/**
 * QRCodeManager - Manages the QR code success dialog and actions
 */
export class QRCodeManager {
  constructor(element) {
    this.root = document.getElementById(element);
    this.qrcodeData = this.root.querySelector('.QRCodeSuccessDialog-data');
    this.qrcodeNavigate = this.root.querySelector('.QRCodeSuccessDialog-navigate');
    this.qrcodeIgnore = this.root.querySelector('.QRCodeSuccessDialog-ignore');
    this.qrcodeShare = this.root.querySelector('.QRCodeSuccessDialog-share');
    this.qrcodeCopy = this.root.querySelector('.QRCodeSuccessDialog-copy');
    this.qrcodeCallback = this.root.querySelector('.QRCodeSuccessDialog-callback');
    
    this.callbackController = new QRCodeCallbackController(this.qrcodeCallback);
    this.currentUrl = undefined;

    this.setupUI();
    this.setupEventListeners();
  }

  setupUI() {
    // Show share button if Web Share API is supported
    if (navigator.share) {
      this.qrcodeShare.classList.remove('hidden');
    }

    // Show copy button if Clipboard API is supported
    if (navigator.clipboard && navigator.clipboard.writeText) {
      this.qrcodeCopy.classList.remove('hidden');
    }
  }

  setupEventListeners() {
    // Ignore button - close dialog
    this.qrcodeIgnore.addEventListener('click', () => {
      this.closeDialog();
    });

    // Share button
    this.qrcodeShare.addEventListener('click', async () => {
      if (navigator.share) {
        try {
          await navigator.share({
            title: this.currentUrl,
            text: this.currentUrl,
            url: this.currentUrl
          });
          this.closeDialog();
        } catch (err) {
          // User cancelled or share failed
          if (err.name !== 'AbortError') {
            console.error('Share failed:', err);
          }
          this.closeDialog();
        }
      }
    });

    // Copy button
    this.qrcodeCopy.addEventListener('click', async () => {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
          await navigator.clipboard.writeText(this.currentUrl);
        } catch (err) {
          console.error('Copy failed:', err);
        }
      }
      this.closeDialog();
    });

    // Navigate button
    this.qrcodeNavigate.addEventListener('click', () => {
      // Validate URL for security
      if (!isSafeUrl(this.currentUrl)) {
        console.error('Unsafe URL detected, navigation blocked');
        this.closeDialog();
        return;
      }

      window.location = this.currentUrl;
      this.closeDialog();
    });
  }

  /**
   * Detect QR code from canvas context
   * @param {CanvasRenderingContext2D} context - Canvas context with QR code image
   * @returns {URL|undefined} Normalized URL if found
   */
  async detectQRCode(context) {
    const result = await decode(context);
    
    if (result !== undefined) {
      try {
        const normalizedUrl = new URL(result);
        this.currentUrl = normalizedUrl;
        return normalizedUrl;
      } catch (e) {
        // Invalid URL
        return undefined;
      }
    }
    
    return undefined;
  }

  /**
   * Show the QR code dialog with detected URL
   * @param {URL} normalizedUrl - The detected and normalized URL
   */
  showDialog(normalizedUrl) {
    this.root.style.display = 'block';
    this.qrcodeData.innerText = normalizedUrl;
    this.callbackController.setQrCode(normalizedUrl);
  }

  /**
   * Close the QR code dialog
   */
  closeDialog() {
    this.root.style.display = 'none';
    this.qrcodeData.innerText = '';
  }
}
