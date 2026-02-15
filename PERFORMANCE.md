# Performance Optimizations

This document describes the performance improvements implemented for media (photos/docs/files) handling in the frontend.

## Overview

The frontend implements a multi-layer caching and optimization strategy to provide fast, responsive media browsing with minimal memory usage and network overhead.

## Key Improvements (Iteration 1)

### 1. Blob URL Lifecycle Management

**Problem**: Blob URLs created via `URL.createObjectURL()` were never revoked, causing memory leaks during long sessions.

**Solution**: 
- Added automatic `URL.revokeObjectURL()` calls when cache entries are evicted
- Implemented in `SimpleLRUCache` with `onEvict` callback
- Revokes URLs on: cache eviction, explicit deletion, and cache clear

**Impact**: Prevents memory growth in long browsing sessions

### 2. Bounded Disk Cache with TTL

**Problem**: IndexedDB cache could grow unbounded, consuming excessive disk space.

**Solution**:
- Added TTL-based expiration (7 days for thumbnails, 3 days for full images)
- Enforced size limits (500MB for thumbnails, 2GB for full images)
- Automatic cleanup on startup and after adding new items
- Evicts oldest entries when limits are exceeded

**Configuration** (in `thumbnail-cache.ts`):
```typescript
const CACHE_CONFIG = {
  THUMBNAIL_TTL_MS: 7 * 24 * 60 * 60 * 1000,  // 7 days
  IMAGE_TTL_MS: 3 * 24 * 60 * 60 * 1000,       // 3 days
  MAX_THUMBNAIL_DISK_BYTES: 500 * 1024 * 1024, // 500MB
  MAX_IMAGE_DISK_BYTES: 2 * 1024 * 1024 * 1024, // 2GB
  EVICTION_BATCH_SIZE: 50,
};
```

**Impact**: Prevents disk space exhaustion, maintains cache freshness

### 3. Download Concurrency Limiter

**Problem**: Background preloading could create too many concurrent requests, overwhelming the network.

**Solution**:
- Implemented priority-based download queue in `download-limiter.ts`
- Limits concurrent downloads (default: 6, adapts to network conditions)
- Prioritizes visible content over background preloads
- Uses Network Information API when available to adjust concurrency

**Usage**:
```typescript
const limiter = getDownloadLimiter();
const data = await limiter.schedule(
  () => downloadFunction(),
  priority // 0=low, 1=normal, 2=high
);
```

**Impact**: Prevents network congestion, improves responsiveness for visible content

### 4. Performance Instrumentation

**Problem**: No visibility into cache hit rates, load times, or performance bottlenecks.

**Solution**:
- Added `PerformanceMonitor` utility for tracking metrics
- Tracks cache hit/miss rates (L1/L2/L3)
- Measures operation durations (thumbnail load, decrypt, etc.)
- Provides statistical summaries (avg, p50, p95, p99)

**Enabling Performance Monitoring**:

1. Open browser console
2. Run: `localStorage.setItem('perf_monitor_enabled', 'true')`
3. Reload the page
4. View metrics in console or programmatically:

```javascript
import { getPerformanceMonitor } from './utils';

const monitor = getPerformanceMonitor();

// Get overall cache hit rate
console.log('Cache hit rate:', monitor.getOverallCacheHitRate());

// Get detailed stats for a specific metric
console.log('Thumbnail load stats:', monitor.getStats('thumbnail_load'));

// Get full summary
console.log('Performance summary:', monitor.getSummary());
```

**Disable monitoring**:
```javascript
localStorage.removeItem('perf_monitor_enabled');
```

**Impact**: Enables data-driven optimization, identifies bottlenecks

## Architecture

### Cache Layers

```
┌─────────────────────────────────────────────────────────┐
│                    Application Layer                     │
├─────────────────────────────────────────────────────────┤
│ L1: Memory LRU Cache (2000 thumbnails, 100 full images) │
│     - Instant access via blob URLs                       │
│     - Automatic URL revocation on eviction               │
├─────────────────────────────────────────────────────────┤
│ L2: IndexedDB Cache (bounded, with TTL)                 │
│     - Persistent across sessions                         │
│     - Bloom filters for fast negative lookups            │
│     - Automatic eviction (TTL + size limits)             │
├─────────────────────────────────────────────────────────┤
│ L3: Network + Decrypt (with concurrency limiting)       │
│     - Priority-based download queue                      │
│     - Web Worker decryption (non-blocking)               │
│     - Results cached in L1 + L2                          │
└─────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Cache Check**: L1 (memory) → L2 (IndexedDB) → L3 (network)
2. **Download**: Concurrency-limited, priority-aware
3. **Decrypt**: Offloaded to Web Worker pool
4. **Store**: Results cached in L1 (memory) + L2 (disk)
5. **Cleanup**: Automatic eviction based on TTL and size limits

## Performance Targets

### Current Targets (Iteration 1)

- **Viewer open latency** (tap → first pixels):
  - Cached: < 100ms
  - Uncached: < 800ms on average network
  
- **Grid scrolling**: Minimal long tasks > 50ms during fast scroll

- **Cache hit rate**: > 80% for L1+L2 combined after warmup

- **Memory usage**: Bounded growth, no leaks in long sessions

## Monitoring & Debugging

### Enable Debug Logging

In `thumbnail-cache.ts`, set:
```typescript
const DEBUG = true;
```

This logs cache operations (L1/L2/L3 hits, downloads, evictions) to console.

### View Cache Statistics

```javascript
import { thumbnailCache } from './services/cache';

// Get cache stats
const stats = await thumbnailCache.getStats();
console.log('Cache stats:', stats);
// Output: { memoryCount: 150, diskCount: 1200, diskSize: 45000000 }
```

### Check Download Limiter Status

```javascript
import { getDownloadLimiter } from './utils';

const limiter = getDownloadLimiter();
console.log('Download queue:', limiter.getStats());
// Output: { active: 4, queued: 12, maxConcurrent: 6 }
```

## Future Improvements (Planned)

### Iteration 2: App-shell caching + request dedupe
- Service worker for app shell (JS/CSS/fonts)
- Request deduplication layer for file metadata

### Iteration 3: Docs/files pipeline
- PDF viewer with page virtualization
- Office doc preview (PDF.js + conversion)
- Bounded caching of rendered pages

## Testing

### Manual Testing Checklist

- [ ] Open viewer, navigate through 100+ photos - no memory growth
- [ ] Scroll grid rapidly - smooth scrolling, no jank
- [ ] Offline mode - cached photos load instantly
- [ ] Clear cache - disk space reclaimed
- [ ] Network throttling - visible content prioritized

### Performance Metrics to Track

1. **Cache hit rate**: Should be > 80% after warmup
2. **Viewer open time**: < 100ms for cached, < 800ms for uncached
3. **Memory usage**: Stable over time, no leaks
4. **Disk usage**: Stays within configured limits

## Troubleshooting

### High memory usage
- Check if blob URLs are being revoked (enable DEBUG logging)
- Verify LRU cache size limits are appropriate
- Check for memory leaks in other components

### Slow loading
- Check cache hit rate (should be > 80%)
- Verify download concurrency isn't too low
- Check network conditions (use Network Information API)
- Enable performance monitoring to identify bottlenecks

### Cache not working
- Check IndexedDB quota (browser may have limits)
- Verify cache isn't being cleared on logout/refresh
- Check TTL settings (may be too aggressive)

## References

- [Web Performance Best Practices](https://web.dev/performance/)
- [IndexedDB Best Practices](https://web.dev/indexeddb-best-practices/)
- [Network Information API](https://developer.mozilla.org/en-US/docs/Web/API/Network_Information_API)
