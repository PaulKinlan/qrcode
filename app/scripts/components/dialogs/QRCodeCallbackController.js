/**
 * QRCodeCallbackController - Handles x-callback-url integration
 * Allows other applications to receive decoded QR code data
 */
import { isSafeUrl, isLoopbackHost } from '../../utils/url-utils.js';

// A plaintext http: callback is only tolerated on this machine. Share the
// loopback definition with QR result actions so their transport rules cannot drift.

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
        const characters = Array.from(qrCode); // Keep surrogate pairs intact at the preview boundary.
        // Keep invisible formatting marks and line separators inside the quoted preview.
        const show = (part) => JSON.stringify(part.join('')).replace(/[\p{Default_Ignorable_Code_Point}\u2028\u2029]/gu,
          (char) => {
            const hex = char.codePointAt(0).toString(16);
            return hex.length > 4 ? `\\u{${hex}}` : `\\u${hex.padStart(4, '0')}`;
          });
        const preview = characters.length <= 120
          ? show(characters)
          : `Starts ${show(characters.slice(0, 80))}\nEnds ${show(characters.slice(-40))}\n` +
            `The middle is not shown (${characters.length - 120} ` +
            `character${characters.length - 120 === 1 ? '' : 's'}), but it will also be sent.`;
        if (!window.confirm(`Send scanned content (${characters.length} characters) to ${callbackUrl.origin}?\n\n${preview}`)) return;
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
    if (!isSafeUrl(url)) return false;
    if (url.protocol === 'https:') return true;
    return url.protocol === 'http:' && isLoopbackHost(url.hostname);
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
