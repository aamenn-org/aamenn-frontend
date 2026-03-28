/**
 * CryptoService — Unified facade for all cryptographic operations.
 *
 * Abstracts the decision of "main thread vs worker" from callers:
 * - Heavy operations (file encrypt/decrypt, hashing) → worker pool, main-thread fallback
 * - Light operations (filename, contact fields, key wrap/unwrap) → main thread only
 * - masterKey raw bytes cached per-session to avoid repeated exportKey calls
 *
 * All callers should import from this module instead of directly using
 * utils/crypto or workers/crypto-worker-pool.
 */

import {
  generateFileKey,
  encryptFile,
  encryptFileKey,
  encryptFilename,
  decryptFilename,
  encryptContactField,
  decryptContactField,
  encryptContact,
  decryptContact,
  generateUnifiedShareKeys,
  decryptFileKeyWithShareKey,
  importShareKeyRaw,
  generateRegistrationKeys,
  unlockMasterKey,
  unlockMasterKeyWithRecovery,
  reEncryptMasterKey,
  generateRecoveryKey,
  parseRecoveryPhrase,
  generateRecoveryParams,
  decryptRecoveryKey,
  deriveKEK,
  generateMasterKey,
  encryptMasterKey,
  decryptMasterKey,
  computeSHA1 as computeSHA1MainThread,
  computeSHA256 as computeSHA256MainThread,
  arrayBufferToBase64,
  base64ToArrayBuffer,
  generateRandomBytes,
} from '../utils/crypto';
import {
  getCryptoWorkerPool,
  PRIORITY,
} from '../workers/crypto-worker-pool';

// Per-session cache of exported master key bytes.
// Avoids repeated crypto.subtle.exportKey calls across operations.
let _cachedMasterKey = null;
let _cachedMasterKeyBytes = null;

/**
 * Export master key bytes, using a per-session cache.
 * Reset automatically when the masterKey instance changes.
 * @param {CryptoKey} masterKey
 * @returns {Promise<ArrayBuffer>}
 */
async function _getMasterKeyBytes(masterKey) {
  if (_cachedMasterKey === masterKey && _cachedMasterKeyBytes !== null) {
    return _cachedMasterKeyBytes;
  }
  _cachedMasterKeyBytes = await crypto.subtle.exportKey('raw', masterKey);
  _cachedMasterKey = masterKey;
  return _cachedMasterKeyBytes;
}

/**
 * Invalidate the cached master key bytes.
 * Call this on logout or vault lock.
 */
function invalidateMasterKeyCache() {
  _cachedMasterKey = null;
  _cachedMasterKeyBytes = null;
}

export const cryptoService = {
  // ── Session cache management ──────────────────────────────────────────────

  invalidateMasterKeyCache,

  // ── Hashing ───────────────────────────────────────────────────────────────

  /**
   * Compute SHA-256 (for duplicate detection).
   * Uses worker pool, falls back to main thread.
   * @param {ArrayBuffer} data
   * @returns {Promise<string>} Hex string
   */
  async computeSHA256(data) {
    try {
      const workerPool = getCryptoWorkerPool();
      return await workerPool.computeSHA256(data);
    } catch {
      return computeSHA256MainThread(data);
    }
  },

  /**
   * Compute SHA-1 (for B2 upload verification).
   * Uses worker pool, falls back to main thread.
   * @param {ArrayBuffer} data
   * @returns {Promise<string>} Hex string
   */
  async computeSHA1(data) {
    try {
      const workerPool = getCryptoWorkerPool();
      return await workerPool.computeSHA1(data);
    } catch {
      return computeSHA1MainThread(data);
    }
  },

  // ── File operations ───────────────────────────────────────────────────────

  /**
   * Generate a random per-file AES-256 key.
   * @returns {Promise<CryptoKey>}
   */
  generateFileKey,

  /**
   * Encrypt file data on the main thread.
   * @param {ArrayBuffer} fileData
   * @param {CryptoKey} fileKey
   * @returns {Promise<{encryptedData: ArrayBuffer, iv: Uint8Array}>}
   */
  encryptFile,

  /**
   * Encrypt the file key with the master key for server storage.
   * @param {CryptoKey} fileKey
   * @param {CryptoKey} masterKey
   * @returns {Promise<string>} base64(IV + ciphertext)
   */
  encryptFileKey,

  /**
   * Decrypt file content, using the worker pool (non-blocking) with main-thread fallback.
   * @param {ArrayBuffer} encryptedData - IV + ciphertext combined
   * @param {string} cipherFileKeyBase64 - Encrypted file key
   * @param {CryptoKey} masterKey
   * @param {{ priority?: number, signal?: AbortSignal }} [options]
   * @returns {Promise<ArrayBuffer>}
   */
  async decryptFile(encryptedData, cipherFileKeyBase64, masterKey, options = {}) {
    const masterKeyBytes = await _getMasterKeyBytes(masterKey);
    const workerPool = getCryptoWorkerPool();
    return workerPool.decryptFile(encryptedData, cipherFileKeyBase64, masterKeyBytes, options);
  },

  // ── Filename operations ───────────────────────────────────────────────────

  /**
   * @param {string} filename
   * @param {CryptoKey} masterKey
   * @returns {Promise<string>} base64
   */
  encryptFilename,

  /**
   * @param {string} encryptedFilenameBase64
   * @param {CryptoKey} masterKey
   * @returns {Promise<string>}
   */
  decryptFilename,

  // ── Contact operations ────────────────────────────────────────────────────

  encryptContactField,
  decryptContactField,
  encryptContact,
  decryptContact,

  // ── Share key operations ──────────────────────────────────────────────────

  generateUnifiedShareKeys,
  decryptFileKeyWithShareKey,
  importShareKeyRaw,

  // ── Master key / vault operations ─────────────────────────────────────────

  deriveKEK,
  generateMasterKey,
  encryptMasterKey,
  decryptMasterKey,
  generateRegistrationKeys,
  unlockMasterKey,
  unlockMasterKeyWithRecovery,
  reEncryptMasterKey,

  // ── Recovery key operations ───────────────────────────────────────────────

  generateRecoveryKey,
  parseRecoveryPhrase,
  generateRecoveryParams,
  decryptRecoveryKey,

  // ── Utilities ─────────────────────────────────────────────────────────────

  arrayBufferToBase64,
  base64ToArrayBuffer,
  generateRandomBytes,

  // ── Worker pool passthrough ───────────────────────────────────────────────

  /** Re-export PRIORITY constants for callers that need them */
  PRIORITY,
};

export default cryptoService;
