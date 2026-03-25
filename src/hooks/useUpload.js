/**
 * useUpload Hook - High-performance parallel upload with maximum thread utilization
 *
 * Features:
 * - Uses all available CPU cores for encryption (via navigator.hardwareConcurrency)
 * - Two-phase pipeline: encryption queue → upload queue
 * - Real-time progress updates
 * - Immediate file list updates on completion
 * - Rate limit aware (caps concurrent uploads)
 * - Exponential backoff retry for 429/5xx errors (like ente.io)
 * - Respects Retry-After header
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useAuth } from '../context';
import api from '../services/api';
import fileService from '../services/file.service';
import {
  generateThumbnails,
  generateVideoThumbnails,
  getFileType,
  FILE_HANDLERS,
} from '../utils/thumbnail';
import {
  generateFileKey,
  encryptFile,
  encryptFileKey,
  encryptFilename,
  arrayBufferToBase64,
  computeSHA256 as computeSHA256MainThread,
  computeSHA1 as computeSHA1MainThread,
} from '../utils/crypto';
import { getCryptoWorkerPool } from '../workers';

// Detect available CPU cores and use them all for maximum performance
// navigator.hardwareConcurrency returns the number of logical processors
const CPU_CORES = navigator.hardwareConcurrency || 6;
const MAX_CONCURRENT_ENCRYPT = CPU_CORES; // Use all cores for CPU-bound encryption
// Cap concurrent uploads to 4 to prevent network failures (each upload = 3 B2 requests)
const MAX_CONCURRENT_UPLOAD = Math.min(CPU_CORES, 6);

// Progressive upload threshold - files larger than this skip thumbnail generation
// to start upload immediately (thumbnails can be generated later)
const PROGRESSIVE_UPLOAD_THRESHOLD = 50 * 1024 * 1024; // 50MB

// Detect Safari for workarounds (Safari has issues with some worker operations)
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

// Retry configuration (inspired by ente.io)
const RETRY_CONFIG = {
  maxRetries: 4, // 1 original + 3 retries
  initialDelayMs: 2000, // Start with 2 seconds
  maxDelayMs: 120000, // Max 2 minutes
  backoffMultiplier: 2, // Double each time
  retryableStatusCodes: [429, 500, 502, 503, 504],
};

console.log(
  `[useUpload] Detected ${CPU_CORES} CPU cores. Using ${MAX_CONCURRENT_ENCRYPT} encryption threads, ${MAX_CONCURRENT_UPLOAD} upload threads.${
    isSafari ? ' (Safari mode)' : ''
  }`
);

// Generate UUID - crypto.randomUUID() is available in all browsers that support WebCrypto API
const generateUUID = () => crypto.randomUUID();

// SessionStorage key for persisting upload state across page refreshes
const STORAGE_KEY = 'aamenn_upload_state';

// Upload states
export const UploadStatus = {
  PENDING: 'pending',
  HASHING: 'hashing', // Computing content hash for duplicate detection
  DUPLICATE: 'duplicate', // File is a duplicate, skipped
  ENCRYPTING: 'encrypting',
  UPLOADING: 'uploading',
  COMPLETED: 'completed',
  FAILED: 'failed',
  RETRYING: 'retrying',
  INTERRUPTED: 'interrupted', // For uploads interrupted by page refresh
};

// Helper: Save upload state to sessionStorage
const saveUploadState = (uploads, isUploading) => {
  try {
    const serializable = [...uploads.values()].map((u) => ({
      id: u.id,
      name: u.name,
      size: u.size,
      type: u.type,
      status: u.status,
      progress: u.progress,
      error: u.error,
      albumId: u.albumId,
    }));
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        uploads: serializable,
        isUploading,
        timestamp: Date.now(),
      })
    );
  } catch (e) {
    console.warn('[useUpload] Failed to save state to sessionStorage:', e);
  }
};

// Helper: Load upload state from sessionStorage
const loadUploadState = () => {
  try {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (!saved) return null;

    const parsed = JSON.parse(saved);
    // Only restore if saved within last 30 minutes
    if (Date.now() - parsed.timestamp > 30 * 60 * 1000) {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch (e) {
    console.warn('[useUpload] Failed to load state from sessionStorage:', e);
    return null;
  }
};

// Helper: Clear saved upload state
const clearUploadState = () => {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore
  }
};

export function useUpload({ onFileUploaded } = {}) {
  const { getMasterKey, masterKeyAvailable } = useAuth();

  // Initialize from sessionStorage if available (handles page refresh)
  // Note: We warn users before refresh, but if they proceed anyway,
  // we clear in-progress uploads since File objects are lost
  const [uploads, setUploads] = useState(() => {
    const saved = loadUploadState();
    if (saved && saved.uploads.length > 0) {
      const map = new Map();
      let hadInProgress = false;

      saved.uploads.forEach((u) => {
        // Check if upload was in progress (File objects are lost on refresh)
        const wasInProgress = [
          UploadStatus.PENDING,
          UploadStatus.ENCRYPTING,
          UploadStatus.UPLOADING,
          UploadStatus.RETRYING,
        ].includes(u.status);

        if (wasInProgress) {
          hadInProgress = true;
          // Don't add interrupted uploads - they can't be resumed
          // User was warned before refresh, so just discard them
          return;
        }

        // Keep completed and failed uploads
        map.set(u.id, u);
      });

      if (hadInProgress) {
        console.log(
          `[useUpload] Discarded in-progress uploads (interrupted by page refresh)`
        );
      }
      if (map.size > 0) {
        console.log(
          `[useUpload] Restored ${map.size} completed/failed uploads from sessionStorage`
        );
      }
      return map;
    }
    return new Map();
  });

  const [isUploading, setIsUploading] = useState(false);

  // Separate counters for encryption (CPU-bound) and upload (network-bound) phases
  const encryptingCountRef = useRef(0);
  const uploadingCountRef = useRef(0);
  const queueRef = useRef([]); // Files waiting to be encrypted
  const uploadQueueRef = useRef([]); // Encrypted files waiting to upload
  const onFileUploadedRef = useRef(onFileUploaded);

  // Keep callback ref updated
  useEffect(() => {
    onFileUploadedRef.current = onFileUploaded;
  }, [onFileUploaded]);

  // Persist uploads state to sessionStorage whenever it changes
  useEffect(() => {
    if (uploads.size > 0) {
      saveUploadState(uploads, isUploading);
    }
  }, [uploads, isUploading]);

  // Warn user before leaving page during upload (prevents accidental refresh)
  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (isUploading) {
        // Standard way to show browser's "Leave site?" dialog
        e.preventDefault();
        // For older browsers
        e.returnValue =
          'You have uploads in progress. Are you sure you want to leave?';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isUploading]);

  // Update a single upload's state
  const updateUpload = useCallback((id, updates) => {
    setUploads((prev) => {
      const newMap = new Map(prev);
      const existing = newMap.get(id);
      if (existing) {
        newMap.set(id, { ...existing, ...updates });
      }
      return newMap;
    });
  }, []);

  // Refs for async function access
  const processEncryptionRef = useRef(null);
  const processUploadRef = useRef(null);

  // Check if all operations are complete
  const checkIfAllDone = useCallback(() => {
    if (
      encryptingCountRef.current === 0 &&
      uploadingCountRef.current === 0 &&
      queueRef.current.length === 0 &&
      uploadQueueRef.current.length === 0
    ) {
      setIsUploading(false);
    }
  }, []);

  // Process encryption queue - uses all CPU cores
  const processEncryptionQueue = useCallback(() => {
    while (
      encryptingCountRef.current < MAX_CONCURRENT_ENCRYPT &&
      queueRef.current.length > 0
    ) {
      const uploadInfo = queueRef.current.shift();
      if (uploadInfo && processEncryptionRef.current) {
        processEncryptionRef.current(uploadInfo);
      }
    }
  }, []);

  // Process upload queue - capped to avoid rate limits
  const processUploadQueue = useCallback(() => {
    while (
      uploadingCountRef.current < MAX_CONCURRENT_UPLOAD &&
      uploadQueueRef.current.length > 0
    ) {
      const item = uploadQueueRef.current.shift();
      if (item && processUploadRef.current) {
        processUploadRef.current(item);
      }
    }
  }, []);

  // Phase 1: Encryption (CPU-bound) - runs in parallel up to MAX_CONCURRENT_ENCRYPT
  // Now includes duplicate detection before encryption
  const processEncryption = useCallback(
    async (uploadInfo) => {
      const { id, file, albumId } = uploadInfo;
      const masterKey = getMasterKey();

      if (!masterKey) {
        updateUpload(id, {
          status: UploadStatus.FAILED,
          error: 'No master key available',
        });
        checkIfAllDone();
        return;
      }

      encryptingCountRef.current++;

      try {
        // Phase 1a: Compute content hash for duplicate detection (in worker - non-blocking)
        updateUpload(id, { status: UploadStatus.HASHING, progress: 2 });

        // Read file data - use arrayBuffer() with FileReader fallback for Safari
        let fileData;
        try {
          fileData = await file.arrayBuffer();
        } catch (readError) {
          // Fallback to FileReader for older Safari versions
          console.warn(
            '[useUpload] arrayBuffer() failed, using FileReader fallback:',
            readError.message
          );
          fileData = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('FileReader failed'));
            reader.readAsArrayBuffer(file);
          });
        }

        // Clone the ArrayBuffer for hashing since transfer is destructive
        const hashData = fileData.slice(0);

        // Compute SHA-256 hash - use worker with fallback to main thread for Safari compatibility
        let contentHash;
        try {
          const workerPool = getCryptoWorkerPool();
          contentHash = await workerPool.computeSHA256(hashData);
        } catch (workerError) {
          console.warn(
            '[useUpload] Worker hash failed, using main thread:',
            workerError.message
          );
          // Fallback to main thread computation (Safari compatibility)
          contentHash = await computeSHA256MainThread(hashData);
        }
        updateUpload(id, { progress: 5 });

        // Phase 1b: Check for duplicates
        try {
          const duplicateCheck = await fileService.checkDuplicate(
            contentHash,
            albumId
          );

          if (duplicateCheck.isDuplicate) {
            if (duplicateCheck.inSameAlbum) {
              // File already exists in the same album - skip entirely
              console.log(
                `[useUpload] Skipping duplicate: ${file.name} (already in album)`
              );
              updateUpload(id, {
                status: UploadStatus.DUPLICATE,
                progress: 100,
                error: 'File already exists in this album',
                existingFileId: duplicateCheck.existingFile?.id,
              });
              encryptingCountRef.current--;
              processEncryptionQueue();
              checkIfAllDone();
              return;
            } else {
              // File exists in different album - could create symlink in future
              // For now, skip to avoid storage redundancy
              console.log(
                `[useUpload] Skipping duplicate: ${file.name} (exists in other albums)`
              );
              updateUpload(id, {
                status: UploadStatus.DUPLICATE,
                progress: 100,
                error: 'File already uploaded (exists in your library)',
                existingFileId: duplicateCheck.existingFile?.id,
              });
              encryptingCountRef.current--;
              processEncryptionQueue();
              checkIfAllDone();
              return;
            }
          }
        } catch (dupError) {
          // If duplicate check fails, continue with upload (fail-safe)
          console.warn(
            '[useUpload] Duplicate check failed, continuing with upload:',
            dupError
          );
        }

        // Phase 1c: Proceed with encryption (file is not a duplicate)
        updateUpload(id, { status: UploadStatus.ENCRYPTING, progress: 10 });

        // Generate file key
        const fileKey = await generateFileKey();
        updateUpload(id, { progress: 15 });

        // Encrypt file
        const { encryptedData, iv: fileIv } = await encryptFile(
          fileData,
          fileKey
        );
        const cipherFileKey = await encryptFileKey(fileKey, masterKey);
        const fileNameEncrypted = await encryptFilename(file.name, masterKey);
        updateUpload(id, { progress: 35 });

        // Generate thumbnails using file type handler (clean DRY approach)
        let thumbnailData = null;
        const fileType = getFileType(file.type);
        const handler = FILE_HANDLERS[fileType];

        if (handler.generateThumbnails) {
          try {
            const thumbs = await handler.generateThumbnails(file);
            thumbnailData = await encryptThumbnails(thumbs, masterKey, fileKey);
          } catch (e) {
            console.warn(`${fileType} thumbnail generation failed:`, e);
            throw new Error(`Thumbnail generation failed for ${fileType} ${file.name}: ${e.message}`);
          }
        }
        // Files without thumbnail support (documents, other) - no thumbnails needed
        updateUpload(id, { progress: 45 });

        // Combine IV + encrypted data
        const combined = new Uint8Array(
          fileIv.length + encryptedData.byteLength
        );
        combined.set(fileIv, 0);
        combined.set(new Uint8Array(encryptedData), fileIv.length);

        // Compute SHA1 hash for B2 verification (in worker - non-blocking)
        // Clone the buffer since transfer is destructive
        const sha1Data = combined.buffer.slice(0);

        // Compute SHA-1 hash - use worker with fallback to main thread for Safari compatibility
        let sha1Hash;
        try {
          const workerPool = getCryptoWorkerPool();
          sha1Hash = await workerPool.computeSHA1(sha1Data);
        } catch (workerError) {
          console.warn(
            '[useUpload] Worker SHA1 failed, using main thread:',
            workerError.message
          );
          // Fallback to main thread computation (Safari compatibility)
          sha1Hash = await computeSHA1MainThread(sha1Data);
        }

        // Create encrypted blob
        const encryptedBlob = new Blob([combined], {
          type: 'application/octet-stream',
        });
        updateUpload(id, { progress: 50 });

        // Add to upload queue with contentHash and folderId for backend storage
        uploadQueueRef.current.push({
          id,
          file,
          encryptedBlob,
          fileNameEncrypted,
          cipherFileKey,
          sha1Hash,
          thumbnailData,
          contentHash,
          folderId: uploadInfo.folderId || null,
        });

        // Trigger upload queue processing
        processUploadQueue();
      } catch (error) {
        console.error(`Encryption failed for ${file.name}:`, error);
        updateUpload(id, { status: UploadStatus.FAILED, error: error.message });
      } finally {
        encryptingCountRef.current--;
        processEncryptionQueue(); // Process next encryption
        checkIfAllDone();
      }
    },
    [
      getMasterKey,
      updateUpload,
      processUploadQueue,
      processEncryptionQueue,
      checkIfAllDone,
    ]
  );

  // Phase 2: Upload (Network-bound) - runs in parallel up to MAX_CONCURRENT_UPLOAD
  // Includes exponential backoff retry for 429/5xx errors (like ente.io)
  const processUpload = useCallback(
    async (encryptedItem) => {
      const {
        id,
        file,
        encryptedBlob,
        fileNameEncrypted,
        cipherFileKey,
        sha1Hash,
        thumbnailData,
        contentHash,
        folderId,
      } = encryptedItem;

      uploadingCountRef.current++;

      // Retry with exponential backoff
      const uploadWithRetry = async (attempt = 0) => {
        try {
          updateUpload(id, {
            status:
              attempt > 0 ? UploadStatus.RETRYING : UploadStatus.UPLOADING,
            progress: 50,
          });

          // Build form data
          const formData = new FormData();
          formData.append('file', encryptedBlob, 'encrypted');
          formData.append('fileNameEncrypted', fileNameEncrypted);
          formData.append('cipherFileKey', cipherFileKey);
          formData.append('mimeType', file.type);
          formData.append('sha1Hash', sha1Hash);
          if (contentHash) {
            formData.append('contentHash', contentHash);
          }
          if (folderId) {
            formData.append('folderId', folderId);
          }

          if (thumbnailData) {
            formData.append('thumbSmall', thumbnailData.thumbSmallBase64);
            formData.append('thumbMedium', thumbnailData.thumbMediumBase64);
            formData.append('thumbLarge', thumbnailData.thumbLargeBase64);
            formData.append('width', String(thumbnailData.width || 0));
            formData.append('height', String(thumbnailData.height || 0));
            if (thumbnailData.duration !== undefined) {
              formData.append('duration', String(thumbnailData.duration));
            }
          }

          // Use unified upload endpoint (handles both with/without thumbnails)
          const response = await api.post('/files/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
            onUploadProgress: (progressEvent) => {
              if (progressEvent.total) {
                const percent = Math.round(
                  (progressEvent.loaded * 100) / progressEvent.total
                );
                updateUpload(id, { progress: 50 + Math.round(percent * 0.5) });
              }
            },
          });

          updateUpload(id, {
            status: UploadStatus.COMPLETED,
            progress: 100,
            result: response.data,
          });

          // Notify parent immediately
          if (onFileUploadedRef.current) {
            onFileUploadedRef.current(response.data);
          }

          return true; // Success
        } catch (error) {
          const status = error.response?.status;
          const isRetryable =
            RETRY_CONFIG.retryableStatusCodes.includes(status);

          if (isRetryable && attempt < RETRY_CONFIG.maxRetries) {
            // Calculate delay with exponential backoff
            let delayMs =
              RETRY_CONFIG.initialDelayMs *
              Math.pow(RETRY_CONFIG.backoffMultiplier, attempt);

            // Check for Retry-After header (for 429 responses)
            const retryAfter = error.response?.headers?.['retry-after'];
            if (retryAfter) {
              const retrySeconds = parseInt(retryAfter, 10);
              if (!isNaN(retrySeconds)) {
                delayMs = retrySeconds * 1000;
                console.log(
                  `[useUpload] Rate limited. Server requested retry after ${retrySeconds}s`
                );
              }
            }

            // Cap at max delay
            delayMs = Math.min(delayMs, RETRY_CONFIG.maxDelayMs);

            console.log(
              `[useUpload] Upload failed (${status}), retrying in ${delayMs}ms (attempt ${
                attempt + 1
              }/${RETRY_CONFIG.maxRetries})`
            );

            updateUpload(id, {
              status: UploadStatus.RETRYING,
              error: `Retrying in ${Math.round(delayMs / 1000)}s... (attempt ${
                attempt + 1
              })`,
            });

            // Wait before retry
            await new Promise((resolve) => setTimeout(resolve, delayMs));

            // Retry
            return uploadWithRetry(attempt + 1);
          }

          // Non-retryable error or max retries exceeded
          throw error;
        }
      };

      try {
        await uploadWithRetry();
      } catch (error) {
        console.error(`Upload failed for ${file.name}:`, error);
        updateUpload(id, { status: UploadStatus.FAILED, error: error.message });
      } finally {
        uploadingCountRef.current--;
        processUploadQueue(); // Process next upload
        checkIfAllDone();
      }
    },
    [updateUpload, processUploadQueue, checkIfAllDone]
  );

  // Keep refs updated for async access
  useEffect(() => {
    processEncryptionRef.current = processEncryption;
    processUploadRef.current = processUpload;
  }, [processEncryption, processUpload]);

  // Add files to upload
  const uploadFiles = useCallback(
    async (files, { folderId } = {}) => {
      if (!masterKeyAvailable) {
        throw new Error('Please unlock your vault first');
      }

      const fileArray = Array.from(files);
      const newUploads = new Map();

      fileArray.forEach((file) => {
        const id = generateUUID();
        const uploadInfo = {
          id,
          file,
          name: file.name,
          size: file.size,
          type: file.type,
          status: UploadStatus.PENDING,
          progress: 0,
          error: null,
          result: null,
          folderId: folderId || null,
        };
        newUploads.set(id, uploadInfo);
        queueRef.current.push(uploadInfo);
      });

      setUploads((prev) => new Map([...prev, ...newUploads]));
      setIsUploading(true);

      // Start encryption queue processing
      processEncryptionQueue();

      return [...newUploads.keys()];
    },
    [masterKeyAvailable, processEncryptionQueue]
  );

  // Clear completed, duplicate and interrupted uploads
  const clearCompleted = useCallback(() => {
    setUploads((prev) => {
      const newMap = new Map();
      prev.forEach((upload, id) => {
        if (
          upload.status !== UploadStatus.COMPLETED &&
          upload.status !== UploadStatus.INTERRUPTED &&
          upload.status !== UploadStatus.DUPLICATE
        ) {
          newMap.set(id, upload);
        }
      });
      // Clear sessionStorage if no uploads left
      if (newMap.size === 0) {
        clearUploadState();
      }
      return newMap;
    });
  }, []);

  // Clear ALL uploads (for close button)
  const clearAllUploads = useCallback(() => {
    setUploads(new Map());
    clearUploadState();
  }, []);

  // Retry failed uploads (note: interrupted uploads can't be retried - File is lost)
  const retryFailed = useCallback(() => {
    setUploads((prev) => {
      const newMap = new Map(prev);
      prev.forEach((upload, id) => {
        if (upload.status === UploadStatus.FAILED && upload.file) {
          // Only retry if we still have the file reference
          const resetUpload = {
            ...upload,
            status: UploadStatus.PENDING,
            progress: 0,
            error: null,
          };
          newMap.set(id, resetUpload);
          queueRef.current.push(resetUpload);
        }
      });
      return newMap;
    });
    setIsUploading(true);
    processEncryptionQueue();
  }, [processEncryptionQueue]);

  // Cancel all
  const cancelAll = useCallback(() => {
    queueRef.current = [];
    uploadQueueRef.current = [];
    encryptingCountRef.current = 0;
    uploadingCountRef.current = 0;
    setUploads(new Map());
    setIsUploading(false);
    clearUploadState(); // Clear sessionStorage
  }, []);

  // Calculate stats from uploads
  const uploadsArray = [...uploads.values()];
  const stats = {
    total: uploads.size,
    queued: uploadsArray.filter((u) => u.status === UploadStatus.PENDING)
      .length,
    hashing: uploadsArray.filter((u) => u.status === UploadStatus.HASHING)
      .length,
    encrypting: uploadsArray.filter((u) => u.status === UploadStatus.ENCRYPTING)
      .length,
    uploading: uploadsArray.filter((u) => u.status === UploadStatus.UPLOADING)
      .length,
    retrying: uploadsArray.filter((u) => u.status === UploadStatus.RETRYING)
      .length,
    interrupted: uploadsArray.filter(
      (u) => u.status === UploadStatus.INTERRUPTED
    ).length,
    duplicate: uploadsArray.filter((u) => u.status === UploadStatus.DUPLICATE)
      .length,
    active: uploadsArray.filter(
      (u) =>
        u.status === UploadStatus.HASHING ||
        u.status === UploadStatus.ENCRYPTING ||
        u.status === UploadStatus.UPLOADING ||
        u.status === UploadStatus.RETRYING
    ).length,
    completed: uploadsArray.filter((u) => u.status === UploadStatus.COMPLETED)
      .length,
    failed: uploadsArray.filter(
      (u) =>
        u.status === UploadStatus.FAILED ||
        u.status === UploadStatus.INTERRUPTED
    ).length,
    overallProgress:
      uploads.size > 0
        ? Math.round(
            uploadsArray.reduce((sum, u) => sum + u.progress, 0) / uploads.size
          )
        : 0,
    activeTasks: uploadsArray
      .filter(
        (u) =>
          u.status === UploadStatus.HASHING ||
          u.status === UploadStatus.ENCRYPTING ||
          u.status === UploadStatus.UPLOADING ||
          u.status === UploadStatus.RETRYING ||
          u.status === UploadStatus.INTERRUPTED
      )
      .map((u) => ({
        id: u.id,
        name: u.name,
        status: u.status,
        progress: u.progress,
        error: u.error,
      })),
    cpuCores: CPU_CORES,
    maxEncrypt: MAX_CONCURRENT_ENCRYPT,
    maxUpload: MAX_CONCURRENT_UPLOAD,
  };

  return {
    uploadFiles,
    uploads,
    stats,
    isUploading,
    clearCompleted,
    clearAllUploads,
    retryFailed,
    cancelAll,
  };
}

// Helper: Encrypt thumbnails and return base64 strings (backend expects base64)
async function encryptThumbnails(thumbs, masterKey, fileKey) {
  const smallData = await thumbs.small.arrayBuffer();
  const mediumData = await thumbs.medium.arrayBuffer();
  const largeData = await thumbs.large.arrayBuffer();

  // Encrypt thumbnails with file key (unified approach)
  const { encryptedData: smallEnc, iv: smallIv } = await encryptFile(
    smallData,
    fileKey  // Use file key instead of master key
  );
  const { encryptedData: mediumEnc, iv: mediumIv } = await encryptFile(
    mediumData,
    fileKey  // Use file key instead of master key
  );
  const { encryptedData: largeEnc, iv: largeIv } = await encryptFile(
    largeData,
    fileKey  // Use file key instead of master key
  );

  // Combine IV + encrypted data and convert to base64
  const smallCombined = new Uint8Array(smallIv.length + smallEnc.byteLength);
  smallCombined.set(smallIv, 0);
  smallCombined.set(new Uint8Array(smallEnc), smallIv.length);

  const mediumCombined = new Uint8Array(mediumIv.length + mediumEnc.byteLength);
  mediumCombined.set(mediumIv, 0);
  mediumCombined.set(new Uint8Array(mediumEnc), mediumIv.length);

  const largeCombined = new Uint8Array(largeIv.length + largeEnc.byteLength);
  largeCombined.set(largeIv, 0);
  largeCombined.set(new Uint8Array(largeEnc), largeIv.length);

  return {
    thumbSmallBase64: arrayBufferToBase64(smallCombined),
    thumbMediumBase64: arrayBufferToBase64(mediumCombined),
    thumbLargeBase64: arrayBufferToBase64(largeCombined),
    width: thumbs.width,
    height: thumbs.height,
    duration: thumbs.duration,
  };
}

export default useUpload;
