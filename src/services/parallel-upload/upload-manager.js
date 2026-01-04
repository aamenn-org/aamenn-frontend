/**
 * Parallel Upload Service - Coordinates encryption and upload workers
 *
 * This is the main entry point for the parallel upload system, following ente.io patterns:
 * - Uses Web Workers for encryption (doesn't block UI)
 * - Parallel upload queue with concurrency control
 * - Progress tracking at file and batch level
 * - Memory-efficient chunked processing
 * - Retry logic with exponential backoff
 */

import { getCryptoWorkerPool } from '../../workers/crypto-worker-pool';
import UploadQueue, { UploadState } from './upload-queue';
import api from '../api';
import {
  generateThumbnails,
  generateVideoThumbnails,
  isImageSupported,
  isVideoSupported,
} from '../../utils/thumbnail';

// Configuration - conservative defaults to avoid rate limiting
const CONFIG = {
  UPLOAD_CONCURRENCY: 2, // Max parallel uploads (reduced to avoid 429s)
  ENCRYPTION_BATCH_SIZE: 3, // Files to encrypt in parallel
  CHUNK_SIZE: 4 * 1024 * 1024, // 4MB chunks
  MAX_FILE_SIZE: 10 * 1024 * 1024 * 1024, // 10GB max
  UPLOAD_DELAY_MS: 200, // Delay between uploads to avoid rate limiting
};

/**
 * Parallel Upload Manager
 */
class ParallelUploadManager {
  constructor() {
    this.cryptoPool = null;
    this.uploadQueue = null;
    this.masterKeyBytes = null;
    this.initialized = false;
    this.listeners = new Set();
  }

  /**
   * Initialize the upload manager with master key
   * Can be called multiple times safely - will skip if already initialized
   */
  async init(masterKey) {
    // Skip if already initialized with same key
    if (this.initialized && this.masterKeyBytes) {
      return;
    }

    if (!masterKey) {
      throw new Error('Master key is required');
    }

    // Export master key for worker transfer
    this.masterKeyBytes = await crypto.subtle.exportKey('raw', masterKey);

    // Initialize crypto worker pool (if not already)
    if (!this.cryptoPool) {
      this.cryptoPool = getCryptoWorkerPool();
      await this.cryptoPool.init();
    }

    // Initialize upload queue (if not already)
    if (!this.uploadQueue) {
      this.uploadQueue = new UploadQueue({
        concurrency: CONFIG.UPLOAD_CONCURRENCY,
        encryptFunction: this._encryptFile.bind(this),
        uploadFunction: this._uploadFile.bind(this),
      });

      // Forward queue events
      this.uploadQueue.addListener((event, data, stats) => {
        this._notifyListeners(event, data, stats);
      });
    }

    this.initialized = true;
  }

  /**
   * Encrypt a file using worker pool
   */
  async _encryptFile(file, onProgress, abortSignal) {
    if (!this.masterKeyBytes) {
      throw new Error('Master key not set');
    }

    // Read file into ArrayBuffer
    const fileData = await file.arrayBuffer();

    // Check for cancellation
    if (abortSignal?.aborted) {
      throw new Error('Upload cancelled');
    }

    // Encrypt file using worker
    const encryptResult = await this.cryptoPool.encryptFile(
      fileData,
      this.masterKeyBytes,
      file.name,
      file.type,
      onProgress
    );

    // Check for cancellation
    if (abortSignal?.aborted) {
      throw new Error('Upload cancelled');
    }

    // Generate and encrypt thumbnails if applicable
    let thumbnailData = null;

    if (isImageSupported(file.type)) {
      try {
        thumbnailData = await this._generateImageThumbnails(file, abortSignal);
      } catch (error) {
        console.warn(
          '[ParallelUploadManager] Failed to generate image thumbnails:',
          error
        );
      }
    } else if (isVideoSupported(file.type)) {
      try {
        thumbnailData = await this._generateVideoThumbnails(file, abortSignal);
      } catch (error) {
        console.warn(
          '[ParallelUploadManager] Failed to generate video thumbnails:',
          error
        );
      }
    }

    return {
      ...encryptResult,
      thumbnailData,
    };
  }

  /**
   * Generate and encrypt image thumbnails
   */
  async _generateImageThumbnails(file, abortSignal) {
    const thumbs = await generateThumbnails(file);

    if (abortSignal?.aborted) {
      throw new Error('Upload cancelled');
    }

    // Encrypt thumbnails in parallel
    const [smallEncrypted, mediumEncrypted] = await Promise.all([
      this.cryptoPool.encryptThumbnail(
        await thumbs.small.arrayBuffer(),
        this.masterKeyBytes,
        'small'
      ),
      this.cryptoPool.encryptThumbnail(
        await thumbs.medium.arrayBuffer(),
        this.masterKeyBytes,
        'medium'
      ),
    ]);

    return {
      thumbSmall: smallEncrypted.encryptedData,
      thumbMedium: mediumEncrypted.encryptedData,
      cipherThumbSmallKey: smallEncrypted.cipherThumbKey,
      cipherThumbMediumKey: mediumEncrypted.cipherThumbKey,
      blurhash: thumbs.blurhash,
      width: thumbs.width,
      height: thumbs.height,
    };
  }

  /**
   * Generate and encrypt video thumbnails
   */
  async _generateVideoThumbnails(file, abortSignal) {
    const thumbs = await generateVideoThumbnails(file);

    if (abortSignal?.aborted) {
      throw new Error('Upload cancelled');
    }

    // Encrypt thumbnails in parallel
    const [smallEncrypted, mediumEncrypted] = await Promise.all([
      this.cryptoPool.encryptThumbnail(
        await thumbs.small.arrayBuffer(),
        this.masterKeyBytes,
        'small'
      ),
      this.cryptoPool.encryptThumbnail(
        await thumbs.medium.arrayBuffer(),
        this.masterKeyBytes,
        'medium'
      ),
    ]);

    return {
      thumbSmall: smallEncrypted.encryptedData,
      thumbMedium: mediumEncrypted.encryptedData,
      cipherThumbSmallKey: smallEncrypted.cipherThumbKey,
      cipherThumbMediumKey: mediumEncrypted.cipherThumbKey,
      blurhash: thumbs.blurhash,
      width: thumbs.width,
      height: thumbs.height,
      duration: thumbs.duration,
    };
  }

  /**
   * Upload encrypted file to backend
   */
  async _uploadFile(encryptedResult, originalFile, onProgress, abortSignal) {
    const {
      encryptedData,
      cipherFileKey,
      fileNameEncrypted,
      sha1Hash,
      thumbnailData,
    } = encryptedResult;

    // Create FormData
    const formData = new FormData();

    // Create blob from encrypted data
    const encryptedBlob = new Blob([encryptedData], {
      type: 'application/octet-stream',
    });
    const encryptedFile = new File([encryptedBlob], 'encrypted', {
      type: 'application/octet-stream',
    });

    formData.append('file', encryptedFile);
    formData.append('fileNameEncrypted', fileNameEncrypted);
    formData.append('cipherFileKey', cipherFileKey);
    formData.append('mimeType', originalFile.type);
    formData.append('sha1Hash', sha1Hash);

    // Add thumbnail data if available
    if (thumbnailData) {
      formData.append('thumbSmall', thumbnailData.thumbSmall);
      formData.append('thumbMedium', thumbnailData.thumbMedium);
      formData.append('cipherThumbSmallKey', thumbnailData.cipherThumbSmallKey);
      formData.append(
        'cipherThumbMediumKey',
        thumbnailData.cipherThumbMediumKey
      );
      formData.append('blurhash', thumbnailData.blurhash || '');
      formData.append('width', String(thumbnailData.width || 0));
      formData.append('height', String(thumbnailData.height || 0));
      if (thumbnailData.duration !== undefined) {
        formData.append('duration', String(thumbnailData.duration));
      }
    }

    // Use unified upload endpoint (handles both with/without thumbnails)
    const response = await api.post('/files/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      signal: abortSignal,
      onUploadProgress: (progressEvent) => {
        if (onProgress && progressEvent.total) {
          const percent = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          onProgress(percent);
        }
      },
    });

    return response.data;
  }

  /**
   * Upload files using the parallel system
   */
  async uploadFiles(files, options = {}) {
    if (!this.initialized) {
      throw new Error('Upload manager not initialized. Call init() first.');
    }

    // Validate files
    const validFiles = Array.from(files).filter((file) => {
      if (file.size > CONFIG.MAX_FILE_SIZE) {
        console.warn(`[ParallelUploadManager] File too large: ${file.name}`);
        this._notifyListeners('fileSkipped', {
          file,
          reason: 'File too large (max 10GB)',
        });
        return false;
      }
      return true;
    });

    if (validFiles.length === 0) {
      throw new Error('No valid files to upload');
    }

    // Add to upload queue
    return this.uploadQueue.addFiles(validFiles, options);
  }

  /**
   * Cancel a specific upload
   */
  cancelUpload(taskId) {
    return this.uploadQueue?.cancelUpload(taskId);
  }

  /**
   * Cancel all uploads
   */
  cancelAll() {
    this.uploadQueue?.cancelAll();
  }

  /**
   * Pause all uploads
   */
  pause() {
    this.uploadQueue?.pause();
  }

  /**
   * Resume uploads
   */
  resume() {
    this.uploadQueue?.resume();
  }

  /**
   * Retry failed uploads
   */
  retryFailed() {
    this.uploadQueue?.retryFailed();
  }

  /**
   * Get upload statistics
   */
  getStats() {
    return (
      this.uploadQueue?.getStats() || {
        total: 0,
        queued: 0,
        active: 0,
        completed: 0,
        failed: 0,
        overallProgress: 0,
        paused: false,
        activeTasks: [],
      }
    );
  }

  /**
   * Add event listener
   */
  addListener(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Notify listeners
   */
  _notifyListeners(event, data, stats) {
    for (const listener of this.listeners) {
      try {
        listener(event, data, stats);
      } catch (error) {
        console.error('[ParallelUploadManager] Listener error:', error);
      }
    }
  }

  /**
   * Clear completed uploads history
   */
  clearHistory() {
    this.uploadQueue?.clearHistory();
  }

  /**
   * Destroy the manager and cleanup resources
   */
  destroy() {
    this.cancelAll();
    this.listeners.clear();
    this.masterKeyBytes = null;
    this.initialized = false;
  }
}

// Export singleton instance
let instance = null;

export function getUploadManager() {
  if (!instance) {
    instance = new ParallelUploadManager();
  }
  return instance;
}

export function destroyUploadManager() {
  if (instance) {
    instance.destroy();
    instance = null;
  }
}

export { UploadState };
export default ParallelUploadManager;
