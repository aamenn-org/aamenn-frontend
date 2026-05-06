/**
 * SpeedTracker — Rolling-window speed and ETA calculator for uploads.
 *
 * Tracks bytes-uploaded samples over a sliding time window and computes:
 * - Current upload speed (bytes/sec)
 * - Estimated time remaining (seconds)
 *
 * Used by useUpload to feed UploadProgressPanel with real-time metrics.
 */

export class SpeedTracker {
  /** @param {number} windowMs — sliding window duration in ms (default 5 s) */
  constructor(windowMs = 5000) {
    /** @type {Array<{timestamp: number, bytes: number}>} */
    this.samples = [];
    this.windowMs = windowMs;
  }

  /** Record a cumulative bytes-uploaded sample. */
  addSample(bytesUploaded) {
    const now = Date.now();
    this.samples.push({ timestamp: now, bytes: bytesUploaded });
    // Prune samples outside the window
    const cutoff = now - this.windowMs;
    while (this.samples.length > 0 && this.samples[0].timestamp < cutoff) {
      this.samples.shift();
    }
  }

  /** Current speed in bytes per second. Returns 0 if insufficient data. */
  getSpeedBps() {
    if (this.samples.length < 2) return 0;
    const oldest = this.samples[0];
    const newest = this.samples[this.samples.length - 1];
    const timeDeltaSec = (newest.timestamp - oldest.timestamp) / 1000;
    if (timeDeltaSec <= 0) return 0;
    return (newest.bytes - oldest.bytes) / timeDeltaSec;
  }

  /** Estimated seconds remaining given the bytes still to upload. */
  getEtaSeconds(remainingBytes) {
    const speed = this.getSpeedBps();
    if (speed <= 0) return Infinity;
    return remainingBytes / speed;
  }

  /** Reset all samples (e.g. after pause/resume). */
  reset() {
    this.samples = [];
  }
}
