/**
 * ChunkedUploadService — Orchestrates direct-to-B2 chunked uploads.
 *
 * Responsibilities:
 * - Slice encrypted data into chunks
 * - Request part URLs from backend (batch-prefetched)
 * - Upload chunks to B2 in parallel via XHR (for upload progress events)
 * - Track per-chunk progress, speed, retry
 * - Support pause / resume / cancel via AbortController
 *
 * This service is stateless per-call; session state lives in useUpload + IndexedDB.
 */

import api from './api';
import { computeSHA1 } from '../workers/crypto-primitives.js';
import { AdaptiveUploadController } from './adaptive-upload-controller.js';

const RETRY_DELAYS = [2000, 4000, 8000]; // exponential backoff

/**
 * Upload a large encrypted blob using B2 Large File API via backend-managed sessions.
 *
 * @param {object} opts
 * @param {string}       opts.serverSessionId — backend upload session ID
 * @param {string}       opts.b2FileId        — B2 large file ID
 * @param {Blob}         opts.encryptedBlob   — the full encrypted blob
 * @param {number}       opts.totalParts      — pre-calculated part count
 * @param {number}       opts.initialChunkSize— initial chunk size in bytes
 * @param {Set<number>}  [opts.skipParts]     — parts already uploaded (for resume)
 * @param {AbortSignal}  [opts.signal]        — abort signal for pause/cancel
 * @param {function}     [opts.onChunkProgress] — (bytesLoadedThisChunk, bytesTotalThisChunk) => void
 * @param {function}     [opts.onChunkComplete] — (partNumber, sha1) => void
 * @param {function}     [opts.onTotalProgress] — (totalBytesUploaded) => void
 * @returns {Promise<string[]>} — ordered SHA-1 array for all parts
 */
export async function uploadChunked(opts) {
  const {
    serverSessionId,
    b2FileId,
    encryptedBlob,
    totalParts,
    initialChunkSize,
    skipParts = new Set(),
    signal,
    onChunkProgress,
    onChunkComplete,
    onTotalProgress,
  } = opts;

  const controller = new AdaptiveUploadController(encryptedBlob.size);
  // Override initial chunk size from caller (may differ from controller default)
  if (initialChunkSize) {
    controller.chunkSize = initialChunkSize;
  }

  // SHA-1 array indexed by part number (1-based → index 0 = part 1)
  const sha1Array = new Array(totalParts).fill(null);

  // Pre-fill known SHA-1s for skipped (already-uploaded) parts
  // These will be fetched from the backend status endpoint by the caller

  // Build list of parts that need uploading
  const pendingParts = [];
  for (let i = 1; i <= totalParts; i++) {
    if (!skipParts.has(i)) {
      pendingParts.push(i);
    }
  }

  let totalBytesUploaded = 0;
  // Count bytes from skipped parts
  for (const pn of skipParts) {
    const start = (pn - 1) * initialChunkSize;
    const end = Math.min(start + initialChunkSize, encryptedBlob.size);
    totalBytesUploaded += (end - start);
  }

  // URL cache: partNumber is not tied to a specific URL in B2 large file API;
  // we just need N concurrent URLs. We batch-fetch them.
  let urlPool = [];

  async function fetchUrls(count) {
    const resp = await api.post(`/uploads/${serverSessionId}/part-urls`, { count });
    return resp.data.urls; // [{ uploadUrl, authorizationToken }]
  }

  async function getUrl() {
    if (urlPool.length === 0) {
      const batchSize = Math.min(controller.getMaxParallel() + 1, 6);
      urlPool = await fetchUrls(batchSize);
    }
    return urlPool.shift();
  }

  // Upload a single chunk via XHR (supports upload progress unlike fetch)
  async function uploadChunk(partNumber, urlInfo, chunkBlob, retryCount = 0) {
    if (signal?.aborted) {
      throw new DOMException('Upload aborted', 'AbortError');
    }

    const chunkBuffer = await chunkBlob.arrayBuffer();
    const sha1 = await computeSHA1(chunkBuffer);

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', urlInfo.uploadUrl, true);
      xhr.setRequestHeader('Authorization', urlInfo.authorizationToken);
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      // Content-Length is a forbidden header in browsers — auto-set from body
      xhr.setRequestHeader('X-Bz-Part-Number', String(partNumber));
      xhr.setRequestHeader('X-Bz-Content-Sha1', sha1);

      // Wire abort signal
      const onAbort = () => xhr.abort();
      if (signal) {
        signal.addEventListener('abort', onAbort, { once: true });
      }

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onChunkProgress) {
          onChunkProgress(e.loaded, e.total);
        }
      };

      xhr.onload = () => {
        if (signal) signal.removeEventListener('abort', onAbort);

        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(sha1);
        } else if (xhr.status === 401 || xhr.status === 408 || xhr.status >= 500) {
          // Retryable
          reject({ status: xhr.status, retryable: true, message: xhr.statusText });
        } else {
          reject({ status: xhr.status, retryable: false, message: xhr.statusText });
        }
      };

      xhr.onerror = () => {
        if (signal) signal.removeEventListener('abort', onAbort);
        reject({ status: 0, retryable: true, message: 'Network error' });
      };

      xhr.onabort = () => {
        if (signal) signal.removeEventListener('abort', onAbort);
        reject(new DOMException('Upload aborted', 'AbortError'));
      };

      xhr.send(chunkBlob);
    });
  }

  // Process all pending parts with adaptive parallelism
  let partIndex = 0;

  while (partIndex < pendingParts.length) {
    if (signal?.aborted) {
      throw new DOMException('Upload aborted', 'AbortError');
    }

    const maxPar = controller.getMaxParallel();
    const chunkSize = controller.getChunkSize();
    const batch = pendingParts.slice(partIndex, partIndex + maxPar);

    const batchPromises = batch.map(async (partNumber) => {
      const start = (partNumber - 1) * initialChunkSize;
      const end = Math.min(start + initialChunkSize, encryptedBlob.size);
      const chunkBlob = encryptedBlob.slice(start, end);

      // Retry loop per chunk
      for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
        try {
          const urlInfo = await getUrl();
          const chunkStart = Date.now();

          const sha1 = await uploadChunk(partNumber, urlInfo, chunkBlob);

          const duration = Date.now() - chunkStart;
          controller.recordChunkResult(chunkBlob.size, duration);

          // Measure RTT from first chunk
          if (controller.estimatedRtt === null && duration > 0) {
            // Rough RTT = total time minus pure transfer time
            const transferTime = (chunkBlob.size / (chunkBlob.size / duration)) || duration;
            controller.setRtt(Math.min(duration * 0.1, 500)); // heuristic
          }

          sha1Array[partNumber - 1] = sha1;
          totalBytesUploaded += chunkBlob.size;

          if (onChunkComplete) onChunkComplete(partNumber, sha1);
          if (onTotalProgress) onTotalProgress(totalBytesUploaded);

          // Record part on backend (fire-and-forget, best effort)
          api.post(`/uploads/${serverSessionId}/part-complete`, {
            partNumber,
            sha1,
          }).catch(() => {});

          return; // success
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') {
            throw err;
          }

          controller.recordChunkResult(chunkBlob.size, 0, true);

          if (!err.retryable || attempt >= RETRY_DELAYS.length) {
            throw new Error(
              `Part ${partNumber} failed after ${attempt + 1} attempts: ${err.message || err}`
            );
          }

          // Wait for network if offline
          if (!navigator.onLine) {
            await new Promise((resolve) => {
              window.addEventListener('online', resolve, { once: true });
            });
          }

          const delay = RETRY_DELAYS[attempt];
          await new Promise((r) => setTimeout(r, delay));

          // Get a fresh URL for retry
          try {
            urlPool = []; // flush stale URLs
          } catch { /* ignore */ }
        }
      }
    });

    await Promise.all(batchPromises);
    partIndex += batch.length;
  }

  return sha1Array;
}

/**
 * Calculate the total number of parts for a given file size and chunk size.
 * @param {number} totalBytes
 * @param {number} chunkSize
 * @returns {number}
 */
export function calculateTotalParts(totalBytes, chunkSize) {
  return Math.ceil(totalBytes / chunkSize);
}

/**
 * Choose an initial chunk size that respects B2's constraints.
 * @param {number} totalBytes — total encrypted file size
 * @returns {number} — chunk size in bytes
 */
export function chooseInitialChunkSize(totalBytes) {
  // Must stay under 10,000 parts
  const minForParts = Math.ceil(totalBytes / 9500);
  // Default 10 MB, but at least the minimum for parts limit, and at least 5 MB (B2 minimum)
  return Math.max(10 * 1024 * 1024, minForParts, 5 * 1024 * 1024);
}
