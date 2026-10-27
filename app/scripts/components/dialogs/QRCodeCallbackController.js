/**
 * QRCodeCallbackController - Handles x-callback-url integration
 * Allows other applications to receive decoded QR code data
 */
import { isSafeUrl } from '../../utils/url-utils.js';

export class QRCodeCallbackController {
  constructor(element) {
    this.element = element;
    this.callbackName = element.querySelector('.QRCodeSuccessDialogCallback-name');
    this.callbackDomain = element.querySelector('.QRCodeSuccessDialogCallback-domain');
    this.callbackUrl = null;
    this.qrcodeUrl = null;

    this.initialize();
  }

  initialize() {
    this.callbackUrl = this.getCallbackURL();

    if (this.isWebCallback(this.callbackUrl)) {
      this.element.addEventListener('click', () => {
        // The referrer is not proof of trust: the callback owner can also host the referring page.
        // Confirm each transfer, including when the browser omits the referrer.
        if (!this.isWebCallback(this.callbackUrl) || !this.qrcodeUrl) return;
        const callbackUrl = new URL(this.callbackUrl);
        const qrCode = String(this.qrcodeUrl);
        const preview = JSON.stringify(qrCode.slice(0, 120).replace(/[\u202a-\u202e\u2066-\u2069]/g, ''));
        if (!window.confirm(`Send scanned content to ${callbackUrl.origin}?\n\n${preview}${qrCode.length > 120 ? '…' : ''}`)) return;
        callbackUrl.searchParams.set('qrcode', qrCode);
        location = callbackUrl;
      });

      this.element.classList.remove('hidden');
      this.callbackDomain.innerText = this.callbackUrl.origin;
    }
  }

  /**
   * Set the scanned QR code URL
   * @param {URL|string} normalizedUrl - The normalized URL from QR code
   */
  setQrCode(normalizedUrl) {
    this.qrcodeUrl = normalizedUrl;
  }

  isWebCallback(url) {
    return isSafeUrl(url) && (url.protocol === 'https:' || url.protocol === 'http:');
  }

  /**
   * Get callback URL from query parameters
   * @returns {URL|null} The callback URL or null
   */
  getCallbackURL() {
    const url = new URL(window.location);
    
    if ('searchParams' in url && url.searchParams.has('x-callback-url')) {
      try {
        return new URL(url.searchParams.get('x-callback-url'));
      } catch (e) {
        console.error('Invalid x-callback-url:', e);
        return null;
      }
    }
    
    return null;
  }
}
