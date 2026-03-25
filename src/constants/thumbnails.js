/**
 * Shared thumbnail configuration constants.
 * Single source of truth used by both the main thread (utils/thumbnail.js)
 * and the Web Worker (workers/thumbnail.worker.js).
 */

/**
 * Thumbnail dimensions.
 * Medium and Large share the same pixel dimensions but differ in JPEG quality.
 */
export const THUMBNAIL_SIZES = {
  small: { width: 150, height: 150 },
  medium: { width: 1600, height: 1600 },
  large: { width: 1600, height: 1600 },
};

/**
 * JPEG quality settings for each thumbnail tier.
 */
export const THUMBNAIL_QUALITY = {
  small: 0.30,  // Grid thumbnails - compressed for fast scroll
  medium: 0.60, // Preview initial - lower quality, faster load
  large: 0.90,  // Preview final - high quality
};
