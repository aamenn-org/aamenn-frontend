/**
 * Browser detection utilities
 * Single source of truth for browser quirk detection.
 */

/**
 * Detect Safari browser.
 * Safari has quirks with OffscreenCanvas, createImageBitmap, and Web Crypto API.
 */
export const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
