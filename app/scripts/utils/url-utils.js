/**
 * Normalizes a URL string into a URL object.
 * @param {string} url - The URL string to normalize
 * @returns {URL|undefined} The normalized URL object, or undefined if invalid
 */
export function normalizeUrl(url) {
  // Remove leading/trailing white space from protocol, normalize casing, etc.
  try {
    return new URL(url);
  } catch (exception) {
    return undefined;
  }
}

/**
 * Validates if a URL is safe to navigate to.
 * Prevents XSS attacks by checking for dangerous protocols.
 * @param {URL} url - The URL object to validate
 * @returns {boolean} True if the URL is safe
 */
export function isSafeUrl(url) {
  if (!url || !(url instanceof URL)) {
    return false;
  }

  // Prevent XSS attacks by only allowing safe protocols
  const SAFE_PROTOCOLS = ['http:', 'https:', 'mailto:', 'tel:', 'sms:'];
  
  if (!SAFE_PROTOCOLS.includes(url.protocol)) {
    console.warn('Unsafe protocol detected:', url.protocol);
    return false;
  }

  return true;
}

// Shared by QR result handoffs and x-callback destinations. WHATWG URL normalizes
// numeric IPv4 forms; its hostname retains IPv6 brackets. Keep the allowlist narrow.
const LOOPBACK_HOSTNAMES = new Set(['localhost', '[::1]']);

export function isLoopbackHost(hostname) {
  // 127.0.0.0/8 is loopback (RFC 1122); do not accept lookalike host suffixes.
  return LOOPBACK_HOSTNAMES.has(hostname) || /^127(?:\.\d{1,3}){3}$/.test(hostname);
}

export function isCleartextOffDevice(url) {
  return url instanceof URL && url.protocol === 'http:' && !isLoopbackHost(url.hostname);
}

// isSafeUrl remains the protocol/XSS gate; transport is an additional check for
// result actions that hand the scanned URL to a browser, share sheet or clipboard.
export function isTransportSafeUrl(url) {
  return isSafeUrl(url) && !isCleartextOffDevice(url);
}
