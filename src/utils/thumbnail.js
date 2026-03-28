import { encode } from 'blurhash';
import { isSafari } from './browser.js';
import { THUMBNAIL_SIZES, THUMBNAIL_QUALITY } from '../constants/thumbnails.js';

/**
 * File type constants for clean classification
 */
export const FILE_TYPES = {
  IMAGE: 'image',
  VIDEO: 'video',
  DOCUMENT: 'document',
  OTHER: 'other'
};

/**
 * Get file type classification
 * @param mimeType - The file's MIME type
 * @returns FILE_TYPES constant
 */
export function getFileType(mimeType) {
  if (isImageSupported(mimeType)) return FILE_TYPES.IMAGE;
  if (isVideoSupported(mimeType)) return FILE_TYPES.VIDEO;
  if (isDocumentPreviewable(mimeType)) return FILE_TYPES.DOCUMENT;
  return FILE_TYPES.OTHER;
}

/**
 * File handler configuration for each type
 */
export const FILE_HANDLERS = {
  [FILE_TYPES.IMAGE]: {
    generateThumbnails: generateThumbnails,
    hasThumbnails: true,
    usesPreviewModal: false,
    iconClass: 'fa-image',
    iconColor: 'text-green-500'
  },
  [FILE_TYPES.VIDEO]: {
    generateThumbnails: generateVideoThumbnails,
    hasThumbnails: true,
    usesPreviewModal: false,
    iconClass: 'fa-video',
    iconColor: 'text-purple-500'
  },
  [FILE_TYPES.DOCUMENT]: {
    generateThumbnails: null,
    hasThumbnails: false,
    usesPreviewModal: true,
    iconClass: getDocumentIconClass,
    iconColor: getDocumentIconColor
  },
  [FILE_TYPES.OTHER]: {
    generateThumbnails: null,
    hasThumbnails: false,
    usesPreviewModal: false,
    iconClass: 'fa-file',
    iconColor: 'text-gray-400'
  }
};

/**
 * Get document icon class based on MIME type
 */
function getDocumentIconClass(mimeType) {
  if (isPDF(mimeType)) return 'fa-file-pdf';
  if (isDOCX(mimeType)) return 'fa-file-word';
  if (isTextFile(mimeType)) return 'fa-file-lines';
  return 'fa-file';
}

/**
 * Get document icon color based on MIME type
 */
function getDocumentIconColor(mimeType) {
  if (isPDF(mimeType)) return 'text-red-400';
  if (isDOCX(mimeType)) return 'text-blue-400';
  if (isTextFile(mimeType)) return 'text-gray-300';
  return 'text-gray-400';
}

export { THUMBNAIL_SIZES, THUMBNAIL_QUALITY };

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
      console.error('[ThumbnailWorker] Worker crashed — rejecting all pending tasks:', err);
      pendingTasks.forEach((task) => task.reject(new Error('Thumbnail worker crashed')));
      pendingTasks.clear();
      thumbnailWorker = null;
      thumbnailWorkerReady = false;
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

    const timeoutId = setTimeout(() => {
      if (pendingTasks.has(id)) {
        pendingTasks.delete(id);
        reject(new Error('Thumbnail generation timed out'));
      }
    }, 30000);

    pendingTasks.set(id, {
      resolve: (result) => { clearTimeout(timeoutId); resolve(result); },
      reject: (err) => { clearTimeout(timeoutId); reject(err); },
    });

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
 * @returns Object with small/medium/large thumbnail blobs, blurhash string, and dimensions
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
      const largeBlob = base64ToBlob(result.largeBase64, 'image/jpeg');

      return {
        small: smallBlob,
        medium: mediumBlob,
        large: largeBlob,
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
 * @returns Object with small/medium/large thumbnail blobs, blurhash string, and dimensions
 */
async function generateThumbnailsMainThread(file) {
  // Load image
  const image = await loadImage(file);
  const { naturalWidth: width, naturalHeight: height } = image;

  // Generate thumbnails in parallel with different quality levels
  const [smallBlob, mediumBlob, largeBlob] = await Promise.all([
    createThumbnailCover(
      image,
      THUMBNAIL_SIZES.small.width,
      THUMBNAIL_SIZES.small.height,
      THUMBNAIL_QUALITY.small
    ),
    createThumbnailContain(
      image,
      THUMBNAIL_SIZES.medium.width,
      THUMBNAIL_SIZES.medium.height,
      THUMBNAIL_QUALITY.medium
    ),
    createThumbnailContain(
      image,
      THUMBNAIL_SIZES.large.width,
      THUMBNAIL_SIZES.large.height,
      THUMBNAIL_QUALITY.large
    ),
  ]);

  // Generate blurhash
  const blurhash = await generateBlurhash(image);

  return {
    small: smallBlob,
    medium: mediumBlob,
    large: largeBlob,
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

        // Generate thumbnails in parallel with quality settings
        const [smallBlob, mediumBlob, largeBlob] = await Promise.all([
          createThumbnailCover(
            frameImage,
            THUMBNAIL_SIZES.small.width,
            THUMBNAIL_SIZES.small.height,
            THUMBNAIL_QUALITY.small
          ),
          createThumbnailContain(
            frameImage,
            THUMBNAIL_SIZES.medium.width,
            THUMBNAIL_SIZES.medium.height,
            THUMBNAIL_QUALITY.medium
          ),
          createThumbnailContain(
            frameImage,
            THUMBNAIL_SIZES.large.width,
            THUMBNAIL_SIZES.large.height,
            THUMBNAIL_QUALITY.large
          ),
        ]);

        // Generate blurhash from the frame
        const blurhash = await generateBlurhash(frameImage);

        cleanup();

        resolve({
          small: smallBlob,
          medium: mediumBlob,
          large: largeBlob,
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
 * @param quality - JPEG quality (0.0 to 1.0)
 * @returns Blob of the thumbnail as JPEG
 */
async function createThumbnailCover(image, maxWidth, maxHeight, quality = 0.85) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  const { naturalWidth: srcWidth, naturalHeight: srcHeight } = image;

  canvas.width = maxWidth;
  canvas.height = maxHeight;

  const scale = Math.max(maxWidth / srcWidth, maxHeight / srcHeight);
  const scaledWidth = srcWidth * scale;
  const scaledHeight = srcHeight * scale;
  const x = (maxWidth - scaledWidth) / 2;
  const y = (maxHeight - scaledHeight) / 2;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, x, y, scaledWidth, scaledHeight);

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
      quality
    );
  });
}

async function createThumbnailContain(image, maxWidth, maxHeight, quality = 0.85) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  const { naturalWidth: srcWidth, naturalHeight: srcHeight } = image;

  const scale = Math.min(maxWidth / srcWidth, maxHeight / srcHeight);
  const targetWidth = Math.max(1, Math.round(srcWidth * scale));
  const targetHeight = Math.max(1, Math.round(srcHeight * scale));

  canvas.width = targetWidth;
  canvas.height = targetHeight;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, targetWidth, targetHeight);

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
      quality
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

/**
 * Check if a file is a PDF document
 * @param mimeType - The file's MIME type
 * @returns boolean
 */
export function isPDF(mimeType) {
  return mimeType?.toLowerCase() === 'application/pdf';
}

/**
 * Check if a file is a DOCX document
 * @param mimeType - The file's MIME type
 * @returns boolean
 */
export function isDOCX(mimeType) {
  return (
    mimeType?.toLowerCase() ===
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  );
}

/**
 * Check if a file is a text file
 * @param mimeType - The file's MIME type
 * @returns boolean
 */
export function isTextFile(mimeType) {
  return mimeType?.toLowerCase()?.startsWith('text/');
}

/**
 * Check if a file is a previewable document (PDF, DOCX, or TXT)
 * @param mimeType - The file's MIME type
 * @returns boolean
 */
export function isDocumentPreviewable(mimeType) {
  return isPDF(mimeType) || isDOCX(mimeType) || isTextFile(mimeType);
}
