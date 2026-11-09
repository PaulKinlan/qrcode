/**
 * QRCodeCallbackController - Handles x-callback-url integration
 * Allows other applications to receive decoded QR code data
 */
import { isSafeUrl } from '../../utils/url-utils.js';

// A plaintext http: callback is only tolerated for a target on this machine, where the request
// never leaves the device. The scanned payload is the user's data and must not go out in clear.
const LOOPBACK_HOSTNAMES = new Set(['localhost', '[::1]']);

function isLoopbackHost(hostname) {
  // 127.0.0.0/8 is loopback (RFC 1122); WHATWG URL keeps IPv6 brackets in hostname.
  return LOOPBACK_HOSTNAMES.has(hostname) || /^127(?:\.\d{1,3}){3}$/.test(hostname);
}

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
        const show = (part) => JSON.stringify(part.join('')).replace(/[\u202a-\u202e\u2066-\u2069]/g,
          (char) => `\\u${char.codePointAt(0).toString(16).padStart(4, '0')}`);
        const preview = characters.length <= 120
          ? show(characters)
          : `Starts ${show(characters.slice(0, 80))}\nEnds ${show(characters.slice(-40))}\n` +
            `${characters.length - 120} characters in the middle are not shown but will also be sent.`;
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
