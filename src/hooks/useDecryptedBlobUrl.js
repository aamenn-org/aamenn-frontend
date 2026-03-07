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
    console.log('🔍 useDecryptedBlobUrl load called:', {
      hasDownloadUrl: !!downloadUrl,
      downloadUrlLength: downloadUrl?.length,
      hasCipherFileKey: !!cipherFileKey,
      cipherFileKeyLength: cipherFileKey?.length,
      hasMasterKey: !!masterKey,
      masterKeyType: masterKey?.constructor?.name,
      enabled,
      requestId: ++requestIdRef.current
    });

    if (!downloadUrl || !cipherFileKey || !masterKey || !enabled) {
      console.log('❌ useDecryptedBlobUrl: Missing required parameters');
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
      console.log('📥 Starting file download...');
      // Download encrypted file
      const encryptedData = await fileService.downloadFileContent(downloadUrl);

      // Check if this request is still current
      if (thisRequestId !== requestIdRef.current || abortControllerRef.current?.signal.aborted) {
        console.log('❌ Request aborted or stale');
        return;
      }

      if (!encryptedData || encryptedData.byteLength === 0) {
        throw new Error('Downloaded file is empty');
      }

      console.log('📥 File downloaded successfully:', {
        size: encryptedData.byteLength,
        sizeKB: (encryptedData.byteLength / 1024).toFixed(2) + ' KB'
      });

      // Decrypt in Web Worker
      console.log('🔐 Starting decryption in worker...');
      const workerPool = getCryptoWorkerPool();
      
      console.log('🔐 Decryption parameters:', {
        encryptedDataSize: encryptedData.byteLength,
        cipherFileKeyLength: cipherFileKey?.length,
        cipherFileKeyType: typeof cipherFileKey,
        masterKeyBytesLength: (await crypto.subtle.exportKey('raw', masterKey)).byteLength,
        mimeType
      });
      
      const masterKeyBytes = await crypto.subtle.exportKey('raw', masterKey);
      const decryptedData = await workerPool.decryptFile(
        encryptedData,
        cipherFileKey,
        masterKeyBytes
      );

      // Check if this request is still current
      if (thisRequestId !== requestIdRef.current || abortControllerRef.current?.signal.aborted) {
        console.log('❌ Decryption completed but request aborted/stale');
        return;
      }

      console.log('🔐 Decryption successful:', {
        decryptedSize: decryptedData.byteLength,
        decryptedSizeKB: (decryptedData.byteLength / 1024).toFixed(2) + ' KB'
      });

      // Create blob URL
      const blob = new Blob([decryptedData], { type: mimeType });
      const url = URL.createObjectURL(blob);

      console.log('📦 Blob URL created:', {
        blobSize: blob.size,
        blobType: blob.type,
        urlLength: url.length
      });

      // Update state if this request is still current
      if (thisRequestId === requestIdRef.current) {
        setBlobUrl(url);
        blobUrlRef.current = url;
        setLoading(false);
        console.log('✅ useDecryptedBlobUrl completed successfully');
      }
    } catch (err) {
      console.error('❌ [useDecryptedBlobUrl] Failed to load:', err);
      console.error('❌ Error details:', {
        message: err.message,
        stack: err.stack,
        name: err.name
      });
      if (thisRequestId === requestIdRef.current) {
        setError(err);
        setLoading(false);
      }
    } finally {
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
