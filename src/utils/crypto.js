/**
 * Zero-Knowledge Encryption Utilities
 *
 * This module implements client-side encryption for AAMENN.
 * The server NEVER sees plaintext data - all encryption/decryption
 * happens in the browser using the Web Crypto API.
 *
 * Flow:
 * 1. Password → KDF(password, salt) → KEK (Key Encryption Key)
 * 2. Master Key encrypted with KEK → stored on server
 * 3. Files encrypted with per-file keys → uploaded to B2
 * 4. Per-file keys encrypted with Master Key → stored on server
 */

// KDF Configuration - must match backend expectations
export const KDF_CONFIG = {
  algorithm: 'pbkdf2',
  iterations: 100000,
  hashLength: 32,
};

// Debug logging - disabled in production
const DEBUG = false;
const log = (...args) => DEBUG && console.log('[Crypto]', ...args);

// ==================== UTILITIES ====================

/**
 * Convert ArrayBuffer to Base64 string
 */
export function arrayBufferToBase64(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert Base64 string to ArrayBuffer
 */
export function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Generate random bytes
 */
export function generateRandomBytes(length) {
  return crypto.getRandomValues(new Uint8Array(length));
}

/**
 * Compute SHA-1 hash of data (for B2 upload verification)
 */
export async function computeSHA1(data) {
  const buffer = data instanceof ArrayBuffer ? data : await data.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-1', buffer);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Compute SHA-256 hash of data (for duplicate detection)
 * This hash is computed on the ORIGINAL file content (before encryption)
 * to detect duplicates across uploads.
 */
export async function computeSHA256(data) {
  const buffer = data instanceof ArrayBuffer ? data : await data.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ==================== KEY DERIVATION ====================

/**
 * Derive Key Encryption Key (KEK) from password using PBKDF2
 * KEK = PBKDF2(password, salt, 100000 iterations)
 *
 * @param {string} password - User's password
 * @param {string} saltBase64 - Salt in base64 format
 * @returns {Promise<CryptoKey>} - KEK for encrypting/decrypting master key
 */
export async function deriveKEK(password, saltBase64) {
  log('Deriving KEK...');

  const encoder = new TextEncoder();
  const passwordKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  const salt = base64ToArrayBuffer(saltBase64);

  const kek = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: KDF_CONFIG.iterations,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false, // not extractable
    ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
  );

  log('KEK derived successfully');
  return kek;
}

/**
 * Generate a random Master Key (AES-256)
 * This key encrypts all per-file keys.
 *
 * @returns {Promise<CryptoKey>} - New master key
 */
export async function generateMasterKey() {
  const masterKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true, // extractable (so we can encrypt it)
    ['encrypt', 'decrypt']
  );

  return masterKey;
}

/**
 * Encrypt Master Key with KEK
 * Returns: base64(IV + ciphertext + authTag)
 *
 * @param {CryptoKey} masterKeyToEncrypt - The master key to encrypt
 * @param {CryptoKey} kek - Key Encryption Key derived from password
 * @returns {Promise<string>} - Encrypted master key as base64
 */
export async function encryptMasterKey(masterKeyToEncrypt, kek) {
  // Export master key to raw bytes
  const masterKeyBytes = await crypto.subtle.exportKey(
    'raw',
    masterKeyToEncrypt
  );

  // Generate IV (12 bytes for AES-GCM)
  const iv = generateRandomBytes(12);

  // Encrypt with KEK
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    kek,
    masterKeyBytes
  );

  // Combine IV + ciphertext
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return arrayBufferToBase64(combined);
}

/**
 * Decrypt Master Key with KEK
 *
 * @param {string} encryptedMasterKeyBase64 - Encrypted master key from server
 * @param {CryptoKey} kek - Key Encryption Key derived from password
 * @returns {Promise<CryptoKey>} - Decrypted master key
 */
export async function decryptMasterKey(encryptedMasterKeyBase64, kek) {
  try {
    log('Decrypting master key...');

    const combined = new Uint8Array(
      base64ToArrayBuffer(encryptedMasterKeyBase64)
    );

    // Extract IV and ciphertext
    const iv = combined.slice(0, 12);
    const ciphertext = combined.slice(12);

    // Decrypt
    const masterKeyBytes = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv },
      kek,
      ciphertext
    );

    // Import as CryptoKey
    const decryptedMasterKey = await crypto.subtle.importKey(
      'raw',
      masterKeyBytes,
      { name: 'AES-GCM', length: 256 },
      true, // extractable for file key wrapping
      ['encrypt', 'decrypt']
    );

    log('Master key decrypted successfully');
    return decryptedMasterKey;
  } catch (error) {
    console.error('[Crypto] Decryption failed:', error);
    throw error;
  }
}

// ==================== FILE ENCRYPTION ====================

/**
 * Generate a random file key (AES-256)
 * Each file gets its own unique key.
 *
 * @returns {Promise<CryptoKey>} - New file key
 */
export async function generateFileKey() {
  return await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true, // extractable
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt a file with a file-specific key
 *
 * @param {ArrayBuffer} fileData - Raw file data
 * @param {CryptoKey} fileKey - File-specific encryption key
 * @returns {Promise<{encryptedData: ArrayBuffer, iv: Uint8Array}>}
 */
export async function encryptFile(fileData, fileKey) {
  const iv = generateRandomBytes(12);

  const encryptedData = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    fileKey,
    fileData
  );

  return { encryptedData, iv };
}

/**
 * Decrypt a file with a file-specific key
 *
 * @param {ArrayBuffer} encryptedData - Encrypted file data
 * @param {CryptoKey} fileKey - File-specific encryption key
 * @param {Uint8Array} iv - Initialization vector used during encryption
 * @returns {Promise<ArrayBuffer>} - Decrypted file data
 */
export async function decryptFile(encryptedData, fileKey, iv) {
  return await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv },
    fileKey,
    encryptedData
  );
}

/**
 * Encrypt file key with master key (for storage on server)
 *
 * @param {CryptoKey} fileKey - The file key to encrypt
 * @param {CryptoKey} masterKey - User's master key
 * @returns {Promise<string>} - Encrypted file key as base64 (IV + ciphertext)
 */
export async function encryptFileKey(fileKey, masterKey) {
  // Export file key to raw bytes
  const fileKeyBytes = await crypto.subtle.exportKey('raw', fileKey);

  // Generate IV
  const iv = generateRandomBytes(12);

  // Encrypt with master key
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    masterKey,
    fileKeyBytes
  );

  // Combine IV + ciphertext
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return arrayBufferToBase64(combined);
}

/**
 * Decrypt file key with master key
 *
 * @param {string} encryptedFileKeyBase64 - Encrypted file key from server
 * @param {CryptoKey} masterKey - User's master key
 * @returns {Promise<CryptoKey>} - Decrypted file key
 */
export async function decryptFileKey(encryptedFileKeyBase64, masterKey) {
  const combined = new Uint8Array(base64ToArrayBuffer(encryptedFileKeyBase64));

  // Extract IV and ciphertext
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  // Decrypt
  const fileKeyBytes = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv },
    masterKey,
    ciphertext
  );

  // Import as CryptoKey
  return await crypto.subtle.importKey(
    'raw',
    fileKeyBytes,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypt filename (stored encrypted on server)
 *
 * @param {string} filename - Original filename
 * @param {CryptoKey} masterKey - User's master key
 * @returns {Promise<string>} - Encrypted filename as base64
 */
export async function encryptFilename(filename, masterKey) {
  const encoder = new TextEncoder();
  const filenameBytes = encoder.encode(filename);

  const iv = generateRandomBytes(12);

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    masterKey,
    filenameBytes
  );

  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return arrayBufferToBase64(combined);
}

/**
 * Decrypt filename
 *
 * @param {string} encryptedFilenameBase64 - Encrypted filename from server
 * @param {CryptoKey} masterKey - User's master key
 * @returns {Promise<string>} - Decrypted filename
 */
export async function decryptFilename(encryptedFilenameBase64, masterKey) {
  const combined = new Uint8Array(base64ToArrayBuffer(encryptedFilenameBase64));

  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  const filenameBytes = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: iv },
    masterKey,
    ciphertext
  );

  const decoder = new TextDecoder();
  return decoder.decode(filenameBytes);
}

// ==================== REGISTRATION & LOGIN HELPERS ====================

/**
 * Generate all encryption parameters for registration
 *
 * @param {string} password - User's password
 * @returns {Promise<{encryptedMasterKey: string, kekSalt: string, kdfParams: object, masterKey: CryptoKey}>}
 */
export async function generateRegistrationKeys(password) {
  // Step 1: Generate random salt (16 bytes)
  const saltBytes = generateRandomBytes(16);
  const kekSalt = arrayBufferToBase64(saltBytes);

  // Step 2: Derive KEK from password
  const kek = await deriveKEK(password, kekSalt);

  // Step 3: Generate random Master Key
  const masterKey = await generateMasterKey();

  // Step 4: Encrypt Master Key with KEK
  const encryptedMasterKey = await encryptMasterKey(masterKey, kek);

  return {
    encryptedMasterKey,
    kekSalt,
    kdfParams: KDF_CONFIG,
    masterKey, // Keep this in memory only!
  };
}

/**
 * Decrypt master key after login
 *
 * @param {string} password - User's password
 * @param {string} encryptedMasterKey - From server
 * @param {string} kekSalt - From server
 * @returns {Promise<CryptoKey>} - Decrypted master key
 */
export async function unlockMasterKey(password, encryptedMasterKey, kekSalt) {
  // Derive KEK from password using same salt
  const kek = await deriveKEK(password, kekSalt);

  // Decrypt master key
  const masterKey = await decryptMasterKey(encryptedMasterKey, kek);

  return masterKey;
}

/**
 * Re-encrypt master key with a new password (for password change)
 *
 * This function is used when changing the user's password.
 * The master key itself doesn't change - only its encryption wrapper.
 *
 * Flow:
 * 1. Decrypt master key with old KEK (derived from current password)
 * 2. Generate new salt for new KEK
 * 3. Derive new KEK from new password
 * 4. Re-encrypt master key with new KEK
 *
 * @param {string} currentPassword - Current password
 * @param {string} newPassword - New password
 * @param {string} encryptedMasterKeyBase64 - Current encrypted master key
 * @param {string} currentSaltBase64 - Current KEK salt
 * @returns {Promise<{newEncryptedMasterKey: string, newKekSalt: string}>}
 */
export async function reEncryptMasterKey(
  currentPassword,
  newPassword,
  encryptedMasterKeyBase64,
  currentSaltBase64
) {
  log('Re-encrypting master key for password change...');

  // Step 1: Derive old KEK from current password
  const oldKek = await deriveKEK(currentPassword, currentSaltBase64);

  // Step 2: Decrypt master key with old KEK
  const masterKey = await decryptMasterKey(encryptedMasterKeyBase64, oldKek);

  // Step 3: Generate new salt for new KEK
  const newSalt = generateRandomBytes(32);
  const newKekSalt = arrayBufferToBase64(newSalt);

  // Step 4: Derive new KEK from new password
  const newKek = await deriveKEK(newPassword, newKekSalt);

  // Step 5: Re-encrypt master key with new KEK
  const newEncryptedMasterKey = await encryptMasterKey(masterKey, newKek);

  log('Master key re-encrypted successfully');

  return {
    newEncryptedMasterKey,
    newKekSalt,
  };
}

export default {
  KDF_CONFIG,
  arrayBufferToBase64,
  base64ToArrayBuffer,
  generateRandomBytes,
  computeSHA1,
  deriveKEK,
  generateMasterKey,
  encryptMasterKey,
  decryptMasterKey,
  generateFileKey,
  encryptFile,
  decryptFile,
  encryptFileKey,
  decryptFileKey,
  encryptFilename,
  decryptFilename,
  generateRegistrationKeys,
  unlockMasterKey,
  reEncryptMasterKey,
};
