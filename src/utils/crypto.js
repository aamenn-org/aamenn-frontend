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
 *
 * Browser Compatibility:
 * - Safari 11+ for SubtleCrypto (Safari 15+ for secure context requirement)
 * - Chrome 37+, Firefox 34+, Edge 79+
 */

// KDF Configuration - must match backend expectations
const KDF_CONFIG = {
  algorithm: 'pbkdf2',
  iterations: 100000,
  hashLength: 32,
};

// Debug logging - disabled in production
const DEBUG = false;
const log = (...args) => DEBUG && console.log('[Crypto]', ...args);

// ==================== BROWSER DETECTION ====================

/**
 * Detect Safari browser for workarounds
 */
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

/**
 * Check if Web Crypto API is available (requires secure context in modern browsers)
 */
function isCryptoAvailable() {
  if (!crypto || !crypto.subtle) {
    console.error(
      '[Crypto] Web Crypto API not available. Ensure you are using HTTPS.'
    );
    return false;
  }
  return true;
}

// ==================== UTILITIES ====================

/**
 * Convert ArrayBuffer to Base64 string
 * Safari-compatible: chunked to avoid "Maximum call stack size exceeded"
 */
export function arrayBufferToBase64(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const CHUNK_SIZE = 8192;
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += CHUNK_SIZE) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + CHUNK_SIZE, bytes.byteLength)));
  }
  return btoa(binary);
}

/**
 * Convert Base64 string to ArrayBuffer
 */
export function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

/**
 * Generate random bytes
 */
export function generateRandomBytes(length) {
  return crypto.getRandomValues(new Uint8Array(length));
}

// ==================== PRIVATE HELPERS ====================

/**
 * Normalize input data to ArrayBuffer for SubtleCrypto (Safari-compatible)
 */
async function _normalizeToBuffer(data, label) {
  if (data instanceof ArrayBuffer) return data;
  if (data instanceof Uint8Array) return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
  if (data.arrayBuffer) return data.arrayBuffer();
  throw new Error(`Unsupported data type for ${label}`);
}

/**
 * AES-GCM encrypt plaintext with key. Returns base64(IV + ciphertext).
 */
async function _aesGcmEncrypt(key, plaintext) {
  const iv = generateRandomBytes(12);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  const combined = new Uint8Array(12 + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), 12);
  return arrayBufferToBase64(combined);
}

/**
 * AES-GCM decrypt base64(IV + ciphertext) with key. Returns ArrayBuffer.
 */
async function _aesGcmDecrypt(key, base64) {
  const combined = new Uint8Array(base64ToArrayBuffer(base64));
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv: combined.slice(0, 12) }, key, combined.slice(12));
}

/**
 * Generate a random AES-256-GCM CryptoKey.
 */
async function _generateAesKey() {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

/**
 * Derive an AES-GCM KEK from raw key bytes using PBKDF2.
 */
async function _deriveKekFromBytes(keyBytes, saltBytes, iterations) {
  const keyMaterial = await crypto.subtle.importKey('raw', keyBytes, { name: 'PBKDF2' }, false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: saltBytes, iterations: iterations || KDF_CONFIG.iterations, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Convert bytes to hex recovery phrase (groups of 4 hex chars separated by dashes).
 */
function _bytesToHexPhrase(bytes) {
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  const groups = [];
  for (let i = 0; i < hex.length; i += 4) groups.push(hex.slice(i, i + 4));
  return groups.join('-');
}

// ==================== HASH FUNCTIONS ====================

/**
 * Compute SHA-1 hash of data (for B2 upload verification)
 */
export async function computeSHA1(data) {
  if (!isCryptoAvailable()) throw new Error('Web Crypto API not available');
  const buffer = await _normalizeToBuffer(data, 'SHA-1');
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-1', buffer)))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Compute SHA-256 hash of data (for duplicate detection)
 * Computed on ORIGINAL file content (before encryption) to detect duplicates.
 */
export async function computeSHA256(data) {
  if (!isCryptoAvailable()) throw new Error('Web Crypto API not available');
  const buffer = await _normalizeToBuffer(data, 'SHA-256');
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)))
    .map(b => b.toString(16).padStart(2, '0')).join('');
}

// ==================== KEY DERIVATION ====================

/**
 * Derive Key Encryption Key (KEK) from password using PBKDF2
 *
 * @param {string} password - User's password
 * @param {string} saltBase64 - Salt in base64 format
 * @returns {Promise<CryptoKey>} - KEK for encrypting/decrypting master key
 */
export async function deriveKEK(password, saltBase64) {
  log('Deriving KEK...');
  const passwordKey = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits', 'deriveKey']
  );
  const kek = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: base64ToArrayBuffer(saltBase64), iterations: KDF_CONFIG.iterations, hash: 'SHA-256' },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
  );
  log('KEK derived successfully');
  return kek;
}

/**
 * Generate a random Master Key (AES-256). This key encrypts all per-file keys.
 *
 * @returns {Promise<CryptoKey>} - New master key
 */
export const generateMasterKey = _generateAesKey;

/**
 * Encrypt Master Key with KEK. Returns: base64(IV + ciphertext)
 *
 * @param {CryptoKey} keyToEncrypt - The master key to encrypt
 * @param {CryptoKey} wrappingKey - KEK derived from password
 * @returns {Promise<string>} - Encrypted master key as base64
 */
export async function encryptMasterKey(keyToEncrypt, wrappingKey) {
  const keyBytes = await crypto.subtle.exportKey('raw', keyToEncrypt);
  return _aesGcmEncrypt(wrappingKey, keyBytes);
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
    const masterKeyBytes = await _aesGcmDecrypt(kek, encryptedMasterKeyBase64);
    const masterKey = await crypto.subtle.importKey(
      'raw', masterKeyBytes, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
    );
    log('Master key decrypted successfully');
    return masterKey;
  } catch (error) {
    console.error('[Crypto] Decryption failed:', error);
    throw error;
  }
}

// ==================== FILE ENCRYPTION ====================

/**
 * Generate a random file key (AES-256). Each file gets its own unique key.
 *
 * @returns {Promise<CryptoKey>} - New file key
 */
export const generateFileKey = _generateAesKey;

/**
 * Encrypt a file with a file-specific key
 *
 * @param {ArrayBuffer} fileData - Raw file data
 * @param {CryptoKey} fileKey - File-specific encryption key
 * @returns {Promise<{encryptedData: ArrayBuffer, iv: Uint8Array}>}
 */
export async function encryptFile(fileData, fileKey) {
  const iv = generateRandomBytes(12);
  const encryptedData = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, fileKey, fileData);
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
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv }, fileKey, encryptedData);
}

/**
 * Encrypt file key with master key (for storage on server)
 *
 * @param {CryptoKey} fileKey - The file key to encrypt
 * @param {CryptoKey} masterKey - User's master key
 * @returns {Promise<string>} - Encrypted file key as base64 (IV + ciphertext)
 */
export async function encryptFileKey(fileKey, masterKey) {
  const fileKeyBytes = await crypto.subtle.exportKey('raw', fileKey);
  return _aesGcmEncrypt(masterKey, fileKeyBytes);
}

/**
 * Decrypt file key with master key
 *
 * @param {string} encryptedFileKeyBase64 - Encrypted file key from server
 * @param {CryptoKey} masterKey - User's master key
 * @returns {Promise<CryptoKey>} - Decrypted file key
 */
export async function decryptFileKey(encryptedFileKeyBase64, masterKey) {
  const fileKeyBytes = await _aesGcmDecrypt(masterKey, encryptedFileKeyBase64);
  return crypto.subtle.importKey(
    'raw', fileKeyBytes, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']
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
  return _aesGcmEncrypt(masterKey, new TextEncoder().encode(filename));
}

/**
 * Decrypt filename
 *
 * @param {string} encryptedFilenameBase64 - Encrypted filename from server
 * @param {CryptoKey} masterKey - User's master key
 * @returns {Promise<string>} - Decrypted filename
 */
export async function decryptFilename(encryptedFilenameBase64, masterKey) {
  const filenameBytes = await _aesGcmDecrypt(masterKey, encryptedFilenameBase64);
  return new TextDecoder().decode(filenameBytes);
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

// ==================== RECOVERY KEY HELPERS ====================

/**
 * Generate a human-readable recovery key (192 bits of entropy).
 * Format: groups of 4 hex chars separated by dashes, e.g. "a3f1-b2c4-d5e6-..."
 *
 * @returns {{ recoveryPhrase: string, recoveryKeyBytes: Uint8Array }}
 */
export function generateRecoveryKey() {
  const recoveryKeyBytes = generateRandomBytes(24);
  return { recoveryPhrase: _bytesToHexPhrase(recoveryKeyBytes), recoveryKeyBytes };
}

/**
 * Parse a recovery phrase back to bytes.
 *
 * @param {string} recoveryPhrase - e.g. "a3f1-b2c4-d5e6-..."
 * @returns {Uint8Array}
 */
export function parseRecoveryPhrase(recoveryPhrase) {
  const hex = recoveryPhrase.replace(/-/g, '').replace(/\s/g, '');
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

/**
 * Generate recovery encryption params.
 * Encrypts the masterKey with a KEK derived from the recovery key.
 * Also encrypts the recovery key bytes with the masterKey (for "view later" in Settings).
 *
 * @param {CryptoKey} masterKey - The user's master key
 * @returns {Promise<{ recoveryPhrase, recoveryEncryptedMasterKey, recoverySalt, recoveryKdfParams, encryptedRecoveryKey }>}
 */
export async function generateRecoveryParams(masterKey) {
  log('Generating recovery key params...');

  const { recoveryPhrase, recoveryKeyBytes } = generateRecoveryKey();
  const recoverySaltBytes = generateRandomBytes(16);
  const recoverySalt = arrayBufferToBase64(recoverySaltBytes);

  const recoveryKek = await _deriveKekFromBytes(recoveryKeyBytes, recoverySaltBytes);
  const recoveryEncryptedMasterKey = await encryptMasterKey(masterKey, recoveryKek);
  const encryptedRecoveryKey = await _aesGcmEncrypt(masterKey, recoveryKeyBytes);

  log('Recovery key params generated');
  return { recoveryPhrase, recoveryEncryptedMasterKey, recoverySalt, recoveryKdfParams: KDF_CONFIG, encryptedRecoveryKey };
}

/**
 * Decrypt the masterKey using a recovery key (for forgot-password flow).
 *
 * @param {string} recoveryPhrase - The user's recovery phrase
 * @param {string} recoveryEncryptedMasterKey - From server
 * @param {string} recoverySalt - From server
 * @param {object} recoveryKdfParams - From server
 * @returns {Promise<CryptoKey>} - Decrypted master key
 */
export async function unlockMasterKeyWithRecovery(
  recoveryPhrase,
  recoveryEncryptedMasterKey,
  recoverySalt,
  recoveryKdfParams
) {
  log('Unlocking master key with recovery key...');
  const recoveryKeyBytes = parseRecoveryPhrase(recoveryPhrase);
  const recoverySaltBytes = new Uint8Array(base64ToArrayBuffer(recoverySalt));
  const recoveryKek = await _deriveKekFromBytes(recoveryKeyBytes, recoverySaltBytes, recoveryKdfParams?.iterations);
  const masterKey = await decryptMasterKey(recoveryEncryptedMasterKey, recoveryKek);
  log('Master key unlocked with recovery key');
  return masterKey;
}

/**
 * Decrypt the recovery key using the masterKey (for "view recovery key" in Settings).
 *
 * @param {string} encryptedRecoveryKeyBase64 - From server
 * @param {CryptoKey} masterKey - User's master key
 * @returns {Promise<string>} - Recovery phrase
 */
export async function decryptRecoveryKey(encryptedRecoveryKeyBase64, masterKey) {
  const recoveryKeyBytes = await _aesGcmDecrypt(masterKey, encryptedRecoveryKeyBase64);
  return _bytesToHexPhrase(new Uint8Array(recoveryKeyBytes));
}

// ==================== CONTACT ENCRYPTION ====================

/**
 * Encrypt contact field with master key
 * @param {string} plaintext - Contact field value (name, phone, email, etc.)
 * @param {CryptoKey} masterKey - User's master key
 * @returns {Promise<string>} - Encrypted value as base64
 */
export async function encryptContactField(plaintext, masterKey) {
  if (!plaintext) return null;
  if (!isCryptoAvailable()) throw new Error('Web Crypto API not available');
  
  const plaintextBytes = new TextEncoder().encode(plaintext);
  return _aesGcmEncrypt(masterKey, plaintextBytes);
}

/**
 * Decrypt contact field with master key
 * @param {string} encryptedBase64 - Encrypted contact field
 * @param {CryptoKey} masterKey - User's master key
 * @returns {Promise<string>} - Decrypted plaintext
 */
export async function decryptContactField(encryptedBase64, masterKey) {
  if (!encryptedBase64) return null;
  if (!isCryptoAvailable()) throw new Error('Web Crypto API not available');
  
  try {
    const decryptedBytes = await _aesGcmDecrypt(masterKey, encryptedBase64);
    return new TextDecoder().decode(decryptedBytes);
  } catch (error) {
    console.error('[Crypto] Failed to decrypt contact field:', error);
    return '[Decryption Failed]';
  }
}

/**
 * Encrypt entire contact object
 * @param {Object} contact - Contact object with plaintext fields
 * @param {CryptoKey} masterKey - User's master key
 * @returns {Promise<Object>} - Contact object with encrypted fields
 */
export async function encryptContact(contact, masterKey) {
  const encrypted = {};
  
  const fields = ['name', 'nickname', 'phone', 'email', 'address', 'organization', 'occupation', 'birthday', 'bio', 'urls', 'photoUrl'];
  
  for (const field of fields) {
    if (contact[field]) {
      encrypted[field + 'Encrypted'] = await encryptContactField(contact[field], masterKey);
    }
  }
  
  return encrypted;
}

/**
 * Decrypt entire contact object
 * @param {Object} contact - Contact object with encrypted fields
 * @param {CryptoKey} masterKey - User's master key
 * @returns {Promise<Object>} - Contact object with decrypted fields
 */
export async function decryptContact(contact, masterKey) {
  const decrypted = { ...contact };
  
  const fields = ['name', 'nickname', 'phone', 'email', 'address', 'organization', 'occupation', 'birthday', 'bio', 'urls', 'photoUrl'];
  
  for (const field of fields) {
    const encField = field + 'Encrypted';
    if (contact[encField]) {
      decrypted[field] = await decryptContactField(contact[encField], masterKey);
    }
  }
  
  return decrypted;
}

// ==================== SHARE KEY FUNCTIONS ====================

/**
 * Generate a share key for sharing files with others
 * @param {string} cipherFileKeyBase64 - Encrypted file key from server
 * @param {CryptoKey} masterKey - User's master key
 * @returns {Promise<{shareKey: string, shareKeyRaw: string}>}
 */
export async function generateShareKey(cipherFileKeyBase64, masterKey) {
  if (!isCryptoAvailable()) throw new Error('Web Crypto API not available');
  
  // Decrypt the file key with master key
  const fileKeyBytes = await _aesGcmDecrypt(masterKey, cipherFileKeyBase64);
  
  // Generate a new random share key
  const shareKeyRaw = generateRandomBytes(32);
  const shareKeyForEncryption = await crypto.subtle.importKey(
    'raw',
    shareKeyRaw,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
  
  // Re-encrypt the file key with the share key
  const shareKey = await _aesGcmEncrypt(shareKeyForEncryption, fileKeyBytes);
  
  return {
    shareKey, // base64, stored on server
    shareKeyRaw: arrayBufferToBase64(shareKeyRaw), // base64, goes in URL fragment
  };
}

/**
 * Decrypt a file key using a share key (for public viewers)
 * @param {string} shareKeyRawBase64 - Raw share key from URL fragment
 * @param {string} encryptedFileKeyBase64 - Encrypted file key from server
 * @returns {Promise<CryptoKey>} - Decrypted file key
 */
export async function decryptFileKeyWithShareKey(shareKeyRawBase64, encryptedFileKeyBase64) {
  if (!isCryptoAvailable()) throw new Error('Web Crypto API not available');
  
  // Import raw share key (32 bytes = 256 bits)
  const shareKeyRawBytes = base64ToArrayBuffer(shareKeyRawBase64);
  const shareKey = await crypto.subtle.importKey(
    'raw',
    shareKeyRawBytes,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  
  // Decrypt file key (which was encrypted with the share key)
  const fileKeyBytes = await _aesGcmDecrypt(shareKey, encryptedFileKeyBase64);
  
  // Import as CryptoKey
  return await crypto.subtle.importKey(
    'raw',
    fileKeyBytes,
    { name: 'AES-GCM', length: 256 },
    true,
    ['decrypt']
  );
}

/**
 * Generate share keys for an entire folder.
 * Creates ONE random share key and re-encrypts each file's key + the folder name with it.
 *
 * @param {Array<{fileId: string, cipherFileKey: string}>} files - Files in the folder
 * @param {CryptoKey} masterKey - User's master key
 * @param {string} folderNameEncrypted - Encrypted folder name (base64)
 * @returns {Promise<{shareKeyRaw: string, shareKey: string, fileKeys: Record<string, string>}>}
 */
export async function generateFolderShareKeys(files, masterKey, folderNameEncrypted) {
  if (!isCryptoAvailable()) throw new Error('Web Crypto API not available');

  // Generate ONE random share key for the entire folder
  const shareKeyRawBytes = generateRandomBytes(32);
  const shareKeyForEncryption = await crypto.subtle.importKey(
    'raw', shareKeyRawBytes, { name: 'AES-GCM', length: 256 }, false, ['encrypt']
  );

  // Re-encrypt the folder name with the share key
  // Decrypt folder name with master key → plaintext bytes → re-encrypt with share key
  const folderNameBytes = await _aesGcmDecrypt(masterKey, folderNameEncrypted);
  const shareKey = await _aesGcmEncrypt(shareKeyForEncryption, folderNameBytes);

  // Re-encrypt each file's key with the folder share key
  const fileKeys = {};
  for (const file of files) {
    if (!file.cipherFileKey) continue;
    // Decrypt file key with master key → raw file key bytes
    const fileKeyBytes = await _aesGcmDecrypt(masterKey, file.cipherFileKey);
    // Re-encrypt with folder share key
    fileKeys[file.fileId] = await _aesGcmEncrypt(shareKeyForEncryption, fileKeyBytes);
  }

  return {
    shareKeyRaw: arrayBufferToBase64(shareKeyRawBytes), // goes in URL fragment
    shareKey, // folder name encrypted with share key, stored on server
    fileKeys, // { fileId: fileKey encrypted with share key }, stored on server
  };
}

/**
 * Decrypt text (e.g. folder name) using a share key raw from URL fragment.
 * @param {string} shareKeyRawBase64 - Raw share key from URL fragment
 * @param {string} encryptedTextBase64 - Encrypted text from server (shareKey field)
 * @returns {Promise<string>} - Decrypted text string
 */
export async function decryptTextWithShareKey(shareKeyRawBase64, encryptedTextBase64) {
  if (!isCryptoAvailable()) throw new Error('Web Crypto API not available');

  const shareKeyRawBytes = base64ToArrayBuffer(shareKeyRawBase64);
  const shareKey = await crypto.subtle.importKey(
    'raw', shareKeyRawBytes, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
  );

  const decryptedBytes = await _aesGcmDecrypt(shareKey, encryptedTextBase64);
  return new TextDecoder().decode(decryptedBytes);
}


