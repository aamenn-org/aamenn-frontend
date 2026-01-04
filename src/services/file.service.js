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
   * @param {string} [albumId] - Optional album ID to check if duplicate exists in same album
   * @returns {Promise<{isDuplicate: boolean, existingFile: object|null, inSameAlbum: boolean}>}
   */
  async checkDuplicate(hash, albumId = null) {
    const params = { hash };
    if (albumId) {
      params.albumId = albumId;
    }
    const response = await api.get('/files/check-duplicate', { params });
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
      headers: {
        'Content-Type': 'multipart/form-data',
      },
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
   * Upload file with thumbnails through backend proxy
   * @param {File} file - The encrypted file to upload
   * @param {Object} metadata - File metadata including thumbnails
   * @param {string} metadata.fileNameEncrypted - Encrypted filename
   * @param {string} metadata.cipherFileKey - Encrypted file key
   * @param {string} metadata.mimeType - File MIME type
   * @param {string} metadata.sha1Hash - SHA1 hash of encrypted content
   * @param {string} metadata.thumbSmall - Base64 encoded encrypted small thumbnail
   * @param {string} metadata.thumbMedium - Base64 encoded encrypted medium thumbnail
   * @param {string} metadata.cipherThumbSmallKey - Encrypted thumbnail small key
   * @param {string} metadata.cipherThumbMediumKey - Encrypted thumbnail medium key
   * @param {string} metadata.blurhash - Blurhash string for placeholder
   * @param {number} metadata.width - Original image/video width
   * @param {number} metadata.height - Original image/video height
   * @param {number} metadata.duration - Video duration in seconds (optional)
   * @param {Function} onProgress - Progress callback
   */
  async uploadFileWithThumbnails(file, metadata, onProgress) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('fileNameEncrypted', metadata.fileNameEncrypted);
    formData.append('cipherFileKey', metadata.cipherFileKey);
    formData.append('mimeType', metadata.mimeType);
    formData.append('sha1Hash', metadata.sha1Hash);
    formData.append('thumbSmall', metadata.thumbSmall);
    formData.append('thumbMedium', metadata.thumbMedium);
    formData.append('cipherThumbSmallKey', metadata.cipherThumbSmallKey);
    formData.append('cipherThumbMediumKey', metadata.cipherThumbMediumKey);
    formData.append('blurhash', metadata.blurhash || '');
    formData.append('width', String(metadata.width || 0));
    formData.append('height', String(metadata.height || 0));
    if (metadata.duration !== undefined && metadata.duration !== null) {
      formData.append('duration', String(metadata.duration));
    }

    // Use unified upload endpoint (handles both with/without thumbnails)
    const response = await api.post('/files/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
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
   * Permanently delete a file
   * @param {string} fileId - File UUID
   */
  async deleteFile(fileId) {
    const response = await api.delete(`/files/${fileId}`);
    return response.data;
  },

  /**
   * Toggle favorite status for a file
   * @param {string} fileId - File UUID
   */
  async toggleFavorite(fileId) {
    const response = await api.post(`/files/${fileId}/favorite`);
    return response.data;
  },

  /**
   * List favorite files with pagination (with offline support)
   * @param {Object} params - Query parameters
   * @param {number} params.page - Page number (default: 1)
   * @param {number} params.limit - Items per page (default: 50)
   */
  async listFavorites(params = {}) {
    try {
      const response = await api.get('/files/favorites/list', { params });

      // Cache favorites for offline access
      if (response.data?.files) {
        await thumbnailCache.cacheFavoritesList(response.data.files);
      }

      return response.data;
    } catch (error) {
      // If network error, try to return cached data
      if (error.message === 'Network Error' || !navigator.onLine) {
        log('Network error, trying cached favorites...');
        const cachedFavorites = await thumbnailCache.getCachedFavoritesList();

        if (cachedFavorites) {
          log('Returning cached favorites');
          return {
            files: cachedFavorites,
            total: cachedFavorites.length,
            fromCache: true,
          };
        }
      }
      throw error;
    }
  },

  /**
   * Download file content from B2 using signed URL
   * @param {string} downloadUrl - Signed B2 download URL
   */
  async downloadFileContent(downloadUrl) {
    const response = await fetch(downloadUrl);
    return response.arrayBuffer();
  },
};

export default fileService;
