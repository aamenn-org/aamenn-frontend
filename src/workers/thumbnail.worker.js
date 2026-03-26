/**
 * Thumbnail Worker - Offscreen Canvas Thumbnail Generation
 *
 * Generates thumbnails in a Web Worker using OffscreenCanvas API.
 * This keeps the main thread responsive during thumbnail generation.
 *
 * Supports:
 * - Image thumbnail generation (small + medium)
 * - Blurhash computation
 * - JPEG quality control
 */

import { encode as encodeBlurhash } from 'blurhash';
import { THUMBNAIL_SIZES, THUMBNAIL_QUALITY } from '../constants/thumbnails.js';

/**
 * Create a thumbnail using OffscreenCanvas
 * @param {ImageBitmap} imageBitmap - Source image
 * @param {number} maxWidth - Target width
 * @param {number} maxHeight - Target height
 * @param {number} quality - JPEG quality (0.0 to 1.0)
 * @returns {Promise<Blob>} JPEG blob
 */
async function createThumbnailCover(imageBitmap, maxWidth, maxHeight, quality = 0.85) {
  const canvas = new OffscreenCanvas(maxWidth, maxHeight);
  const ctx = canvas.getContext('2d');

  const srcWidth = imageBitmap.width;
  const srcHeight = imageBitmap.height;

  // Calculate scale to COVER the canvas (image fills entire canvas, may crop)
  const scale = Math.max(maxWidth / srcWidth, maxHeight / srcHeight);

  // Calculate scaled dimensions
  const scaledWidth = srcWidth * scale;
  const scaledHeight = srcHeight * scale;

  // Calculate position to center the image (negative values = crop edges)
  const x = (maxWidth - scaledWidth) / 2;
  const y = (maxHeight - scaledHeight) / 2;

  // Enable high-quality scaling
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Draw the scaled image centered (will be cropped by canvas bounds)
  ctx.drawImage(imageBitmap, x, y, scaledWidth, scaledHeight);

  // Convert to blob with specified quality
  return canvas.convertToBlob({ type: 'image/jpeg', quality });
}

async function createThumbnailContain(imageBitmap, maxWidth, maxHeight, quality = 0.85) {
  const srcWidth = imageBitmap.width;
  const srcHeight = imageBitmap.height;

  const scale = Math.min(maxWidth / srcWidth, maxHeight / srcHeight);
  const targetWidth = Math.max(1, Math.round(srcWidth * scale));
  const targetHeight = Math.max(1, Math.round(srcHeight * scale));

  const canvas = new OffscreenCanvas(targetWidth, targetHeight);
  const ctx = canvas.getContext('2d');

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(imageBitmap, 0, 0, targetWidth, targetHeight);

  return canvas.convertToBlob({ type: 'image/jpeg', quality });
}

/**
 * Generate blurhash from an ImageBitmap
 * @param {ImageBitmap} imageBitmap - Source image
 * @returns {string} Blurhash string
 */
function generateBlurhash(imageBitmap) {
  try {
    const size = 32;
    const canvas = new OffscreenCanvas(size, size);
    const ctx = canvas.getContext('2d');

    // Draw image scaled down
    ctx.drawImage(imageBitmap, 0, 0, size, size);

    // Get image data
    const imageData = ctx.getImageData(0, 0, size, size);

    // Encode blurhash (4 components x, 3 components y)
    return encodeBlurhash(imageData.data, size, size, 4, 3);
  } catch (error) {
    console.error('[ThumbnailWorker] Failed to generate blurhash:', error);
    // Return a default gray blurhash as fallback
    return 'L6PZfSi_.AyE_3t7t7R**0o#DgR4';
  }
}

/**
 * Convert Blob to base64 string
 * @param {Blob} blob - The blob to convert
 * @returns {Promise<string>} base64 string (without data URL prefix)
 */
async function blobToBase64(blob) {
  const arrayBuffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Generate thumbnails from image data
 * @param {ImageBitmap} imageBitmap - Source image bitmap
 * @returns {Promise<Object>} Thumbnail data with small, medium, large, blurhash, dimensions
 */
async function generateThumbnailsFromBitmap(imageBitmap) {
  const width = imageBitmap.width;
  const height = imageBitmap.height;

  // Generate thumbnails in parallel with different quality levels
  const [smallBlob, mediumBlob, largeBlob] = await Promise.all([
    createThumbnailCover(
      imageBitmap,
      THUMBNAIL_SIZES.small.width,
      THUMBNAIL_SIZES.small.height,
      THUMBNAIL_QUALITY.small
    ),
    createThumbnailContain(
      imageBitmap,
      THUMBNAIL_SIZES.medium.width,
      THUMBNAIL_SIZES.medium.height,
      THUMBNAIL_QUALITY.medium
    ),
    createThumbnailContain(
      imageBitmap,
      THUMBNAIL_SIZES.large.width,
      THUMBNAIL_SIZES.large.height,
      THUMBNAIL_QUALITY.large
    ),
  ]);

  // Generate blurhash
  const blurhash = generateBlurhash(imageBitmap);

  // Convert blobs to base64 for transfer
  const [smallBase64, mediumBase64, largeBase64] = await Promise.all([
    blobToBase64(smallBlob),
    blobToBase64(mediumBlob),
    blobToBase64(largeBlob),
  ]);

  return {
    smallBase64,
    mediumBase64,
    largeBase64,
    blurhash,
    width,
    height,
  };
}

// ==================== MESSAGE HANDLER ====================

self.onmessage = async function (e) {
  const { type, id, payload } = e.data;

  try {
    switch (type) {
      case 'PING': {
        self.postMessage({ type: 'PONG', id });
        break;
      }

      case 'GENERATE_THUMBNAILS': {
        const { imageData } = payload;

        // Create ImageBitmap from the transferred data
        // imageData can be a Blob, ImageData, or ArrayBuffer
        let imageBitmap;

        if (imageData instanceof Blob) {
          imageBitmap = await createImageBitmap(imageData);
        } else if (imageData instanceof ArrayBuffer) {
          const blob = new Blob([imageData], { type: 'image/jpeg' });
          imageBitmap = await createImageBitmap(blob);
        } else {
          throw new Error('Invalid image data type');
        }

        // Report progress
        self.postMessage({
          type: 'PROGRESS',
          id,
          progress: 10,
          stage: 'generating_thumbnails',
        });

        // Generate thumbnails
        const result = await generateThumbnailsFromBitmap(imageBitmap);

        // Clean up
        imageBitmap.close();

        self.postMessage({
          type: 'PROGRESS',
          id,
          progress: 100,
          stage: 'complete',
        });

        self.postMessage({
          type: 'GENERATE_THUMBNAILS_RESULT',
          id,
          result,
        });
        break;
      }

      default:
        throw new Error(`Unknown message type: ${type}`);
    }
  } catch (error) {
    self.postMessage({
      type: 'ERROR',
      id,
      error: {
        message: error.message,
        stack: error.stack,
      },
    });
  }
};

// Signal worker is ready
self.postMessage({ type: 'READY' });
