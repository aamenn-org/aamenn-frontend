/**
 * useUpload Hook — High-performance upload with chunked large-file support.
 *
 * Features:
 * - Two paths: proxy upload (<100 MB) and direct-to-B2 chunked upload (≥100 MB)
 * - Parallel encryption pipeline (uses all CPU cores)
 * - Per-upload pause / resume / cancel with AbortController
 * - Real-time speed and ETA tracking via SpeedTracker
 * - IndexedDB persistence for chunked upload resume across sessions
 * - Exponential backoff retry for 429/5xx errors
 * - Rate-limit and Retry-After header awareness
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useAuth } from '../context';
import api from '../services/api';
import fileService from '../services/file.service';
import {
  getFileType,
  FILE_HANDLERS,
} from '../utils/thumbnail';
import { encryptFile, arrayBufferToBase64 } from '../utils/crypto';
import cryptoService from '../services/crypto.service';
import { isSafari } from '../utils/browser.js';
import { SpeedTracker } from '../utils/speed-tracker.js';
import { uploadPersistence } from '../services/upload-persistence.js';
import {
  uploadChunked,
  chooseInitialChunkSize,
  calculateTotalParts,
} from '../services/chunked-upload.service.js';

// ─── Device detection ────────────────────────────────────────
const IS_MOBILE = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

// ─── Constants ──────────────────────────────────────────────
const CPU_CORES = navigator.hardwareConcurrency || 4;

// Mobile: encrypt 1 at a time to avoid RAM exhaustion + thermal throttle
// Desktop: use all cores
const MAX_CONCURRENT_ENCRYPT = IS_MOBILE ? 1 : CPU_CORES;

// Mobile: max 2 parallel uploads (mobile network can't sustain more)
// Desktop: up to 8 parallel uploads
const MAX_CONCURRENT_PROXY_UPLOAD = IS_MOBILE ? 2 : Math.min(CPU_CORES, 8);

const CHUNKED_THRESHOLD = 100 * 1024 * 1024; // 100 MB

const RETRY_CONFIG = {
  maxRetries: 6,                // more retries on mobile network drops
  initialDelayMs: 1000,
  maxDelayMs: 60000,
  backoffMultiplier: 2,
  retryableStatusCodes: [429, 500, 502, 503, 504],
};

const MIN_UPDATE_INTERVAL = IS_MOBILE ? 500 : 250; // less UI thrash on mobile

console.log(
  `[useUpload] ${IS_MOBILE ? 'MOBILE' : 'DESKTOP'} | ${CPU_CORES} cores | encrypt×${MAX_CONCURRENT_ENCRYPT} | proxy-upload×${MAX_CONCURRENT_PROXY_UPLOAD} | chunked≥${CHUNKED_THRESHOLD / 1024 / 1024}MB`
);

const generateUUID = () => crypto.randomUUID();

// ─── Upload statuses ────────────────────────────────────────
export const UploadStatus = {
  PENDING: 'pending',
  HASHING: 'hashing',
  DUPLICATE: 'duplicate',
  ENCRYPTING: 'encrypting',
  UPLOADING: 'uploading',
  PAUSED: 'paused',
  COMPLETED: 'completed',
  FAILED: 'failed',
  RETRYING: 'retrying',
  INTERRUPTED: 'interrupted',
};

// ═══════════════════════════════════════════════════════════
// Hook
// ═══════════════════════════════════════════════════════════
export function useUpload({ onFileUploaded } = {}) {
  const { getMasterKey, masterKeyAvailable } = useAuth();

  const [uploads, setUploads] = useState(() => new Map());
  const [isUploading, setIsUploading] = useState(false);

  const encryptingCountRef = useRef(0);
  const uploadingCountRef = useRef(0);
  const queueRef = useRef([]);
  const uploadQueueRef = useRef([]);
  const onFileUploadedRef = useRef(onFileUploaded);

  // Per-upload controls: Map<uploadId, { abortController, speedTracker, isPaused, serverSessionId }>
  const controlsRef = useRef(new Map());

useEffect(() => { onFileUploadedRef.current = onFileUploaded; }, [onFileUploaded]);

  // Warn before unload (desktop only — mobile never fires this)
  useEffect(() => {
    const handler = (e) => {
      if (isUploading) { e.preventDefault(); e.returnValue = ''; return ''; }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isUploading]);

  // ─── Helpers ────────────────────────────────────────────
  const updateUpload = useCallback((id, updates) => {
    setUploads((prev) => {
      const newMap = new Map(prev);
      const existing = newMap.get(id);
      if (existing) newMap.set(id, { ...existing, ...updates });
      return newMap;
    });
  }, []);

  const lastUpdateTimeRef = useRef(new Map());
  const throttledUpdate = useCallback((id, updates) => {
    const now = Date.now();
    const last = lastUpdateTimeRef.current.get(id) || 0;
    if (now - last < MIN_UPDATE_INTERVAL) return;
    lastUpdateTimeRef.current.set(id, now);
    updateUpload(id, updates);
  }, [updateUpload]);

  const processEncryptionRef = useRef(null);
  const processUploadRef = useRef(null);

  const processEncryptionQueue = useCallback(() => {
    while (encryptingCountRef.current < MAX_CONCURRENT_ENCRYPT && queueRef.current.length > 0) {
      const item = queueRef.current.shift();
      if (item && processEncryptionRef.current) {
        encryptingCountRef.current++; // increment synchronously before async body starts
        processEncryptionRef.current(item);
      }
    }
  }, []);

  const processUploadQueue = useCallback(() => {
    while (uploadingCountRef.current < MAX_CONCURRENT_PROXY_UPLOAD && uploadQueueRef.current.length > 0) {
      const item = uploadQueueRef.current.shift();
      if (item && processUploadRef.current) {
        uploadingCountRef.current++; // increment synchronously before async body starts
        processUploadRef.current(item);
      }
    }
  }, []);

  const checkIfAllDone = useCallback(() => {
    // Re-drain queues first — critical on mobile where a suspended tab
    // may have left items in the queue with slots now free
    if (queueRef.current.length > 0 && encryptingCountRef.current < MAX_CONCURRENT_ENCRYPT) {
      processEncryptionQueue();
      return;
    }
    if (uploadQueueRef.current.length > 0 && uploadingCountRef.current < MAX_CONCURRENT_PROXY_UPLOAD) {
      processUploadQueue();
      return;
    }
    if (
      encryptingCountRef.current === 0 &&
      uploadingCountRef.current === 0 &&
      queueRef.current.length === 0 &&
      uploadQueueRef.current.length === 0
    ) {
      setIsUploading(false);
    }
  }, [processEncryptionQueue, processUploadQueue]);

  // ─── Page Visibility: pause on hide, resume on show (critical for mobile) ──
  const isPageHiddenRef = useRef(false);
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // Page is being backgrounded/locked — mark it so we know
        isPageHiddenRef.current = true;
      } else if (document.visibilityState === 'visible') {
        // Page came back — if uploads were in progress, re-drain queues
        if (isPageHiddenRef.current) {
          isPageHiddenRef.current = false;
          // Give the network stack 800ms to re-establish before retrying
          setTimeout(() => {
            processEncryptionQueue();
            processUploadQueue();
          }, 800);
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [processEncryptionQueue, processUploadQueue]);

  // ─── Network recovery: resume queues when connection comes back ──────────
  useEffect(() => {
    const handleOnline = () => {
      if (isUploading) {
        // Wait for network to stabilize then re-drain
        setTimeout(() => {
          processEncryptionQueue();
          processUploadQueue();
        }, 1000);
      }
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [isUploading, processEncryptionQueue, processUploadQueue]);



  // ─── Phase 1: Hash + Encrypt ─────────────────────────────
  const processEncryption = useCallback(async (uploadInfo) => {
    const { id, file } = uploadInfo;
    const masterKey = getMasterKey();

    if (!masterKey) {
      updateUpload(id, { status: UploadStatus.FAILED, error: 'No master key available' });
      checkIfAllDone();
      return;
    }

    try {
      updateUpload(id, { status: UploadStatus.HASHING, progress: 2 });

let fileData;
      try {
        // On mobile, arrayBuffer() can silently fail on large files due to RAM limits.
        // FileReader is more memory-efficient on iOS/Android as it streams internally.
        if (IS_MOBILE) {
          fileData = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(new Error('FileReader failed'));
            reader.readAsArrayBuffer(file);
          });
        } else {
          fileData = await file.arrayBuffer();
        }
      } catch {
        // Final fallback for both platforms
        fileData = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error('FileReader failed'));
          reader.readAsArrayBuffer(file);
        });
      }

      // Pass fileData directly — no .slice(0) copy needed (not mutated)
      const contentHash = await cryptoService.computeSHA256(fileData);
      updateUpload(id, { progress: 5 });

      // Duplicate check
      try {
        const dup = await fileService.checkDuplicate(contentHash);
        if (dup.isDuplicate) {
          updateUpload(id, {
            status: UploadStatus.DUPLICATE,
            progress: 100,
            error: 'File already uploaded (exists in your library)',
            existingFileId: dup.existingFile?.id,
          });
          encryptingCountRef.current--;
          processEncryptionQueue();
          checkIfAllDone();
          return;
        }
      } catch {
        // Fail-safe: continue upload
      }

      updateUpload(id, { status: UploadStatus.ENCRYPTING, progress: 10 });

      const fileKey = await cryptoService.generateFileKey();
      updateUpload(id, { progress: 15 });

      const { encryptedData, iv: fileIv } = await encryptFile(fileData, fileKey);
      fileData = null; // Free RAM: raw file bytes no longer needed after encryption
      const cipherFileKey = await cryptoService.encryptFileKey(fileKey, masterKey);
      const fileNameEncrypted = await cryptoService.encryptFilename(file.name, masterKey);
      updateUpload(id, { progress: 35 });

      // Thumbnails
      let thumbnailData = null;
      const fileType = getFileType(file.type);
      const handler = FILE_HANDLERS[fileType];
      if (handler.generateThumbnails) {
        try {
          const thumbs = await handler.generateThumbnails(file);
          thumbnailData = await encryptThumbnails(thumbs, masterKey, fileKey);
        } catch (e) {
          console.warn(`${fileType} thumbnail generation failed — uploading without thumbnails:`, e);
          thumbnailData = null;
        }
      }
      updateUpload(id, { progress: 45 });

      // Combine IV + encrypted data into one buffer for upload
      const combined = new Uint8Array(fileIv.length + encryptedData.byteLength);
      combined.set(fileIv, 0);
      combined.set(new Uint8Array(encryptedData), fileIv.length);

      // Create the blob FIRST — Blob snapshots bytes at construction time.
      // computeSHA1 transfers combined.buffer to a worker (detaching it from the
      // main thread), so the blob must exist before that transfer happens.
      const encryptedBlob = new Blob([combined], { type: 'application/octet-stream' });

      const sha1Hash = await cryptoService.computeSHA1(combined.buffer);
      updateUpload(id, { progress: 50 });

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

      processUploadQueue();
    } catch (error) {
      console.error(`Encryption failed for ${file.name}:`, error);
      updateUpload(id, { status: UploadStatus.FAILED, error: error.message });
    } finally {
      encryptingCountRef.current--;
      processEncryptionQueue();
      checkIfAllDone();
    }
  }, [getMasterKey, updateUpload, processUploadQueue, processEncryptionQueue, checkIfAllDone]);

  // ─── Phase 2: Upload (proxy path for small files) ─────────
  const processProxyUpload = useCallback(async (encryptedItem) => {
    const {
      id, file, encryptedBlob, fileNameEncrypted, cipherFileKey,
      sha1Hash, thumbnailData, contentHash, folderId,
    } = encryptedItem;

    const ctrl = controlsRef.current.get(id) || {};
    const speedTracker = ctrl.speedTracker || new SpeedTracker();
    const abortController = new AbortController();
    controlsRef.current.set(id, { ...ctrl, abortController, speedTracker, isPaused: false });

    const uploadWithRetry = async (attempt = 0) => {
      if (abortController.signal.aborted) throw new DOMException('Aborted', 'AbortError');

      updateUpload(id, {
        status: attempt > 0 ? UploadStatus.RETRYING : UploadStatus.UPLOADING,
        progress: 50,
      });

      const formData = new FormData();
      formData.append('file', encryptedBlob, 'encrypted');
      formData.append('fileNameEncrypted', fileNameEncrypted);
      formData.append('cipherFileKey', cipherFileKey);
      formData.append('mimeType', file.type);
      formData.append('sha1Hash', sha1Hash);
      if (contentHash) formData.append('contentHash', contentHash);
      if (folderId) formData.append('folderId', folderId);
      if (thumbnailData) {
        formData.append('thumbSmall', thumbnailData.thumbSmallBase64);
        formData.append('thumbMedium', thumbnailData.thumbMediumBase64);
        formData.append('thumbLarge', thumbnailData.thumbLargeBase64);
        formData.append('width', String(thumbnailData.width || 0));
        formData.append('height', String(thumbnailData.height || 0));
        if (thumbnailData.duration !== undefined) formData.append('duration', String(thumbnailData.duration));
      }

      try {
        const response = await api.post('/files/upload', formData, {
          signal: abortController.signal,
          onUploadProgress: (e) => {
            if (e.total) {
              const bytesUp = e.loaded;
              speedTracker.addSample(bytesUp);
              const pct = 50 + Math.round((e.loaded * 50) / e.total);
              throttledUpdate(id, {
                progress: pct,
                bytesUploaded: bytesUp,
                speed: speedTracker.getSpeedBps(),
                eta: speedTracker.getEtaSeconds(e.total - e.loaded),
              });
            }
          },
        });

        updateUpload(id, {
          status: UploadStatus.COMPLETED,
          progress: 100,
          bytesUploaded: encryptedBlob.size,
          speed: 0,
          eta: 0,
          result: response.data,
        });
        if (onFileUploadedRef.current) onFileUploadedRef.current(response.data);
} catch (error) {
        if (error.name === 'AbortError' || error.code === 'ERR_CANCELED') throw error;

        const status = error.response?.status;

        // Network drop has no status (undefined) — always retry these on mobile
        const isNetworkError = !error.response && (
          error.code === 'ERR_NETWORK' ||
          error.message === 'Network Error' ||
          error instanceof TypeError
        );

        const isRetryable =
          isNetworkError ||
          RETRY_CONFIG.retryableStatusCodes.includes(status);

        if (isRetryable && attempt < RETRY_CONFIG.maxRetries) {
          let delayMs = RETRY_CONFIG.initialDelayMs * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt);
          const retryAfter = error.response?.headers?.['retry-after'];
          if (retryAfter) {
            const s = parseInt(retryAfter, 10);
            if (!isNaN(s)) delayMs = s * 1000;
          }
          delayMs = Math.min(delayMs, RETRY_CONFIG.maxDelayMs);

          // On network error, wait for online event OR timeout — whichever first
          if (isNetworkError && !navigator.onLine) {
            await new Promise((resolve) => {
              const onOnline = () => { window.removeEventListener('online', onOnline); resolve(); };
              window.addEventListener('online', onOnline);
              // Fallback timeout in case online event never fires
              setTimeout(resolve, delayMs);
            });
          } else {
            updateUpload(id, { status: UploadStatus.RETRYING, error: `Retrying in ${Math.round(delayMs / 1000)}s...` });
            await new Promise((r) => setTimeout(r, delayMs));
          }

          return uploadWithRetry(attempt + 1);
        }
        throw error;
      }
    }

    try {
      await uploadWithRetry();
    } catch (error) {
      if (error.name === 'AbortError' || error.code === 'ERR_CANCELED') {
        // Paused or cancelled — don't mark as failed
        return;
      }
      console.error(`Upload failed for ${file.name}:`, error);
      const errMsg = error.code && error.code !== error.message
        ? `[HTTP ${error.code}] ${error.message}`
        : error.message;
      updateUpload(id, { status: UploadStatus.FAILED, error: errMsg });
    } finally {
      uploadingCountRef.current--;
      processUploadQueue();
      checkIfAllDone();
    }
  }, [updateUpload, throttledUpdate, processUploadQueue, checkIfAllDone]);

  // ─── Phase 2b: Chunked upload (large files, direct-to-B2) ──
  const processChunkedUpload = useCallback(async (encryptedItem) => {
    const {
      id, file, encryptedBlob, fileNameEncrypted, cipherFileKey,
      thumbnailData, contentHash, folderId,
    } = encryptedItem;

    const speedTracker = new SpeedTracker();
    const abortController = new AbortController();
    controlsRef.current.set(id, { abortController, speedTracker, isPaused: false, serverSessionId: null });

    try {
      updateUpload(id, { status: UploadStatus.UPLOADING, progress: 50 });

      const initialChunkSize = chooseInitialChunkSize(encryptedBlob.size);
      const totalParts = calculateTotalParts(encryptedBlob.size, initialChunkSize);

      // Start session on backend
      const session = await fileService.startChunkedUpload({
        fileNameEncrypted,
        cipherFileKey,
        mimeType: file.type || null,
        totalBytes: encryptedBlob.size,
        chunkSizeBytes: initialChunkSize,
        totalParts,
        contentHash: contentHash || undefined,
        folderId: folderId || undefined,
        width: thumbnailData?.width || undefined,
        height: thumbnailData?.height || undefined,
        duration: thumbnailData?.duration || undefined,
      });

      const serverSessionId = session.uploadId;
      controlsRef.current.get(id).serverSessionId = serverSessionId;

      updateUpload(id, {
        chunksTotal: totalParts,
        chunksCompleted: 0,
        totalBytes: encryptedBlob.size,
        bytesUploaded: 0,
        serverSessionId,
      });

      // Persist to IndexedDB for resume
      await uploadPersistence.saveSession(id, {
        serverSessionId,
        fileName: file.name,
        fileSize: file.size,
        totalParts,
        chunkSizeBytes: initialChunkSize,
        completedParts: [],
        status: 'active',
      });

      let completedCount = 0;

      const sha1Array = await uploadChunked({
        serverSessionId,
        b2FileId: session.b2FileId,
        encryptedBlob,
        totalParts,
        initialChunkSize,
        signal: abortController.signal,
        onChunkProgress: (loaded, total) => {
          const prevBytes = completedCount * initialChunkSize;
          const currentBytes = Math.min(loaded, total);
          speedTracker.addSample(prevBytes + currentBytes);

          const totalUp = prevBytes + currentBytes;
          const remaining = encryptedBlob.size - totalUp;
          const pct = 50 + Math.round((totalUp / encryptedBlob.size) * 50);

          throttledUpdate(id, {
            progress: pct,
            bytesUploaded: totalUp,
            speed: speedTracker.getSpeedBps(),
            eta: speedTracker.getEtaSeconds(remaining),
          });
        },
        onChunkComplete: (partNumber) => {
          completedCount++;
          updateUpload(id, { chunksCompleted: completedCount });
          uploadPersistence.saveSession(id, {
            serverSessionId,
            fileName: file.name,
            fileSize: file.size,
            totalParts,
            chunkSizeBytes: initialChunkSize,
            completedParts: Array.from({ length: completedCount }, (_, i) => i + 1),
            status: 'active',
          }).catch(() => {});
        },
        onTotalProgress: (totalBytesUploaded) => {
          // Additional aggregate update if needed
        },
      });

      // Complete: finish large file on backend + create File record
      const completeData = { partSha1Array: sha1Array };
      if (thumbnailData) {
        completeData.thumbSmall = thumbnailData.thumbSmallBase64;
        completeData.thumbMedium = thumbnailData.thumbMediumBase64;
        completeData.thumbLarge = thumbnailData.thumbLargeBase64;
      }

      const result = await fileService.completeChunkedUpload(serverSessionId, completeData);

      updateUpload(id, {
        status: UploadStatus.COMPLETED,
        progress: 100,
        bytesUploaded: encryptedBlob.size,
        speed: 0,
        eta: 0,
        result,
      });

      await uploadPersistence.removeSession(id);
      if (onFileUploadedRef.current) onFileUploadedRef.current(result);

    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        // Paused or cancelled — don't mark as failed
        return;
      }
      console.error(`Chunked upload failed for ${file.name}:`, error);
      updateUpload(id, { status: UploadStatus.FAILED, error: error.message });
    } finally {
      uploadingCountRef.current--;
      processUploadQueue();
      checkIfAllDone();
    }
  }, [updateUpload, throttledUpdate, processUploadQueue, checkIfAllDone]);

  // ─── Router: choose proxy vs chunked based on encrypted size ──
  const processUpload = useCallback((encryptedItem) => {
    if (encryptedItem.encryptedBlob.size >= CHUNKED_THRESHOLD) {
      processChunkedUpload(encryptedItem);
    } else {
      processProxyUpload(encryptedItem);
    }
  }, [processChunkedUpload, processProxyUpload]);

  // Keep refs updated
  useEffect(() => {
    processEncryptionRef.current = processEncryption;
    processUploadRef.current = processUpload;
  }, [processEncryption, processUpload]);

  // ─── Public: add files ────────────────────────────────────
  const uploadFiles = useCallback(async (files, { folderId } = {}) => {
    if (!masterKeyAvailable) throw new Error('Please unlock your vault first');

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
        bytesUploaded: 0,
        totalBytes: file.size,
        speed: 0,
        eta: null,
        chunksCompleted: 0,
        chunksTotal: 0,
        serverSessionId: null,
      };
      newUploads.set(id, uploadInfo);
      controlsRef.current.set(id, {
        abortController: new AbortController(),
        speedTracker: new SpeedTracker(),
        isPaused: false,
        serverSessionId: null,
      });
      queueRef.current.push(uploadInfo);
    });

    setUploads((prev) => new Map([...prev, ...newUploads]));
    setIsUploading(true);
    processEncryptionQueue();

    return [...newUploads.keys()];
  }, [masterKeyAvailable, processEncryptionQueue]);

  // ─── Per-upload controls ──────────────────────────────────
  const pauseUpload = useCallback((uploadId) => {
    const ctrl = controlsRef.current.get(uploadId);
    if (!ctrl) return;

    ctrl.isPaused = true;
    ctrl.abortController.abort();
    updateUpload(uploadId, { status: UploadStatus.PAUSED });
  }, [updateUpload]);

  const resumeUpload = useCallback(async (uploadId) => {
    const upload = uploads.get(uploadId);
    const ctrl = controlsRef.current.get(uploadId);
    if (!upload || !ctrl || upload.status !== UploadStatus.PAUSED) return;

    // Create fresh abort controller
    ctrl.abortController = new AbortController();
    ctrl.isPaused = false;
    ctrl.speedTracker.reset();

    // For chunked uploads: re-enqueue with remaining chunks
    if (upload.serverSessionId) {
      updateUpload(uploadId, { status: UploadStatus.UPLOADING });

      // Get server-confirmed state
      try {
        const status = await fileService.getUploadStatus(upload.serverSessionId);
        const confirmedParts = new Set(status.completedParts.map((p) => p.partNumber));

        // Re-start the chunked upload with skipParts
        uploadingCountRef.current++;
        const encryptedItem = {
          id: uploadId,
          file: upload.file,
          encryptedBlob: upload.file, // Will need re-encryption — see note below
          fileNameEncrypted: '', // Already stored on server session
          cipherFileKey: '',
          thumbnailData: null,
          contentHash: null,
          folderId: null,
          serverSessionId: upload.serverSessionId,
          resumeSkipParts: confirmedParts,
        };

        // For resume, we'd need the encrypted blob still in memory.
        // If the blob is gone (tab was refreshed), we can't resume from this hook.
        // The full resume-after-refresh flow is handled by useResumeUploads.
        // Here we only handle pause/resume within the same session where the blob is still in memory.
        if (!upload.file) {
          updateUpload(uploadId, { status: UploadStatus.FAILED, error: 'File reference lost. Cannot resume.' });
          uploadingCountRef.current--;
          checkIfAllDone();
          return;
        }

        // Re-queue for processing
        updateUpload(uploadId, {
          status: UploadStatus.UPLOADING,
          chunksCompleted: confirmedParts.size,
        });
      } catch (err) {
        updateUpload(uploadId, { status: UploadStatus.FAILED, error: 'Failed to resume: ' + err.message });
      }
    } else {
      // Small file: re-encrypt and re-upload
      const uploadInfo = { ...upload, status: UploadStatus.PENDING, progress: 0 };
      queueRef.current.push(uploadInfo);
      updateUpload(uploadId, { status: UploadStatus.PENDING, progress: 0 });
      setIsUploading(true);
      processEncryptionQueue();
    }
  }, [uploads, updateUpload, processEncryptionQueue, checkIfAllDone]);

  const cancelUpload = useCallback(async (uploadId) => {
    const ctrl = controlsRef.current.get(uploadId);

    // Abort in-flight requests
    if (ctrl) {
      ctrl.abortController.abort();
      controlsRef.current.delete(uploadId);
    }

    // Cancel server-side session (chunked uploads)
    const upload = uploads.get(uploadId);
    if (upload?.serverSessionId) {
      fileService.cancelChunkedUpload(upload.serverSessionId).catch(() => {});
    }

    // Clean up IndexedDB
    await uploadPersistence.removeSession(uploadId);

    // Remove from UI
    setUploads((prev) => {
      const next = new Map(prev);
      next.delete(uploadId);
      return next;
    });

    checkIfAllDone();
  }, [uploads, checkIfAllDone]);

  // ─── Global controls ──────────────────────────────────────
  const pauseAll = useCallback(() => {
    uploads.forEach((upload, id) => {
      if (upload.status === UploadStatus.UPLOADING || upload.status === UploadStatus.RETRYING) {
        pauseUpload(id);
      }
    });
  }, [uploads, pauseUpload]);

  const resumeAll = useCallback(() => {
    uploads.forEach((upload, id) => {
      if (upload.status === UploadStatus.PAUSED) {
        resumeUpload(id);
      }
    });
  }, [uploads, resumeUpload]);

  const cancelAll = useCallback(() => {
    // Abort everything
    controlsRef.current.forEach((ctrl) => ctrl.abortController.abort());
    controlsRef.current.clear();

    // Cancel server sessions
    uploads.forEach((upload) => {
      if (upload.serverSessionId) {
        fileService.cancelChunkedUpload(upload.serverSessionId).catch(() => {});
      }
    });

    queueRef.current = [];
    uploadQueueRef.current = [];
    encryptingCountRef.current = 0;
    uploadingCountRef.current = 0;

    setUploads(new Map());
    setIsUploading(false);
    uploadPersistence.clearAll().catch(() => {});
  }, [uploads]);

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
      return newMap;
    });
  }, []);

  const clearAllUploads = useCallback(() => {
    cancelAll();
  }, [cancelAll]);

  const retryFailed = useCallback(() => {
    setUploads((prev) => {
      const newMap = new Map(prev);
      prev.forEach((upload, id) => {
        if (upload.status === UploadStatus.FAILED && upload.file) {
          const reset = {
            ...upload,
            status: UploadStatus.PENDING,
            progress: 0,
            error: null,
            bytesUploaded: 0,
            speed: 0,
            eta: null,
            chunksCompleted: 0,
          };
          newMap.set(id, reset);
          controlsRef.current.set(id, {
            abortController: new AbortController(),
            speedTracker: new SpeedTracker(),
            isPaused: false,
            serverSessionId: null,
          });
          queueRef.current.push(reset);
        }
      });
      return newMap;
    });
    setIsUploading(true);
    processEncryptionQueue();
  }, [processEncryptionQueue]);

  // ─── Stats (single-pass for performance) ──────────────────
  const uploadsArray = [...uploads.values()];
  let queued = 0, hashing = 0, encrypting = 0, uploading = 0, paused = 0;
  let retrying = 0, interrupted = 0, duplicate = 0, completed = 0, failed = 0;
  let active = 0, totalBytes = 0, totalBytesUploaded = 0, aggregateSpeed = 0;
  let maxEta = 0, progressSum = 0;
  const activeTasks = [];

  for (const u of uploadsArray) {
    progressSum += u.progress;
    totalBytes += (u.totalBytes || u.size || 0);
    totalBytesUploaded += (u.bytesUploaded || 0);

    switch (u.status) {
      case UploadStatus.PENDING: queued++; break;
      case UploadStatus.HASHING: hashing++; active++; break;
      case UploadStatus.ENCRYPTING: encrypting++; active++; break;
      case UploadStatus.UPLOADING: uploading++; active++; aggregateSpeed += (u.speed || 0); if (u.eta > maxEta) maxEta = u.eta; break;
      case UploadStatus.PAUSED: paused++; break;
      case UploadStatus.RETRYING: retrying++; active++; break;
      case UploadStatus.INTERRUPTED: interrupted++; failed++; break;
      case UploadStatus.DUPLICATE: duplicate++; break;
      case UploadStatus.COMPLETED: completed++; break;
      case UploadStatus.FAILED: failed++; break;
    }

    if ([UploadStatus.HASHING, UploadStatus.ENCRYPTING, UploadStatus.UPLOADING, UploadStatus.RETRYING, UploadStatus.PAUSED].includes(u.status)) {
      activeTasks.push({
        id: u.id, name: u.name, status: u.status, progress: u.progress,
        error: u.error, speed: u.speed, eta: u.eta,
        chunksCompleted: u.chunksCompleted, chunksTotal: u.chunksTotal,
        bytesUploaded: u.bytesUploaded, totalBytes: u.totalBytes || u.size,
      });
    }
  }

  const stats = {
    total: uploads.size,
    queued, hashing, encrypting, uploading, paused, retrying,
    interrupted, duplicate, completed, failed, active,
    overallProgress: uploads.size > 0 ? Math.round(progressSum / uploads.size) : 0,
    totalBytes,
    totalBytesUploaded,
    aggregateSpeed,
    aggregateEta: aggregateSpeed > 0 ? (totalBytes - totalBytesUploaded) / aggregateSpeed : Infinity,
    activeTasks,
    cpuCores: CPU_CORES,
    maxEncrypt: MAX_CONCURRENT_ENCRYPT,
    maxUpload: MAX_CONCURRENT_PROXY_UPLOAD,
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
    pauseUpload,
    resumeUpload,
    cancelUpload,
    pauseAll,
    resumeAll,
  };
}

// ═══════════════════════════════════════════════════════════
// Helper: Encrypt thumbnails → base64 (backend expects base64)
// ═══════════════════════════════════════════════════════════
async function encryptThumbnails(thumbs, masterKey, fileKey) {
  const smallData = await thumbs.small.arrayBuffer();
  const mediumData = await thumbs.medium.arrayBuffer();
  const largeData = await thumbs.large.arrayBuffer();

  const { encryptedData: smallEnc, iv: smallIv } = await encryptFile(smallData, fileKey);
  const { encryptedData: mediumEnc, iv: mediumIv } = await encryptFile(mediumData, fileKey);
  const { encryptedData: largeEnc, iv: largeIv } = await encryptFile(largeData, fileKey);

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
