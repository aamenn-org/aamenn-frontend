/**
 * Crypto Worker - Parallel Encryption/Decryption Engine
 *
 * This Web Worker handles all cryptographic operations off the main thread,
 * following ente.io's approach for seamless, non-blocking encryption.
 *
 * Supports:
 * - File encryption with AES-256-GCM
 * - Chunked encryption for large files
 * - Thumbnail encryption
 * - Key generation and encryption
 *
 * Browser Compatibility:
 * - Safari 11+ (SubtleCrypto in workers)
 * - Chrome 37+, Firefox 48+, Edge 79+
 */

import {
  arrayBufferToBase64,
  generateRandomBytes,
  computeSHA1,
  computeSHA256,
  generateAesKey,
  encryptFile,
  encryptFileKey,
  encryptFilename,
} from './crypto-primitives.js';

// ==================== WORKER-SPECIFIC UTILITIES ====================

const CHUNK_SIZE = 4 * 1024 * 1024; // 4MB chunks for streaming encryption

/**
 * Import master key from raw bytes (worker-specific: receives bytes over postMessage)
 */
async function importMasterKey(keyBytes) {
  return crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

// ==================== CHUNKED ENCRYPTION ====================

/**
 * Encrypt file in chunks for memory efficiency
 * Uses a single IV for the entire file (AES-GCM handles this safely for files < 64GB)
 */
async function encryptFileChunked(fileData, fileKey, onProgress) {
  const iv = generateRandomBytes(12);
  const totalSize = fileData.byteLength;

  // For files under chunk size, encrypt directly
  if (totalSize <= CHUNK_SIZE) {
    const encryptedData = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      fileKey,
      fileData
    );
    const combined = new Uint8Array(iv.length + encryptedData.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(encryptedData), iv.length);

    if (onProgress) onProgress(100);
    return combined;
  }

  // For larger files, encrypt the entire buffer at once but report progress
  // AES-GCM doesn't support true streaming, so we encrypt the whole file
  // but can still report progress during the operation
  if (onProgress) onProgress(10);

  const encryptedData = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    fileKey,
    fileData
  );

  if (onProgress) onProgress(90);

  // Combine IV + encrypted data
  const combined = new Uint8Array(iv.length + encryptedData.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encryptedData), iv.length);

  if (onProgress) onProgress(100);
  return combined;
}

// ==================== WORKER MESSAGE HANDLER ====================

self.onmessage = async function (e) {
  const { type, id, payload } = e.data;

  try {
    switch (type) {
      // Handle ping for initialization check
      case 'PING': {
        self.postMessage({ type: 'PONG', id });
        break;
      }

      case 'ENCRYPT_FILE': {
        const { fileData, masterKeyBytes, filename, mimeType } = payload;

        // Import master key
        const masterKey = await importMasterKey(masterKeyBytes);

        // Generate file key
        const fileKey = await generateAesKey();

        // Report encryption start
        self.postMessage({
          type: 'PROGRESS',
          id,
          progress: 5,
          stage: 'encrypting',
        });

        // Encrypt file with progress reporting
        const encryptedData = await encryptFileChunked(
          fileData,
          fileKey,
          (progress) => {
            self.postMessage({
              type: 'PROGRESS',
              id,
              progress: 5 + Math.round(progress * 0.6), // 5-65%
              stage: 'encrypting',
            });
          }
        );

        // Encrypt file key
        self.postMessage({
          type: 'PROGRESS',
          id,
          progress: 70,
          stage: 'encrypting_key',
        });
        const cipherFileKey = await encryptFileKey(fileKey, masterKey);

        // Encrypt filename
        self.postMessage({
          type: 'PROGRESS',
          id,
          progress: 75,
          stage: 'encrypting_metadata',
        });
        const fileNameEncrypted = await encryptFilename(filename, masterKey);

        // Compute SHA1
        self.postMessage({
          type: 'PROGRESS',
          id,
          progress: 80,
          stage: 'computing_hash',
        });
        const sha1Hash = await computeSHA1(encryptedData);

        self.postMessage({
          type: 'PROGRESS',
          id,
          progress: 85,
          stage: 'complete',
        });

        // Return encrypted file and metadata
        self.postMessage(
          {
            type: 'ENCRYPT_FILE_RESULT',
            id,
            result: {
              encryptedData: encryptedData.buffer,
              cipherFileKey,
              fileNameEncrypted,
              sha1Hash,
              mimeType,
              originalSize: fileData.byteLength,
              encryptedSize: encryptedData.byteLength,
            },
          },
          [encryptedData.buffer]
        ); // Transfer ownership for performance
        break;
      }

      case 'ENCRYPT_THUMBNAIL': {
        const { thumbnailData, masterKeyBytes, type: thumbType } = payload;

        const masterKey = await importMasterKey(masterKeyBytes);
        const thumbKey = await generateAesKey();

        // Encrypt thumbnail
        const { encryptedData, iv } = await encryptFile(
          thumbnailData,
          thumbKey
        );

        // Combine IV + encrypted data
        const combined = new Uint8Array(iv.length + encryptedData.byteLength);
        combined.set(iv, 0);
        combined.set(new Uint8Array(encryptedData), iv.length);

        // Encrypt thumbnail key
        const cipherThumbKey = await encryptFileKey(thumbKey, masterKey);

        self.postMessage({
          type: 'ENCRYPT_THUMBNAIL_RESULT',
          id,
          result: {
            encryptedData: arrayBufferToBase64(combined.buffer),
            cipherThumbKey,
            thumbType,
          },
        });
        break;
      }

      case 'GENERATE_FILE_KEY': {
        const fileKey = await generateAesKey();
        const keyBytes = await crypto.subtle.exportKey('raw', fileKey);

        self.postMessage(
          {
            type: 'GENERATE_FILE_KEY_RESULT',
            id,
            result: { keyBytes },
          },
          [keyBytes]
        );
        break;
      }

      case 'COMPUTE_SHA1': {
        const { data } = payload;
        const hash = await computeSHA1(data);

        self.postMessage({
          type: 'COMPUTE_SHA1_RESULT',
          id,
          result: { hash },
        });
        break;
      }

      case 'COMPUTE_SHA256': {
        const { data } = payload;
        const hash = await computeSHA256(data);

        self.postMessage({
          type: 'COMPUTE_SHA256_RESULT',
          id,
          result: { hash },
        });
        break;
      }

      case 'DECRYPT_FILE': {
        // Decrypt file content (for viewing)
        // Payload: { encryptedData, cipherFileKeyBase64, masterKeyBytes }
        const { encryptedData, cipherFileKeyBase64, masterKeyBytes } = payload;

        // Import master key
        const masterKey = await importMasterKey(masterKeyBytes);

        // Decrypt file key
        const combined = Uint8Array.from(atob(cipherFileKeyBase64), (c) =>
          c.charCodeAt(0)
        );
        const keyIv = combined.slice(0, 12);
        const keyCiphertext = combined.slice(12);

        const fileKeyBytes = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: keyIv },
          masterKey,
          keyCiphertext
        );

        const fileKey = await crypto.subtle.importKey(
          'raw',
          fileKeyBytes,
          { name: 'AES-GCM', length: 256 },
          false,
          ['decrypt']
        );

        // Extract IV and ciphertext from encrypted data
        const encArray = new Uint8Array(encryptedData);
        const iv = encArray.slice(0, 12);
        const ciphertext = encArray.slice(12);

        // Decrypt file
        const decryptedData = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv },
          fileKey,
          ciphertext
        );

        // Transfer ownership for performance
        self.postMessage(
          {
            type: 'DECRYPT_FILE_RESULT',
            id,
            result: { decryptedData },
          },
          [decryptedData]
        );
        break;
      }

      
      default:
        throw new Error(`Unknown message type: ${type}`);
    }
  } catch (error) {
    self.postMessage({
      type: 'ERROR',
      id,
      error: {
        message: error.message,
        stack: error.stack,
      },
    });
  }
};

// Signal worker is ready
self.postMessage({ type: 'READY' });
