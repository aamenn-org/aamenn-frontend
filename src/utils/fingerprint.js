import FingerprintJS from '@fingerprintjs/fingerprintjs';

let cachedFingerprint = null;
let fpPromise = null;

/**
 * Get a device fingerprint for abuse detection.
 * Uses FingerprintJS (open-source) to generate a stable visitor ID
 * based on browser/device attributes.
 *
 * The fingerprint is cached for the session to avoid recalculation.
 *
 * @returns {Promise<string>} The visitor ID hash
 */
export async function getDeviceFingerprint() {
  if (cachedFingerprint) {
    return cachedFingerprint;
  }

  try {
    if (!fpPromise) {
      fpPromise = FingerprintJS.load();
    }

    const fp = await fpPromise;
    const result = await fp.get();
    cachedFingerprint = result.visitorId;
    return cachedFingerprint;
  } catch (error) {
    console.warn('Fingerprint generation failed:', error);
    return null;
  }
}
