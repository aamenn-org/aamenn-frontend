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
 * Safari-compatible implementation using chunked processing to avoid call stack issues
 */
export function arrayBufferToBase64(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  // Safari can have issues with very large strings in String.fromCharCode
  // Process in chunks to avoid "Maximum call stack size exceeded"
  const CHUNK_SIZE = 8192;
  let binary = '';

  for (let i = 0; i < bytes.byteLength; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, Math.min(i + CHUNK_SIZE, bytes.byteLength));
    binary += String.fromCharCode.apply(null, chunk);
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
 * Includes Safari workaround for ArrayBuffer handling
 */
export async function computeSHA1(data) {
  if (!isCryptoAvailable()) {
    throw new Error('Web Crypto API not available');
  }

  // Ensure we have an ArrayBuffer (Safari may need explicit conversion)
  let buffer;
  if (data instanceof ArrayBuffer) {
    buffer = data;
  } else if (data instanceof Uint8Array) {
    buffer = data.buffer.slice(
      data.byteOffset,
      data.byteOffset + data.byteLength
    );
  } else if (data.arrayBuffer) {
    buffer = await data.arrayBuffer();
  } else {
    throw new Error('Unsupported data type for SHA-1');
  }

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
 * Includes Safari workaround for ArrayBuffer handling
 */
export async function computeSHA256(data) {
  if (!isCryptoAvailable()) {
    throw new Error('Web Crypto API not available');
  }

  // Ensure we have an ArrayBuffer (Safari may need explicit conversion)
  let buffer;
  if (data instanceof ArrayBuffer) {
    buffer = data;
  } else if (data instanceof Uint8Array) {
    buffer = data.buffer.slice(
      data.byteOffset,
      data.byteOffset + data.byteLength
    );
  } else if (data.arrayBuffer) {
    buffer = await data.arrayBuffer();
  } else {
    throw new Error('Unsupported data type for SHA-256');
  }

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

// ==================== RECOVERY KEY HELPERS ====================

/**
 * Generate a human-readable recovery key (24 random words).
 * Uses a compact 256-word list for simplicity. 24 words = 192 bits of entropy.
 *
 * @returns {{ recoveryPhrase: string, recoveryKeyBytes: Uint8Array }}
 */
export function generateRecoveryKey() {
  // Generate 24 bytes of randomness (192 bits)
  const recoveryKeyBytes = generateRandomBytes(24);

  // Convert to a display-friendly format: groups of 4 hex chars separated by dashes
  // e.g. "a3f1-b2c4-d5e6-..."  (24 bytes = 48 hex chars = 12 groups)
  const hex = Array.from(recoveryKeyBytes).map(b => b.toString(16).padStart(2, '0')).join('');
  const groups = [];
  for (let i = 0; i < hex.length; i += 4) {
    groups.push(hex.slice(i, i + 4));
  }
  const recoveryPhrase = groups.join('-');

  return { recoveryPhrase, recoveryKeyBytes };
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
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * Generate recovery encryption params.
 * Encrypts the masterKey with a KEK derived from the recovery key.
 * Also encrypts the recovery key with the masterKey (for "view later" in Settings).
 *
 * @param {CryptoKey} masterKey - The user's master key
 * @returns {Promise<{
 *   recoveryPhrase: string,
 *   recoveryEncryptedMasterKey: string,
 *   recoverySalt: string,
 *   recoveryKdfParams: object,
 *   encryptedRecoveryKey: string
 * }>}
 */
export async function generateRecoveryParams(masterKey) {
  log('Generating recovery key params...');

  // Step 1: Generate recovery key
  const { recoveryPhrase, recoveryKeyBytes } = generateRecoveryKey();

  // Step 2: Derive a KEK from the recovery key bytes
  const recoverySaltBytes = generateRandomBytes(16);
  const recoverySalt = arrayBufferToBase64(recoverySaltBytes);

  // Import recovery key bytes as PBKDF2 key material
  const recoveryKeyMaterial = await crypto.subtle.importKey(
    'raw',
    recoveryKeyBytes,
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  const recoveryKek = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: recoverySaltBytes,
      iterations: KDF_CONFIG.iterations,
      hash: 'SHA-256',
    },
    recoveryKeyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  // Step 3: Encrypt masterKey with recovery KEK
  const recoveryEncryptedMasterKey = await encryptMasterKey(masterKey, recoveryKek);

  // Step 4: Encrypt recovery key bytes with masterKey (for "view later")
  const iv = generateRandomBytes(12);
  const encryptedRecoveryBytes = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    masterKey,
    recoveryKeyBytes
  );
  const combined = new Uint8Array(iv.length + encryptedRecoveryBytes.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encryptedRecoveryBytes), iv.length);
  const encryptedRecoveryKey = arrayBufferToBase64(combined);

  log('Recovery key params generated');

  return {
    recoveryPhrase,
    recoveryEncryptedMasterKey,
    recoverySalt,
    recoveryKdfParams: KDF_CONFIG,
    encryptedRecoveryKey,
  };
}

/**
 * Decrypt the masterKey using a recovery key (for forgot-password flow).
 *
 * @param {string} recoveryPhrase - The user's recovery phrase
 * @param {string} recoveryEncryptedMasterKey - From server
 * @param {string} recoverySalt - From server
 * @param {object} recoveryKdfParams - From server (unused currently, uses KDF_CONFIG)
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

  // Derive recovery KEK
  const recoveryKeyMaterial = await crypto.subtle.importKey(
    'raw',
    recoveryKeyBytes,
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  const recoveryKek = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: recoverySaltBytes,
      iterations: (recoveryKdfParams?.iterations) || KDF_CONFIG.iterations,
      hash: 'SHA-256',
    },
    recoveryKeyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );

  // Decrypt master key
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
  const combined = new Uint8Array(base64ToArrayBuffer(encryptedRecoveryKeyBase64));
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  const recoveryKeyBytes = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    masterKey,
    ciphertext
  );

  // Convert bytes back to hex phrase
  const bytes = new Uint8Array(recoveryKeyBytes);
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  const groups = [];
  for (let i = 0; i < hex.length; i += 4) {
    groups.push(hex.slice(i, i + 4));
  }
  return groups.join('-');
}

