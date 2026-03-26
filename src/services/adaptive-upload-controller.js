/**
 * AdaptiveUploadController — Adjusts chunk size and parallelism in real-time
 * based on measured throughput and network conditions.
 *
 * Used by the chunked upload service to optimise for both fast fibre
 * connections and high-latency MENA → EU links.
 */

const MIN_CHUNK = 5 * 1024 * 1024;      // 5 MB  — B2 minimum
const MAX_CHUNK = 100 * 1024 * 1024;     // 100 MB
const MIN_PARALLEL = 1;
const MAX_PARALLEL = 6;
const EVAL_INTERVAL = 5;                 // re-evaluate every N chunks
const MAX_SAMPLES = 20;

export class AdaptiveUploadController {
  /**
   * @param {number} totalFileSize — total encrypted file size in bytes
   */
  constructor(totalFileSize) {
    this.totalFileSize = totalFileSize;
    this.chunkSize = 10 * 1024 * 1024;   // 10 MB default
    this.maxParallel = 3;

    // Enforce B2 10 000-part limit with margin
    this._enforcePartsLimit();

    // Use Network Information API hint when available
    this._applyNetworkHint();

    /** @type {Array<{bytesPerSec: number, timestamp: number}>} */
    this.samples = [];
    this.chunksCompleted = 0;
    this.consecutiveErrors = 0;
    this.estimatedRtt = null;
  }

  // ─── Public API ───────────────────────────────────────────

  /** Record the result of a completed (or failed) chunk upload. */
  recordChunkResult(bytesUploaded, durationMs, hadError = false) {
    this.chunksCompleted++;

    if (hadError) {
      this.consecutiveErrors++;
    } else {
      this.consecutiveErrors = 0;
      if (durationMs > 0) {
        const bytesPerSec = (bytesUploaded / durationMs) * 1000;
        this.samples.push({ bytesPerSec, timestamp: Date.now() });
        if (this.samples.length > MAX_SAMPLES) this.samples.shift();
      }
    }

    if (this.chunksCompleted % EVAL_INTERVAL === 0) {
      this._adapt();
    }
  }

  /** Provide an RTT measurement (ms) derived from time-to-first-byte. */
  setRtt(rttMs) {
    this.estimatedRtt = rttMs;
  }

  getChunkSize() { return this.chunkSize; }
  getMaxParallel() { return this.maxParallel; }

  // ─── Internals ────────────────────────────────────────────

  _enforcePartsLimit() {
    const minRequired = Math.ceil(this.totalFileSize / 9500);
    if (minRequired > this.chunkSize) {
      this.chunkSize = Math.max(minRequired, MIN_CHUNK);
    }
  }

  _applyNetworkHint() {
    const conn = navigator.connection || navigator.mozConnection;
    if (!conn) return;

    const mbps = conn.downlink || 10;
    const rtt = conn.rtt || 100;

    if (mbps < 5 || conn.effectiveType === '3g') {
      this.chunkSize = 5 * 1024 * 1024;
      this.maxParallel = 2;
    } else if (mbps > 50 && rtt < 50) {
      this.chunkSize = 50 * 1024 * 1024;
      this.maxParallel = 5;
    }

    this._enforcePartsLimit();
  }

  _adapt() {
    // Immediate back-off on consecutive errors
    if (this.consecutiveErrors >= 2) {
      this.maxParallel = Math.max(MIN_PARALLEL, this.maxParallel - 1);
      this.consecutiveErrors = 0;
      return;
    }

    if (this.samples.length < 3) return;

    const recentAvg = this._weightedAvg(this.samples.slice(-5));
    const olderAvg = this.samples.length >= 10
      ? this._weightedAvg(this.samples.slice(-10, -5))
      : recentAvg;

    const bandwidthMbps = (recentAvg * 8) / (1024 * 1024);

    // Bandwidth-tier table
    if (bandwidthMbps < 5) {
      this.chunkSize = 5 * 1024 * 1024;
      this.maxParallel = Math.min(2, MAX_PARALLEL);
    } else if (bandwidthMbps < 20) {
      this.chunkSize = 10 * 1024 * 1024;
      this.maxParallel = Math.min(3, MAX_PARALLEL);
    } else if (bandwidthMbps < 50) {
      this.chunkSize = 20 * 1024 * 1024;
      this.maxParallel = Math.min(4, MAX_PARALLEL);
    } else if (bandwidthMbps < 100) {
      this.chunkSize = 50 * 1024 * 1024;
      this.maxParallel = Math.min(5, MAX_PARALLEL);
    } else {
      this.chunkSize = 100 * 1024 * 1024;
      this.maxParallel = MAX_PARALLEL;
    }

    // Latency adjustment for MENA users
    if (this.estimatedRtt && this.estimatedRtt > 100) {
      const rttMul = this.estimatedRtt > 300 ? 3 : this.estimatedRtt > 150 ? 2 : 1.5;
      this.chunkSize = Math.min(Math.round(this.chunkSize * rttMul), MAX_CHUNK);
      const extra = this.estimatedRtt > 150 ? 2 : 1;
      this.maxParallel = Math.min(this.maxParallel + extra, MAX_PARALLEL);
    }

    // Degrading throughput → reduce parallelism
    const trend = olderAvg > 0 ? recentAvg / olderAvg : 1;
    if (trend < 0.8 && this.maxParallel > MIN_PARALLEL) {
      this.maxParallel--;
    }

    this._enforcePartsLimit();
  }

  _weightedAvg(arr) {
    if (arr.length === 0) return 0;
    let wSum = 0;
    let wTotal = 0;
    for (let i = 0; i < arr.length; i++) {
      const w = i + 1;
      wSum += arr[i].bytesPerSec * w;
      wTotal += w;
    }
    return wSum / wTotal;
  }
}
