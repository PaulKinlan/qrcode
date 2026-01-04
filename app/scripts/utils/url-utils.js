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

  // Prevent XSS attacks
  const SAFE_PROTOCOLS = ['http:', 'https:', 'mailto:', 'tel:', 'sms:'];
  
  if (!SAFE_PROTOCOLS.includes(url.protocol)) {
    console.warn('Unsafe protocol detected:', url.protocol);
    return false;
  }

  // Additional check for javascript: protocol (case-insensitive)
  if (url.protocol === 'javascript:') {
    console.log('XSS prevented!');
    return false;
  }

  return true;
}
