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
    this.isValidCallbackUrl = false;

    this.initialize();
  }

  initialize() {
    this.callbackUrl = this.getCallbackURL();
    this.isValidCallbackUrl = this.validateCallbackURL(this.callbackUrl);

    if (this.callbackUrl && isSafeUrl(this.callbackUrl)) {
      this.element.addEventListener('click', () => {
        // Recheck at the navigation sink: the URL can change after initialization.
        if (!isSafeUrl(this.callbackUrl)) return;
        this.callbackUrl.searchParams.set('qrcode', this.qrcodeUrl);
        // Validate the final URL, after inserting the scanned value, at the navigation sink.
        if (!isSafeUrl(this.callbackUrl)) return;
        location = this.callbackUrl;
      });

      this.element.classList.remove('hidden');
      
      if (!this.isValidCallbackUrl) {
        this.callbackDomain.classList.add('invalid');
      }
      
      this.callbackDomain.innerText = this.callbackUrl.origin;
    }
  }

  /**
   * Set the scanned QR code URL
   * @param {string} normalizedUrl - The normalized URL from QR code
   */
  setQrCode(normalizedUrl) {
    this.qrcodeUrl = normalizedUrl;
  }

  /**
   * Validate that callback URL matches the referrer
   * @param {URL} callbackUrl - The callback URL to validate
   * @returns {boolean} True if valid
   */
  validateCallbackURL(callbackUrl) {
    if (document.referrer === '') {
      return false;
    }

    try {
      const referrer = new URL(document.referrer);
      
      // Callback must be from same origin as referrer and use HTTPS
      return callbackUrl !== undefined
        && referrer.origin === callbackUrl.origin
        && referrer.protocol === 'https:';
    } catch (e) {
      return false;
    }
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
