/**
 * Performance Monitor
 * 
 * Tracks performance metrics for media loading, caching, and rendering.
 * Provides Web Vitals integration and app-specific metrics.
 */

interface PerformanceMetric {
  name: string;
  value: number;
  timestamp: number;
  metadata?: Record<string, any>;
}

class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private maxMetrics = 1000; // Keep last 1000 metrics
  private enabled = false; // Only enable in development

  constructor() {
    // Enable in development mode (check localStorage flag or default to false in production)
    const isDev = localStorage.getItem('perf_monitor_enabled') === 'true';
    this.enabled = isDev;
  }

  /**
   * Record a performance metric
   */
  record(name: string, value: number, metadata?: Record<string, any>): void {
    if (!this.enabled) return;

    const metric: PerformanceMetric = {
      name,
      value,
      timestamp: Date.now(),
      metadata,
    };

    this.metrics.push(metric);

    // Keep only recent metrics
    if (this.metrics.length > this.maxMetrics) {
      this.metrics.shift();
    }

    // Log to console when enabled
    if (this.enabled) {
      console.log(`[Perf] ${name}: ${value.toFixed(2)}ms`, metadata || '');
    }
  }

  /**
   * Mark the start of a timed operation
   */
  markStart(operationId: string): void {
    if (!this.enabled) return;
    performance.mark(`${operationId}_start`);
  }

  /**
   * Mark the end of a timed operation and record the duration
   */
  markEnd(operationId: string, metadata?: Record<string, any>): number {
    if (!this.enabled) return 0;

    const startMark = `${operationId}_start`;
    const endMark = `${operationId}_end`;

    performance.mark(endMark);

    try {
      const measure = performance.measure(operationId, startMark, endMark);
      const duration = measure.duration;

      this.record(operationId, duration, metadata);

      // Clean up marks
      performance.clearMarks(startMark);
      performance.clearMarks(endMark);
      performance.clearMeasures(operationId);

      return duration;
    } catch (err) {
      // Mark might not exist if markStart wasn't called
      return 0;
    }
  }

  /**
   * Record a cache hit
   */
  recordCacheHit(cacheType: 'L1' | 'L2' | 'L3', resourceType: string): void {
    this.record(`cache_hit_${cacheType}`, 1, { resourceType });
  }

  /**
   * Record a cache miss
   */
  recordCacheMiss(resourceType: string): void {
    this.record('cache_miss', 1, { resourceType });
  }

  /**
   * Get statistics for a specific metric
   */
  getStats(metricName: string): {
    count: number;
    avg: number;
    min: number;
    max: number;
    p50: number;
    p95: number;
    p99: number;
  } | null {
    const filtered = this.metrics.filter((m) => m.name === metricName);

    if (filtered.length === 0) return null;

    const values = filtered.map((m) => m.value).sort((a, b) => a - b);
    const sum = values.reduce((acc, v) => acc + v, 0);

    return {
      count: values.length,
      avg: sum / values.length,
      min: values[0],
      max: values[values.length - 1],
      p50: values[Math.floor(values.length * 0.5)],
      p95: values[Math.floor(values.length * 0.95)],
      p99: values[Math.floor(values.length * 0.99)],
    };
  }

  /**
   * Get cache hit rate for a specific cache layer
   */
  getCacheHitRate(cacheType: 'L1' | 'L2' | 'L3'): number {
    const hits = this.metrics.filter(
      (m) => m.name === `cache_hit_${cacheType}`
    ).length;
    const misses = this.metrics.filter((m) => m.name === 'cache_miss').length;
    const total = hits + misses;

    return total > 0 ? (hits / total) * 100 : 0;
  }

  /**
   * Get overall cache hit rate
   */
  getOverallCacheHitRate(): number {
    const allHits = this.metrics.filter((m) =>
      m.name.startsWith('cache_hit_')
    ).length;
    const misses = this.metrics.filter((m) => m.name === 'cache_miss').length;
    const total = allHits + misses;

    return total > 0 ? (allHits / total) * 100 : 0;
  }

  /**
   * Get all metrics summary
   */
  getSummary(): Record<string, any> {
    const uniqueMetrics = [...new Set(this.metrics.map((m) => m.name))];

    const summary: Record<string, any> = {
      totalMetrics: this.metrics.length,
      cacheHitRate: {
        overall: this.getOverallCacheHitRate().toFixed(2) + '%',
        L1: this.getCacheHitRate('L1').toFixed(2) + '%',
        L2: this.getCacheHitRate('L2').toFixed(2) + '%',
        L3: this.getCacheHitRate('L3').toFixed(2) + '%',
      },
      metrics: {},
    };

    for (const metricName of uniqueMetrics) {
      const stats = this.getStats(metricName);
      if (stats) {
        summary.metrics[metricName] = {
          count: stats.count,
          avg: stats.avg.toFixed(2) + 'ms',
          p95: stats.p95.toFixed(2) + 'ms',
        };
      }
    }

    return summary;
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics = [];
  }

  /**
   * Enable/disable monitoring
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
}

// Singleton instance
let instance: PerformanceMonitor | null = null;

export function getPerformanceMonitor(): PerformanceMonitor {
  if (!instance) {
    instance = new PerformanceMonitor();
  }
  return instance;
}
