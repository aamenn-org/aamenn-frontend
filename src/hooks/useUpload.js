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

const CHUNKED_THRESHOLD = 25 * 1024 * 1024; // 25 MB — above this, use direct-to-B2 chunked upload

// Streaming encryption: plaintext chunk size for large files.
// Each plaintext chunk is encrypted independently (AES-256-GCM) and uploaded as one B2 part.
// Peak RAM = ~2× this value (one plaintext slice + one ciphertext) regardless of total file size.
const PLAIN_CHUNK_SIZE = 10 * 1024 * 1024; // 10 MB plaintext per B2 part

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
  const processStreamEncryptUploadRef = useRef(null);

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

    // Large files: stream-encrypt chunk-by-chunk to avoid OOM.
    // processStreamEncryptUpload manages encryptingCountRef itself.
    if (file.size >= CHUNKED_THRESHOLD) {
      processStreamEncryptUploadRef.current(uploadInfo);
      return;
    }

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

      // slice(0) creates a copy: computeSHA256 transfers the buffer to a worker
      // (detaching it), so the original fileData must stay intact for encryptFile().
      const contentHash = await cryptoService.computeSHA256(fileData.slice(0));
      updateUpload(id, { progress: 5 });

      // Duplicate check
      try {
        const dup = await fileService.checkDuplicate(contentHash);
        if (dup.isDuplicate) {
          updateUpload(id, {
            status: UploadStatus.DUPLICATE,
            progress: 100,
            bytesUploaded: file.size,
            error: 'File already uploaded (exists in your library)',
            existingFileId: dup.existingFile?.id,
          });
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
      // Align totalBytes to the encrypted blob size so bytesUploaded and totalBytes
      // always live in the same unit space (encrypted bytes, not original file bytes).
      updateUpload(id, { progress: 50, totalBytes: encryptedBlob.size });

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
              // Map FormData transfer progress onto the encrypted blob size.
              // e.loaded / e.total is the true transfer fraction, but e.loaded itself is
              // FormData bytes (file  + thumbnails + metadata fields) which is always
              // larger than encryptedBlob.size. Using raw e.loaded as bytesUploaded
              // causes it to exceed totalBytes during the upload, then snap back DOWN
              // to encryptedBlob.size on completion — creating a visible regression and
              // an empty-looking progress bar at the end.
              const bytesUp = Math.round((e.loaded / e.total) * encryptedBlob.size);
              speedTracker.addSample(bytesUp);
              const pct = 50 + Math.round((e.loaded * 50) / e.total);
              throttledUpdate(id, {
                progress: pct,
                bytesUploaded: bytesUp,
                speed: speedTracker.getSpeedBps(),
                eta: speedTracker.getEtaSeconds(encryptedBlob.size - bytesUp),
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
      // Resume fields (set only when resuming a paused upload):
      _resumeSessionId,
      _resumeSkipParts,
      _resumeChunkSize,
    } = encryptedItem;

    const isResume = !!_resumeSessionId;
    const speedTracker = new SpeedTracker();
    const abortController = new AbortController();

    // Preserve encryptedBlob / thumbnailData already on ctrl (resume puts them there)
    const existingCtrl = controlsRef.current.get(id) || {};
    controlsRef.current.set(id, {
      ...existingCtrl,
      abortController,
      speedTracker,
      isPaused: false,
      serverSessionId: _resumeSessionId || null,
    });

    try {
      updateUpload(id, { status: UploadStatus.UPLOADING, progress: 50 });

      let serverSessionId;
      let initialChunkSize;
      let totalParts;
      let resumeSkipParts = _resumeSkipParts || new Set();
      let b2FileId;

      if (isResume) {
        // ── RESUME existing session ──────────────────────────
        serverSessionId = _resumeSessionId;
        initialChunkSize = _resumeChunkSize;
        totalParts = calculateTotalParts(encryptedBlob.size, initialChunkSize);
        b2FileId = null; // not needed — backend resolves from session
      } else {
        // ── NEW session ──────────────────────────────────────
        initialChunkSize = chooseInitialChunkSize(encryptedBlob.size);
        totalParts = calculateTotalParts(encryptedBlob.size, initialChunkSize);

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

        serverSessionId = session.uploadId;
        b2FileId = session.b2FileId;
      }

      // Store resume-critical data in controlsRef (survives pause)
      const ctrl = controlsRef.current.get(id);
      ctrl.serverSessionId = serverSessionId;
      ctrl.encryptedBlob = encryptedBlob;
      ctrl.initialChunkSize = initialChunkSize;
      ctrl.thumbnailData = thumbnailData;

      updateUpload(id, {
        chunksTotal: totalParts,
        chunksCompleted: resumeSkipParts.size,
        totalBytes: encryptedBlob.size,
        bytesUploaded: 0,
        serverSessionId,
      });

      // Persist to IndexedDB for resume
      if (!isResume) {
        await uploadPersistence.saveSession(id, {
          serverSessionId,
          fileName: file.name,
          fileSize: file.size,
          totalParts,
          chunkSizeBytes: initialChunkSize,
          completedParts: [],
          status: 'active',
        });
      }

      let completedCount = resumeSkipParts.size;
      // Track per-chunk in-flight progress for accurate parallel progress
      const chunkProgressMap = new Map(); // partNumber → bytesLoaded
      let completedBytes = 0; // bytes from fully-completed chunks
      // Pre-count bytes from skipped (already-uploaded) parts
      for (const pn of resumeSkipParts) {
        const start = (pn - 1) * initialChunkSize;
        const end = Math.min(start + initialChunkSize, encryptedBlob.size);
        completedBytes += (end - start);
      }

      const sha1Array = await uploadChunked({
        serverSessionId,
        b2FileId: b2FileId || '',
        encryptedBlob,
        totalParts,
        initialChunkSize,
        skipParts: resumeSkipParts,
        signal: abortController.signal,
        onChunkProgress: (partNumber, loaded, total) => {
          chunkProgressMap.set(partNumber, Math.min(loaded, total));

          // Sum: completed bytes + all in-flight chunks' partial progress
          let inFlightBytes = 0;
          for (const bytes of chunkProgressMap.values()) {
            inFlightBytes += bytes;
          }
          const totalUp = completedBytes + inFlightBytes;
          speedTracker.addSample(totalUp);

          const remaining = Math.max(0, encryptedBlob.size - totalUp);
          const pct = 50 + Math.round((Math.min(totalUp, encryptedBlob.size) / encryptedBlob.size) * 50);

          throttledUpdate(id, {
            progress: Math.min(pct, 99), // cap at 99 until truly complete
            bytesUploaded: Math.min(totalUp, encryptedBlob.size),
            speed: speedTracker.getSpeedBps(),
            eta: speedTracker.getEtaSeconds(remaining),
          });
        },
        onChunkComplete: (partNumber) => {
          // Move this chunk's bytes from in-flight to completed
          const chunkBytes = chunkProgressMap.get(partNumber) || 0;
          completedBytes += chunkBytes;
          chunkProgressMap.delete(partNumber);

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

      // For resume: we need SHA1s for ALL parts (including skipped ones).
      // uploadChunked returns nulls for skipped parts — fill them from server.
      if (isResume && _resumeSkipParts?.size > 0) {
        try {
          const status = await fileService.getUploadStatus(serverSessionId);
          for (const cp of status.completedParts) {
            if (sha1Array[cp.partNumber - 1] === null) {
              sha1Array[cp.partNumber - 1] = cp.sha1;
            }
          }
        } catch { /* best effort — backend also has them */ }
      }

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

  // ─── Phase 2c: Streaming encrypt-upload for large files ──────
  // Encrypts file.slice() → B2 part one chunk at a time.
  // Peak RAM ≈ 2 × PLAIN_CHUNK_SIZE (one plaintext + one ciphertext), fixed regardless of file size.
  // Each B2 part = [12B IV] + [ciphertext] + [16B GCM tag] = plaintext_chunk + 28 bytes.
  const processStreamEncryptUpload = useCallback(async (uploadInfo) => {
    const { id, file, folderId, _isResume } = uploadInfo;
    const masterKey = getMasterKey();

    if (!masterKey) {
      updateUpload(id, { status: UploadStatus.FAILED, error: 'No master key available' });
      encryptingCountRef.current--;
      processEncryptionQueue();
      checkIfAllDone();
      return;
    }

    const existingCtrl = controlsRef.current.get(id) || {};
    const abortController = new AbortController();
    const speedTracker = existingCtrl.speedTracker || new SpeedTracker();
    speedTracker.reset();
    controlsRef.current.set(id, {
      ...existingCtrl,
      abortController,
      speedTracker,
      isPaused: false,
      isStreamUpload: true,
    });

    try {
      const ctrl = controlsRef.current.get(id);

      // ── Declare all state vars upfront ───────────────────────────────────
      let fileKey, cipherFileKey, fileNameEncrypted, thumbnailData;
      let numParts, encTotalBytes, encChunkSize, serverSessionId;
      let sha1Array, completedBytes, startFromPart;

      if (_isResume && ctrl.fileKey) {
        // ── Resume: restore from ctrl ─────────────────────────────────────
        fileKey           = ctrl.fileKey;
        cipherFileKey     = ctrl.cipherFileKey;
        fileNameEncrypted = ctrl.fileNameEncrypted;
        thumbnailData     = ctrl.thumbnailData;
        numParts          = ctrl.numParts;
        encTotalBytes     = ctrl.encTotalBytes;
        encChunkSize      = ctrl.encChunkSize;
        serverSessionId   = ctrl.serverSessionId;
        sha1Array         = ctrl.sha1Array;
        completedBytes    = ctrl.completedBytes || 0;
        startFromPart     = ctrl.nextPartNumber || 1;
        updateUpload(id, { status: UploadStatus.UPLOADING });
      } else {
        // ── Fresh upload ──────────────────────────────────────────────────
        updateUpload(id, { status: UploadStatus.ENCRYPTING, progress: 5 });

        // Step A — generate keys + encrypted metadata
        fileKey           = await cryptoService.generateFileKey();
        cipherFileKey     = await cryptoService.encryptFileKey(fileKey, masterKey);
        fileNameEncrypted = await cryptoService.encryptFilename(file.name, masterKey);

        // Step B — thumbnail (best-effort; large files rarely have them)
        thumbnailData = null;
        const fileType = getFileType(file.type);
        const handler = FILE_HANDLERS[fileType];
        if (handler.generateThumbnails) {
          try {
            const thumbs = await handler.generateThumbnails(file);
            thumbnailData = await encryptThumbnails(thumbs, masterKey, fileKey);
          } catch (e) {
            console.warn(`[stream] ${fileType} thumbnail failed — continuing without:`, e);
          }
        }

        updateUpload(id, { progress: 10 });

        // Step C — compute part layout
        const ENC_OVERHEAD = 28;
        numParts      = Math.ceil(file.size / PLAIN_CHUNK_SIZE);
        encTotalBytes = file.size + numParts * ENC_OVERHEAD;
        encChunkSize  = PLAIN_CHUNK_SIZE + ENC_OVERHEAD;

        // Step D — start B2 session
        const session = await fileService.startChunkedUpload({
          fileNameEncrypted,
          cipherFileKey,
          mimeType: file.type || null,
          totalBytes: encTotalBytes,
          chunkSizeBytes: encChunkSize,
          totalParts: numParts,
          folderId: folderId || undefined,
          width: thumbnailData?.width || undefined,
          height: thumbnailData?.height || undefined,
          duration: thumbnailData?.duration || undefined,
        });

        serverSessionId = session.uploadId;
        sha1Array       = new Array(numParts).fill(null);
        completedBytes  = 0;
        startFromPart   = 1;

        updateUpload(id, {
          status: UploadStatus.UPLOADING,
          progress: 10,
          totalBytes: encTotalBytes,
          chunksTotal: numParts,
          chunksCompleted: 0,
          serverSessionId,
        });

        await uploadPersistence.saveSession(id, {
          serverSessionId,
          fileName: file.name,
          fileSize: file.size,
          totalParts: numParts,
          chunkSizeBytes: encChunkSize,
          completedParts: [],
          status: 'active',
        });
      }

      // Store all critical data in ctrl so pause/resume can use it
      Object.assign(ctrl, {
        serverSessionId,
        fileKey,
        cipherFileKey,
        fileNameEncrypted,
        thumbnailData,
        numParts,
        encTotalBytes,
        encChunkSize,
        sha1Array,
        completedBytes,
      });

      // Step E — encrypt + upload one part at a time
      for (let partNumber = startFromPart; partNumber <= numParts; partNumber++) {
        ctrl.nextPartNumber = partNumber;
        if (abortController.signal.aborted) {
          throw new DOMException('Upload aborted', 'AbortError');
        }

        const plainStart = (partNumber - 1) * PLAIN_CHUNK_SIZE;
        const plainEnd = Math.min(plainStart + PLAIN_CHUNK_SIZE, file.size);

        // Read this chunk only — ~10 MB in RAM
        const plainBuffer = await file.slice(plainStart, plainEnd).arrayBuffer();

        // Encrypt — produces IV (12B) + ciphertext + GCM tag (16B)
        const { encryptedData, iv } = await encryptFile(plainBuffer, fileKey);

        // Combine IV + ciphertext into one Blob — then release buffers
        const encChunk = new Blob(
          [iv, encryptedData],
          { type: 'application/octet-stream' },
        );
        // plainBuffer and encryptedData are no longer needed
        // (JS GC will collect them after this tick)

        // SHA-1 for B2 verification — computed from the Blob bytes
        const sha1 = await cryptoService.computeSHA1(await encChunk.arrayBuffer());
        sha1Array[partNumber - 1] = sha1;

        // Get a fresh part URL
        const { urls } = await fileService.getPartUploadUrls(serverSessionId, 1);
        const urlInfo = urls[0];

        // XHR upload with progress reporting
        await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', urlInfo.uploadUrl, true);
          xhr.setRequestHeader('Authorization', urlInfo.authorizationToken);
          xhr.setRequestHeader('Content-Type', 'application/octet-stream');
          xhr.setRequestHeader('X-Bz-Part-Number', String(partNumber));
          xhr.setRequestHeader('X-Bz-Content-Sha1', sha1);

          const onAbort = () => xhr.abort();
          abortController.signal.addEventListener('abort', onAbort, { once: true });

          xhr.upload.onprogress = (e) => {
            if (!e.lengthComputable) return;
            const totalUp = completedBytes + e.loaded;
            speedTracker.addSample(totalUp);
            const pct = 10 + Math.round((totalUp / encTotalBytes) * 89);
            throttledUpdate(id, {
              progress: Math.min(pct, 99),
              bytesUploaded: totalUp,
              speed: speedTracker.getSpeedBps(),
              eta: speedTracker.getEtaSeconds(encTotalBytes - totalUp),
            });
          };

          xhr.onload = () => {
            abortController.signal.removeEventListener('abort', onAbort);
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              reject(new Error(`B2 part ${partNumber} failed: HTTP ${xhr.status}`));
            }
          };

          xhr.onerror = () => {
            abortController.signal.removeEventListener('abort', onAbort);
            reject(new Error(`B2 part ${partNumber} network error`));
          };

          xhr.onabort = () => {
            abortController.signal.removeEventListener('abort', onAbort);
            reject(new DOMException('Upload aborted', 'AbortError'));
          };

          xhr.send(encChunk);
        });

        // Record part on backend (fire-and-forget)
        api.post(`/uploads/${serverSessionId}/part-complete`, {
          partNumber,
          sha1,
        }).catch(() => {});

        completedBytes += encChunk.size;
        ctrl.completedBytes = completedBytes;
        updateUpload(id, { chunksCompleted: partNumber });

        uploadPersistence.saveSession(id, {
          serverSessionId,
          fileName: file.name,
          fileSize: file.size,
          totalParts: numParts,
          chunkSizeBytes: encChunkSize,
          completedParts: Array.from({ length: partNumber }, (_, i) => i + 1),
          status: 'active',
        }).catch(() => {});
      }

      // Step F — finalize
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
        bytesUploaded: encTotalBytes,
        speed: 0,
        eta: 0,
        result,
      });

      await uploadPersistence.removeSession(id);
      if (onFileUploadedRef.current) onFileUploadedRef.current(result);

    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        // If paused: ctrl.isPaused is true — leave status as PAUSED, ctrl data intact
        // If cancelled: ctrl was deleted by cancelUpload — updateUpload is a no-op
        const wasPaused = controlsRef.current.get(id)?.isPaused;
        if (!wasPaused) {
          updateUpload(id, { status: UploadStatus.FAILED, error: 'Upload cancelled' });
        }
        return;
      }
      console.error(`[stream] Upload failed for ${file.name}:`, error);
      updateUpload(id, { status: UploadStatus.FAILED, error: error.message });
    } finally {
      encryptingCountRef.current--;
      processEncryptionQueue();
      checkIfAllDone();
    }
  }, [getMasterKey, updateUpload, throttledUpdate, processEncryptionQueue, checkIfAllDone]);

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
    processStreamEncryptUploadRef.current = processStreamEncryptUpload;
  }, [processEncryption, processUpload, processStreamEncryptUpload]);

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

    // Create fresh abort controller (old one was aborted on pause)
    ctrl.abortController = new AbortController();
    ctrl.isPaused = false;
    ctrl.speedTracker.reset();

    // For chunked uploads: resume with remaining chunks
    if (upload.serverSessionId) {
      // ── Streaming upload resume ───────────────────────────────────────────
      if (ctrl.isStreamUpload && ctrl.fileKey) {
        encryptingCountRef.current++;
        setIsUploading(true);
        processStreamEncryptUploadRef.current({
          id: uploadId,
          file: upload.file,
          folderId: upload.folderId,
          _isResume: true,
        });
        return;
      }

      // ── Monolithic chunked upload resume ─────────────────────────────────
      const encryptedBlob = ctrl.encryptedBlob;
      if (!encryptedBlob) {
        updateUpload(uploadId, {
          status: UploadStatus.FAILED,
          error: 'Encrypted data lost (page was refreshed). Cannot resume.',
        });
        return;
      }

      updateUpload(uploadId, { status: UploadStatus.UPLOADING });

      try {
        const status = await fileService.getUploadStatus(upload.serverSessionId);
        const confirmedParts = new Set(status.completedParts.map((p) => p.partNumber));

        const encryptedItem = {
          id: uploadId,
          file: upload.file,
          encryptedBlob,
          fileNameEncrypted: '',
          cipherFileKey: '',
          thumbnailData: ctrl.thumbnailData || null,
          contentHash: null,
          folderId: null,
          _resumeSessionId: upload.serverSessionId,
          _resumeSkipParts: confirmedParts,
          _resumeChunkSize: ctrl.initialChunkSize || status.chunkSizeBytes,
        };

        uploadingCountRef.current++;
        setIsUploading(true);
        processChunkedUpload(encryptedItem);
      } catch (err) {
        updateUpload(uploadId, {
          status: UploadStatus.FAILED,
          error: 'Failed to resume: ' + err.message,
        });
      }
    } else {
      // Small file: re-encrypt and re-upload from scratch
      const uploadInfo = { ...upload, status: UploadStatus.PENDING, progress: 0 };
      queueRef.current.push(uploadInfo);
      updateUpload(uploadId, { status: UploadStatus.PENDING, progress: 0 });
      setIsUploading(true);
      processEncryptionQueue();
    }
  }, [uploads, updateUpload, processEncryptionQueue, processChunkedUpload]);

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
          // Cancel orphaned server session before retrying fresh
          if (upload.serverSessionId) {
            fileService.cancelChunkedUpload(upload.serverSessionId).catch(() => {});
          }
          const reset = {
            ...upload,
            status: UploadStatus.PENDING,
            progress: 0,
            error: null,
            bytesUploaded: 0,
            speed: 0,
            eta: null,
            chunksCompleted: 0,
            serverSessionId: null,
          };
          newMap.set(id, reset);
          controlsRef.current.set(id, {
            abortController: new AbortController(),
            speedTracker: new SpeedTracker(),
            isPaused: false,
            isStreamUpload: false,
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
    // Use totalBytes (encrypted size) when available for consistent units with bytesUploaded
    const uSize = u.totalBytes || u.size || 0;
    totalBytes += uSize;
    if (u.status === UploadStatus.COMPLETED || u.status === UploadStatus.DUPLICATE) {
      totalBytesUploaded += uSize;
    } else {
      totalBytesUploaded += Math.min(u.bytesUploaded || 0, uSize);
    }

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
