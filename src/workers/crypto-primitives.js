/**
 * Shared Crypto Primitives
 *
 * Low-level cryptographic utilities shared between the main thread
 * (utils/crypto.js) and the Web Worker (crypto.worker.js).
 *
 * This file must remain free of DOM/main-thread-only APIs so it
 * can safely execute in both contexts.
 */

// ==================== UTILITIES ====================

/**
 * Convert ArrayBuffer or Uint8Array to Base64 string.
 * Chunked to avoid "Maximum call stack size exceeded" in Safari.
 * @param {ArrayBuffer | Uint8Array} buffer
 * @returns {string}
 */
export function arrayBufferToBase64(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const CHUNK = 8192;
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + CHUNK, bytes.byteLength)));
  }
  return btoa(binary);
}

/**
 * Generate cryptographically random bytes.
 * @param {number} length
 * @returns {Uint8Array}
 */
export function generateRandomBytes(length) {
  return crypto.getRandomValues(new Uint8Array(length));
}

// ==================== INTERNAL HELPERS ====================

/**
 * Normalize input to a plain ArrayBuffer for SubtleCrypto.
 * Handles ArrayBuffer, TypedArrays (including non-zero byteOffset), and Blobs.
 * @param {ArrayBuffer | Uint8Array | { buffer: ArrayBuffer } | { arrayBuffer: () => Promise<ArrayBuffer> }} data
 * @param {string} label - Used in error messages.
 * @returns {Promise<ArrayBuffer>}
 */
async function normalizeBuffer(data, label) {
  if (data instanceof ArrayBuffer) return data;
  if (data instanceof Uint8Array) {
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  }
  if (data && typeof data.arrayBuffer === 'function') return data.arrayBuffer(); // Blob / File
  if (data && data.buffer instanceof ArrayBuffer) return data.buffer; // Other TypedArrays
  throw new Error(`Unsupported data type for ${label}`);
}

// ==================== HASH FUNCTIONS ====================

/**
 * Compute SHA-1 hex string (for B2 upload verification).
 * @param {ArrayBuffer | Uint8Array} data
 * @returns {Promise<string>}
 */
export async function computeSHA1(data) {
  const buffer = await normalizeBuffer(data, 'SHA-1');
  const hashBuffer = await crypto.subtle.digest('SHA-1', buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Compute SHA-256 hex string (for duplicate detection).
 * @param {ArrayBuffer | Uint8Array} data
 * @returns {Promise<string>}
 */
export async function computeSHA256(data) {
  const buffer = await normalizeBuffer(data, 'SHA-256');
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ==================== AES-GCM HELPERS ====================

/**
 * Generate a random AES-256-GCM CryptoKey.
 * @returns {Promise<CryptoKey>}
 */
export async function generateAesKey() {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

/**
 * AES-GCM encrypt with a random IV. Returns base64(IV + ciphertext).
 * @param {CryptoKey} key
 * @param {ArrayBuffer | Uint8Array} plaintext
 * @returns {Promise<string>}
 */
export async function encryptAesGcm(key, plaintext) {
  const iv = generateRandomBytes(12);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  const combined = new Uint8Array(12 + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), 12);
  return arrayBufferToBase64(combined);
}

// ==================== FILE ENCRYPTION ====================

/**
 * Encrypt a file (or any binary data) with a per-file AES-256-GCM key.
 * Returns the raw encrypted buffer and IV separately (for B2 upload format).
 * @param {ArrayBuffer} fileData
 * @param {CryptoKey} fileKey
 * @returns {Promise<{ encryptedData: ArrayBuffer, iv: Uint8Array }>}
 */
export async function encryptFile(fileData, fileKey) {
  const iv = generateRandomBytes(12);
  const encryptedData = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, fileKey, fileData);
  return { encryptedData, iv };
}

/**
 * Encrypt a CryptoKey (file key) with the master key.
 * Returns base64(IV + ciphertext).
 * @param {CryptoKey} fileKey
 * @param {CryptoKey} masterKey
 * @returns {Promise<string>}
 */
export async function encryptFileKey(fileKey, masterKey) {
  const fileKeyBytes = await crypto.subtle.exportKey('raw', fileKey);
  return encryptAesGcm(masterKey, fileKeyBytes);
}

/**
 * Encrypt a UTF-8 string (e.g. filename) with the master key.
 * Returns base64(IV + ciphertext).
 * @param {string} text
 * @param {CryptoKey} key
 * @returns {Promise<string>}
 */
export async function encryptFilename(text, key) {
  return encryptAesGcm(key, new TextEncoder().encode(text));
}
