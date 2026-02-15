import { useState, useEffect, useRef, useCallback } from 'react';
import { fileService } from '../services';
import { getCryptoWorkerPool } from '../workers';

/**
 * Hook to download, decrypt, and create a blob URL for encrypted files
 * Automatically cleans up blob URL on unmount
 * 
 * Uses a request ID to prevent stale updates from out-of-order responses.
 * Validates decrypted data before creating blob URL.
 * 
 * @param {Object} params
 * @param {string} params.downloadUrl - Signed URL to download encrypted file
 * @param {string} params.cipherFileKey - Encrypted file key (base64)
 * @param {CryptoKey} params.masterKey - User's master key
 * @param {string} params.mimeType - MIME type for the blob
 * @param {boolean} params.enabled - Whether to start loading (default: true)
 * @returns {Object} { blobUrl, loading, error, retry }
 */
export function useDecryptedBlobUrl({
  downloadUrl,
  cipherFileKey,
  masterKey,
  mimeType = 'application/octet-stream',
  enabled = true,
}) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const blobUrlRef = useRef(null);
  const abortControllerRef = useRef(null);
  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    if (!downloadUrl || !cipherFileKey || !masterKey || !enabled) {
      return;
    }

    // Abort any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    // Revoke previous blob URL immediately when starting a new load
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }

    // Track this request to prevent stale updates
    const thisRequestId = ++requestIdRef.current;

    abortControllerRef.current = new AbortController();
    setBlobUrl(null);
    setLoading(true);
    setError(null);

    try {
      // Download encrypted file
      const encryptedData = await fileService.downloadFileContent(downloadUrl);

      // Check if this request is still current
      if (thisRequestId !== requestIdRef.current || abortControllerRef.current?.signal.aborted) {
        return;
      }

      if (!encryptedData || encryptedData.byteLength === 0) {
        throw new Error('Downloaded file is empty');
      }

      // Decrypt in Web Worker
      const workerPool = getCryptoWorkerPool();
      const masterKeyBytes = await crypto.subtle.exportKey('raw', masterKey);
      const decryptedData = await workerPool.decryptFile(
        encryptedData,
        cipherFileKey,
        masterKeyBytes
      );

      // Check if this request is still current
      if (thisRequestId !== requestIdRef.current || abortControllerRef.current?.signal.aborted) {
        return;
      }

      if (!decryptedData || decryptedData.byteLength === 0) {
        throw new Error('Decrypted file is empty — possible wrong key or corrupted data');
      }

      // Create blob and URL from the fully decrypted data
      const blob = new Blob([decryptedData], { type: mimeType });
      const url = URL.createObjectURL(blob);

      // Final staleness check before committing state
      if (thisRequestId !== requestIdRef.current) {
        URL.revokeObjectURL(url);
        return;
      }

      blobUrlRef.current = url;
      setBlobUrl(url);
      setLoading(false);
    } catch (err) {
      if (thisRequestId !== requestIdRef.current || abortControllerRef.current?.signal.aborted) {
        return;
      }
      console.error('[useDecryptedBlobUrl] Failed to load:', err);
      setError(err.message || 'Failed to load file');
      setLoading(false);
    }
  }, [downloadUrl, cipherFileKey, masterKey, mimeType, enabled]);

  useEffect(() => {
    load();

    // Cleanup: revoke blob URL and abort request
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
      setBlobUrl(null);
    };
  }, [load]);

  const retry = useCallback(() => {
    load();
  }, [load]);

  return { blobUrl, loading, error, retry };
}

export default useDecryptedBlobUrl;
