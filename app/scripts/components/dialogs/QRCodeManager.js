import { decode } from '../../qrclient.js';
import { QRCodeCallbackController } from './QRCodeCallbackController.js';
import { isSafeUrl, normalizeUrl } from '../../utils/url-utils.js';

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
    if (navigator.share && this.qrcodeShare) {
      this.qrcodeShare.classList.remove('hidden');
    }

    // Show copy button if Clipboard API is supported
    if (navigator.clipboard?.writeText && this.qrcodeCopy) {
      this.qrcodeCopy.classList.remove('hidden');
    }
  }

  setupEventListeners() {
    // Ignore button - close dialog
    this.qrcodeIgnore.addEventListener('click', () => {
      this.closeDialog();
    });

    // Share button
    this.qrcodeShare?.addEventListener('click', async () => {
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
    this.qrcodeCopy?.addEventListener('click', async () => {
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
   * @returns {URL|undefined} Normalized URL if found, undefined for a miss (no QR in the frame)
   * @throws {DecodeError} When the decoder pipeline fails; a failure is never reported as a miss
   */
  async detectQRCode(context) {
    const result = await decode(context);

    if (result === undefined) {
      // Nothing decoded (no QR in the frame)
      return undefined;
    }

    // One normalisation path for the whole app (bead qrcode-amy): the composition the unit tests
    // document and cover, decode -> normalizeUrl -> isSafeUrl, is now the shipped one. This used
    // to re-implement normalizeUrl() inline with new URL()/try/catch, so the tested path and the
    // running path could drift apart.
    const normalizedUrl = normalizeUrl(result);
    if (normalizedUrl === undefined) {
      // Invalid URL: the parser rejected the payload
      return undefined;
    }

    this.currentUrl = normalizedUrl;
    return normalizedUrl;
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
