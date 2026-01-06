import { encode } from 'blurhash';

/**
 * Thumbnail sizes configuration
 */
export const THUMBNAIL_SIZES = {
  small: { width: 150, height: 150 },
  medium: { width: 800, height: 800 },
};

/**
 * Detect Safari browser (has quirks with OffscreenCanvas and createImageBitmap)
 */
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

/**
 * Check if OffscreenCanvas is supported (for worker-based generation)
 * Safari < 16.4 doesn't support OffscreenCanvas properly
 * Even Safari 16.4+ can have issues with createImageBitmap on Blobs
 */
export const OFFSCREEN_CANVAS_SUPPORTED = (() => {
  if (typeof OffscreenCanvas === 'undefined') return false;
  if (typeof createImageBitmap === 'undefined') return false;

  // Safari has known issues with OffscreenCanvas + createImageBitmap from Blob
  // Disable worker-based generation on Safari to avoid failures
  if (isSafari) {
    console.log(
      '[Thumbnail] Safari detected - using main thread for compatibility'
    );
    return false;
  }

  return true;
})();

/**
 * Thumbnail worker singleton
 */
let thumbnailWorker = null;
let thumbnailWorkerReady = false;
let pendingTasks = new Map();
let nextTaskId = 0;

/**
 * Initialize the thumbnail worker (lazy)
 */
function initThumbnailWorker() {
  if (thumbnailWorker) return;
  if (!OFFSCREEN_CANVAS_SUPPORTED) return;

  try {
    thumbnailWorker = new Worker(
      new URL('../workers/thumbnail.worker.js', import.meta.url),
      { type: 'module' }
    );

    thumbnailWorker.onmessage = (e) => {
      const { type, id, result, error, progress, stage } = e.data;

      if (type === 'READY' || type === 'PONG') {
        thumbnailWorkerReady = true;
        return;
      }

      const task = pendingTasks.get(id);
      if (!task) return;

      if (type === 'PROGRESS') {
        if (task.onProgress) task.onProgress(progress, stage);
        return;
      }

      if (type === 'ERROR') {
        task.reject(new Error(error.message));
        pendingTasks.delete(id);
        return;
      }

      if (type.endsWith('_RESULT')) {
        task.resolve(result);
        pendingTasks.delete(id);
      }
    };

    thumbnailWorker.onerror = (err) => {
      console.error('[ThumbnailWorker] Worker error:', err);
    };
  } catch (err) {
    console.warn('[ThumbnailWorker] Failed to create worker:', err);
    thumbnailWorker = null;
  }
}

/**
 * Generate thumbnails using the worker (if available)
 * @param {File|Blob} file - The image file
 * @returns {Promise<Object>} Thumbnail result with base64 data
 */
async function generateThumbnailsInWorker(file) {
  initThumbnailWorker();

  if (!thumbnailWorker) {
    throw new Error('Thumbnail worker not available');
  }

  return new Promise((resolve, reject) => {
    const id = nextTaskId++;
    pendingTasks.set(id, { resolve, reject });

    // Send the file blob directly - createImageBitmap can handle it
    thumbnailWorker.postMessage({
      type: 'GENERATE_THUMBNAILS',
      id,
      payload: { imageData: file },
    });
  });
}

/**
 * Supported video MIME types
 */
const SUPPORTED_VIDEO_TYPES = [
  'video/mp4',
  'video/webm',
  'video/ogg',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska',
];

/**
 * Check if a MIME type is a supported video format
 * @param mimeType - The file's MIME type
 * @returns boolean
 */
export function isVideoSupported(mimeType) {
  return SUPPORTED_VIDEO_TYPES.includes(mimeType?.toLowerCase());
}

/**
 * Check if a MIME type is any video type
 * @param mimeType - The file's MIME type
 * @returns boolean
 */
export function isVideo(mimeType) {
  return mimeType?.toLowerCase()?.startsWith('video/');
}

/**
 * Generate thumbnails and blurhash from an image file
 * Uses Web Worker with OffscreenCanvas when available, falls back to main thread
 * @param file - The original image file
 * @param options - Options: { useWorker: boolean }
 * @returns Object with small/medium thumbnail blobs, blurhash string, and dimensions
 */
export async function generateThumbnails(file, options = {}) {
  const { useWorker = true } = options;

  // Try worker-based generation first (non-blocking)
  if (useWorker && OFFSCREEN_CANVAS_SUPPORTED) {
    try {
      const result = await generateThumbnailsInWorker(file);

      // Convert base64 back to blobs for consistency with main thread API
      const smallBlob = base64ToBlob(result.smallBase64, 'image/jpeg');
      const mediumBlob = base64ToBlob(result.mediumBase64, 'image/jpeg');

      return {
        small: smallBlob,
        medium: mediumBlob,
        blurhash: result.blurhash,
        width: result.width,
        height: result.height,
      };
    } catch (err) {
      console.warn(
        '[Thumbnail] Worker failed, falling back to main thread:',
        err.message
      );
      // Fall through to main thread generation
    }
  }

  // Fallback: Main thread generation
  return generateThumbnailsMainThread(file);
}

/**
 * Generate thumbnails on the main thread (fallback)
 * @param file - The original image file
 * @returns Object with small/medium thumbnail blobs, blurhash string, and dimensions
 */
async function generateThumbnailsMainThread(file) {
  // Load image
  const image = await loadImage(file);
  const { naturalWidth: width, naturalHeight: height } = image;

  // Generate thumbnails in parallel
  const [smallBlob, mediumBlob] = await Promise.all([
    createThumbnail(
      image,
      THUMBNAIL_SIZES.small.width,
      THUMBNAIL_SIZES.small.height
    ),
    createThumbnail(
      image,
      THUMBNAIL_SIZES.medium.width,
      THUMBNAIL_SIZES.medium.height
    ),
  ]);

  // Generate blurhash
  const blurhash = await generateBlurhash(image);

  return {
    small: smallBlob,
    medium: mediumBlob,
    blurhash,
    width,
    height,
  };
}

/**
 * Convert base64 string to Blob
 * @param base64 - base64 string (without data URL prefix)
 * @param mimeType - MIME type of the blob
 * @returns Blob
 */
function base64ToBlob(base64, mimeType) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

/**
 * Generate thumbnails from a video file by extracting a frame
 * @param file - The video file
 * @param seekTime - Time in seconds to seek to (default: 0.5s for near-start frame)
 * @returns Object with small/medium thumbnail blobs, blurhash string, dimensions, and duration
 */
export async function generateVideoThumbnails(file, seekTime = 0.5) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);

    // Set up video element
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;

    // Timeout for slow loading videos
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Video thumbnail generation timed out'));
    }, 30000);

    const cleanup = () => {
      clearTimeout(timeout);
      URL.revokeObjectURL(url);
      video.remove();
    };

    video.onloadedmetadata = () => {
      // Clamp seek time to video duration
      const targetTime = Math.min(seekTime, video.duration * 0.1);
      video.currentTime = targetTime;
    };

    video.onseeked = async () => {
      try {
        const { videoWidth: width, videoHeight: height, duration } = video;

        if (width === 0 || height === 0) {
          throw new Error('Video has no valid dimensions');
        }

        // Create canvas to capture frame
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, width, height);

        // Convert canvas to image element for thumbnail generation
        const frameBlob = await new Promise((res) => {
          canvas.toBlob(res, 'image/jpeg', 0.9);
        });

        const frameImage = await loadImageFromBlob(frameBlob);

        // Generate thumbnails in parallel
        const [smallBlob, mediumBlob] = await Promise.all([
          createThumbnail(
            frameImage,
            THUMBNAIL_SIZES.small.width,
            THUMBNAIL_SIZES.small.height
          ),
          createThumbnail(
            frameImage,
            THUMBNAIL_SIZES.medium.width,
            THUMBNAIL_SIZES.medium.height
          ),
        ]);

        // Generate blurhash from the frame
        const blurhash = await generateBlurhash(frameImage);

        cleanup();

        resolve({
          small: smallBlob,
          medium: mediumBlob,
          blurhash,
          width,
          height,
          duration: Math.round(duration),
        });
      } catch (error) {
        cleanup();
        reject(error);
      }
    };

    video.onerror = () => {
      cleanup();
      reject(new Error('Failed to load video for thumbnail generation'));
    };

    video.src = url;
    video.load();
  });
}

/**
 * Load an image from a Blob
 */
async function loadImageFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (error) => {
      URL.revokeObjectURL(url);
      reject(
        new Error(
          `Failed to load image from blob: ${error?.message || 'Unknown error'}`
        )
      );
    };
    img.src = url;
  });
}

/**
 * Load an image from a file
 * Safari-compatible with proper URL cleanup
 */
async function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    // Safari requires crossOrigin to be set for some operations
    // even on blob URLs in certain contexts
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      // Revoke URL after image loads to prevent memory leak
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (error) => {
      URL.revokeObjectURL(url);
      reject(new Error(`Failed to load image: ${error?.message || file.name}`));
    };
    img.src = url;
  });
}

/**
 * Create a thumbnail from an image
 * @param image - The source image element
 * @param maxWidth - Maximum width
 * @param maxHeight - Maximum height
 * @returns Blob of the thumbnail as JPEG
 */
async function createThumbnail(image, maxWidth, maxHeight) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  const { naturalWidth: srcWidth, naturalHeight: srcHeight } = image;

  // Set canvas to target dimensions
  canvas.width = maxWidth;
  canvas.height = maxHeight;

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
  ctx.drawImage(image, x, y, scaledWidth, scaledHeight);

  // Convert to blob
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to create thumbnail blob'));
        }
      },
      'image/jpeg',
      0.85
    );
  });
}

/**
 * Generate a blurhash string from an image
 * @param image - The source image element
 * @returns Blurhash string
 */
async function generateBlurhash(image) {
  try {
    // Create a small canvas for faster processing
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    const size = 32;
    canvas.width = size;
    canvas.height = size;

    // Draw image scaled down
    ctx.drawImage(image, 0, 0, size, size);

    // Get image data
    const imageData = ctx.getImageData(0, 0, size, size);

    // Encode blurhash (4 components x, 3 components y for good balance)
    const hash = encode(imageData.data, size, size, 4, 3);

    return hash;
  } catch (error) {
    console.error('Failed to generate blurhash:', error);
    // Return a default gray blurhash as fallback
    return 'L6PZfSi_.AyE_3t7t7R**0o#DgR4';
  }
}

/**
 * Check if a file is an image that supports thumbnail generation
 * @param mimeType - The file's MIME type
 * @returns boolean
 */
export function isImageSupported(mimeType) {
  const supportedTypes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
  ];
  return supportedTypes.includes(mimeType?.toLowerCase());
}

/**
 * Check if a file supports thumbnail generation (images or videos)
 * @param mimeType - The file's MIME type
 * @returns boolean
 */
export function isThumbnailSupported(mimeType) {
  return isImageSupported(mimeType) || isVideoSupported(mimeType);
}

/**
 * Convert a Blob to base64 string
 * @param blob - The blob to convert
 * @returns base64 string (without data URL prefix)
 */
export async function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Format video duration in HH:MM:SS or MM:SS format
 * @param seconds - Duration in seconds
 * @returns Formatted duration string
 */
export function formatVideoDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';

  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs
      .toString()
      .padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
