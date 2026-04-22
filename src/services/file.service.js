import api from './api';
import { thumbnailCache } from './cache/thumbnail-cache';

// Debug logging - disabled in production
const DEBUG = false;
const log = (...args) => DEBUG && console.log('[FileService]', ...args);

export const fileService = {
  /**
   * List user's files with pagination (with offline support)
   * @param {Object} params - Query parameters
   * @param {number} params.page - Page number (default: 1)
   * @param {number} params.limit - Items per page (default: 50)
   */
  async listFiles(params = {}) {
    try {
      const response = await api.get('/files', { params });

      // Cache the file list for offline access
      if (response.data?.data?.files) {
        await thumbnailCache.cacheFileList(response.data.data.files);
      }

      return response.data;
    } catch (error) {
      // If network error, try to return cached data
      if (error.message === 'Network Error' || !navigator.onLine) {
        log('Network error, trying cached file list...');
        const cachedFiles = await thumbnailCache.getCachedFileList();

        if (cachedFiles) {
          log('Returning cached file list');
          return {
            data: {
              files: cachedFiles,
              total: cachedFiles.length,
              page: 1,
              limit: cachedFiles.length,
              totalPages: 1,
            },
            success: true,
            fromCache: true,
          };
        }
      }
      throw error;
    }
  },

  /**
   * Get file metadata and download URL (with cache-first strategy)
   * @param {string} fileId - File UUID
   * @param {Object} options - Options
   * @param {boolean} options.skipCache - Force fresh fetch from API
   */
  async getFile(fileId, options = {}) {
    const { skipCache = false } = options;

    // Check cache first (unless skipCache is true)
    if (!skipCache) {
      const cachedMetadata = await thumbnailCache.getCachedFileMetadata(fileId);
      if (cachedMetadata) {
        log(`Cache HIT for file ${fileId}`);
        return { ...cachedMetadata, fromCache: true };
      }
    }

    try {
      log(`Cache MISS - fetching file ${fileId}`);
      const response = await api.get(`/files/${fileId}`);

      // Cache the file metadata for future use
      await thumbnailCache.cacheFileMetadata(fileId, response.data);

      return response.data;
    } catch (error) {
      // If network error, try cached as last resort
      if (error.message === 'Network Error' || !navigator.onLine) {
        const cachedMetadata = await thumbnailCache.getCachedFileMetadata(
          fileId
        );
        if (cachedMetadata) {
          log('Returning cached file metadata');
          return { ...cachedMetadata, fromCache: true };
        }
      }
      throw error;
    }
  },

  /**
   * Get multiple files metadata in batch (optimized for viewer preloading)
   * @param {string[]} fileIds - Array of file UUIDs
   * @returns {Promise<{files: Array}>} Batch response with file metadata and download URLs
   */
  async getFilesBatch(fileIds) {
    if (!fileIds || fileIds.length === 0) {
      return { files: [] };
    }

    try {
      const response = await api.post('/files/batch', { fileIds });

      // Cache each file's metadata for offline access
      const files = response.data?.files || [];
      for (const file of files) {
        await thumbnailCache.cacheFileMetadata(file.fileId, file);
      }

      return response.data;
    } catch (error) {
      console.error('[FileService] Batch fetch failed:', error);
      // Fallback to individual requests if batch fails
      const results = await Promise.allSettled(
        fileIds.map((id) => this.getFile(id))
      );
      return {
        files: results
          .filter((r) => r.status === 'fulfilled')
          .map((r) => r.value),
      };
    }
  },

  /**
   * Check if a file with the given content hash already exists.
   * Used for duplicate detection before uploading.
   *
   * @param {string} hash - SHA-256 hash of the original file content
   * @returns {Promise<{isDuplicate: boolean, existingFile: object|null}>}
   */
  async checkDuplicate(hash) {
    const response = await api.get('/files/check-duplicate', { params: { hash } });
    return response.data;
  },

  /**
   * Upload file through backend proxy (avoids CORS)
   * @param {File} file - The file to upload
   * @param {Object} metadata - File metadata
   * @param {string} metadata.fileNameEncrypted - Encrypted filename
   * @param {string} metadata.cipherFileKey - Encrypted file key
   * @param {string} metadata.mimeType - File MIME type
   * @param {string} metadata.sha1Hash - SHA1 hash of encrypted content
   * @param {Function} onProgress - Progress callback
   */
  async uploadFile(file, metadata, onProgress) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('fileNameEncrypted', metadata.fileNameEncrypted);
    formData.append('cipherFileKey', metadata.cipherFileKey);
    formData.append('mimeType', metadata.mimeType);
    formData.append('sha1Hash', metadata.sha1Hash);

    const response = await api.post('/files/upload', formData, {
      onUploadProgress: (progressEvent) => {
        if (onProgress) {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          onProgress(percentCompleted);
        }
      },
    });
    return response.data;
  },

  /**
   * Move a file to trash (soft-delete)
   * @param {string} fileId - File UUID
   */
  async moveToTrash(fileId) {
    const response = await api.delete(`/files/${fileId}`);
    return response.data;
  },

  /**
   * Move multiple files to trash (bulk)
   * @param {string[]} fileIds - Array of file UUIDs
   */
  async moveToTrashBulk(fileIds) {
    const response = await api.post('/files/trash', { fileIds });
    return response.data;
  },

  /**
   * List files in trash
   * @param {Object} params - Query parameters
   * @param {number} params.page - Page number (default: 1)
   * @param {number} params.limit - Items per page (default: 50)
   */
  async listTrash(params = {}) {
    const response = await api.get('/files/trash', { params });
    return response.data;
  },

  /**
   * Restore a file from trash
   * @param {string} fileId - File UUID
   */
  async restoreFile(fileId) {
    const response = await api.post(`/files/${fileId}/restore`);
    return response.data;
  },

  /**
   * Restore multiple files from trash (bulk)
   * @param {string[]} fileIds - Array of file UUIDs
   */
  async restoreFilesBulk(fileIds) {
    const response = await api.post('/files/restore', { fileIds });
    return response.data;
  },

  /**
   * Permanently delete a file
   * @param {string} fileId - File UUID
   */
  async deleteFilePermanently(fileId) {
    const response = await api.delete(`/files/${fileId}/permanent`);
    return response.data;
  },

  /**
   * Permanently delete multiple files (bulk)
   * @param {string[]} fileIds - Array of file UUIDs
   */
  async deleteFilesPermanentlyBulk(fileIds) {
    const response = await api.post('/files/purge', { fileIds });
    return response.data;
  },

  /**
   * Empty trash in batches — calls POST repeatedly, invoking the callback
   * after each batch so the UI can remove files progressively.
   * @param {(deletedIds: string[]) => void} onBatchDeleted - Called per batch with deleted IDs
   */
  async emptyTrash(onBatchDeleted) {
    let remaining = 1;
    while (remaining > 0) {
      const response = await api.post('/files/trash/empty');
      const data = response.data;
      remaining = data?.remaining ?? 0;
      const deletedIds = data?.deletedIds ?? [];
      if (deletedIds.length > 0 && onBatchDeleted) {
        onBatchDeleted(deletedIds);
      }
      if (deletedIds.length === 0) break;
    }
  },

  /**
   * Update file metadata
   * @param {string} fileId - File UUID
   * @param {Object} updates - Properties to update
   * @param {boolean} [updates.isFavorite] - Favorite status
   * @param {string} [updates.fileNameEncrypted] - Encrypted filename for rename
   */
  async updateFile(fileId, updates) {
    const response = await api.patch(`/files/${fileId}`, updates);
    return response.data;
  },

  /**
   * List favorite files with pagination (with offline support)
   * @param {Object} params - Query parameters
   * @param {number} params.page - Page number (default: 1)
   * @param {number} params.limit - Items per page (default: 50)
   */
  async listFavorites(params = {}) {
    // Use unified listFiles endpoint with favorite filter
    return this.listFiles({ ...params, favorite: true });
  },

  /**
   * Download file content from B2 using signed URL
   * @param {string} downloadUrl - Signed B2 download URL
   */
  async downloadFileContent(downloadUrl) {
    const response = await fetch(downloadUrl);
    if (!response.ok) throw new Error(`Download failed: ${response.status}`);
    return response.arrayBuffer();
  },

  /**
   * Stream-download encrypted file content from B2 with byte-level progress.
   * Uses the ReadableStream API and the exposed Content-Length header.
   * Falls back to a plain arrayBuffer() fetch when Content-Length is absent.
   *
   * @param {string} downloadUrl - Signed B2 download URL
   * @param {(percent: number) => void} onProgress - Called with 0–100 integers
   * @returns {Promise<ArrayBuffer>}
   */
  async downloadFileContentWithProgress(downloadUrl, onProgress) {
    const response = await fetch(downloadUrl);
    if (!response.ok) throw new Error(`Download failed: ${response.status}`);

    const contentLength = response.headers.get('Content-Length');
    const total = contentLength ? parseInt(contentLength, 10) : 0;

    if (!total || !response.body) {
      const buffer = await response.arrayBuffer();
      onProgress(100);
      return buffer;
    }

    const reader = response.body.getReader();
    const chunks = [];
    let loaded = 0;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.byteLength;
      onProgress(Math.min(99, Math.round((loaded / total) * 100)));
    }

    onProgress(100);

    const result = new Uint8Array(loaded);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return result.buffer;
  },

  // ==================== Chunked Upload API ====================

  /**
   * Start a chunked upload session on the backend.
   * @param {object} metadata
   * @returns {Promise<{uploadId: string, b2FileId: string, b2FilePath: string}>}
   */
  async startChunkedUpload(metadata) {
    const response = await api.post('/uploads/start', metadata);
    return response.data;
  },

  /**
   * Get signed part upload URLs (batch).
   * @param {string} uploadId — backend session ID
   * @param {number} count — number of URLs to fetch (1-10)
   * @returns {Promise<{urls: Array<{uploadUrl: string, authorizationToken: string}>}>}
   */
  async getPartUploadUrls(uploadId, count) {
    const response = await api.post(`/uploads/${uploadId}/part-urls`, { count });
    return response.data;
  },

  /**
   * Complete a chunked upload.
   * @param {string} uploadId
   * @param {object} data — { partSha1Array, thumbSmall?, thumbMedium?, thumbLarge? }
   */
  async completeChunkedUpload(uploadId, data) {
    const response = await api.post(`/uploads/${uploadId}/complete`, data);
    return response.data;
  },

  /**
   * Cancel an in-progress chunked upload.
   * @param {string} uploadId
   */
  async cancelChunkedUpload(uploadId) {
    const response = await api.post(`/uploads/${uploadId}/cancel`);
    return response.data;
  },

  /**
   * Get upload session status with B2-reconciled completed parts.
   * @param {string} uploadId
   */
  async getUploadStatus(uploadId) {
    const response = await api.get(`/uploads/${uploadId}/status`);
    return response.data;
  },

  /**
   * List all pending (active) upload sessions for the current user.
   */
  async listPendingUploads() {
    const response = await api.get('/uploads/pending');
    return response.data;
  },

};

export default fileService;
