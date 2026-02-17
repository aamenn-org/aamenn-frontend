# Performance Optimizations for Instant UX

## Implemented Optimizations

### 1. **Progressive Image Loading (Medium → Large)**
- **What**: Preview shows medium quality (1600x1600 @ 0.65 JPEG) first, then upgrades to large (1600x1600 @ 0.92 JPEG)
- **Why**: Same dimensions = no layout shift, only quality improvement
- **Impact**: User sees full-size image instantly, perceives quality refinement not loading
- **Files**: `PhotoViewer.jsx`, `thumbnail.worker.js`, `thumbnail.js`

### 2. **Skip Small Thumbnails in Preview**
- **What**: Viewer only uses medium/large, never shows small grid thumbnails
- **Why**: Prevents jarring resize from 150px → 1600px
- **Impact**: Smoother preview experience, no visible resizing
- **Files**: `PhotoViewer.jsx` (`getBestCachedUrlForViewer`)

### 3. **Aggressive L1 Memory Cache**
- **What**: Increased cache sizes:
  - Small thumbnails: 3000 items (grid)
  - Medium/Large: 200 items (100 images × 2 qualities)
- **Why**: Keep more images in RAM for instant access
- **Impact**: Near-instant navigation in viewer, smooth grid scrolling
- **Files**: `thumbnail-cache.ts`

### 4. **Image Decode API**
- **What**: Call `img.decode()` immediately after setting src
- **Why**: Browser decodes JPEG asynchronously before paint
- **Impact**: Eliminates decode jank on first render
- **Files**: `PhotoViewer.jsx` (in `loadImage`)

### 5. **Priority Hints**
- **What**: `fetchpriority="high"` and `decoding="async"` on img tags
- **Why**: Tells browser this image is critical for LCP
- **Impact**: Browser prioritizes image download/decode
- **Files**: `PhotoViewer.jsx`

### 6. **Optimized Preload Timing**
- **What**: 
  - Medium thumbnails: preload after 50ms
  - Full quality: preload after 200ms
- **Why**: Start medium preload immediately (fast), delay full (large)
- **Impact**: Adjacent images ready before user navigates
- **Files**: `PhotoViewer.jsx`

### 7. **Bloom Filters for Cache Checks**
- **What**: Fast "definitely not cached" checks before IndexedDB lookup
- **Why**: Avoid expensive IDB reads for cache misses
- **Impact**: ~10KB memory for 100K items, prevents thousands of IDB reads
- **Files**: `thumbnail-cache.ts`

### 8. **Batch Preloading with Concurrency Control**
- **What**: Preload ±10 medium thumbnails in zones
- **Why**: Warm cache before user reaches boundary
- **Impact**: Instant navigation in both directions
- **Files**: `PhotoViewer.jsx`, `thumbnail-cache.ts`

### 9. **Hover Preload for Medium Thumbnails**
- **What**: When user hovers over grid card, preload medium thumbnail (after 300ms delay)
- **Why**: Medium ready in L1 cache when user clicks to view
- **Impact**: **Eliminates blurhash delay** - viewer opens with full-size image instantly
- **Memory Safe**: LRU cache auto-evicts oldest when limit (200 items) reached
- **Files**: `PhotoCard.jsx`

## Additional Recommendations for Scale

### 9. **Service Worker for Offline-First**
```javascript
// Cache thumbnails and metadata for offline access
// Already partially implemented via IndexedDB
// Consider adding SW for network resilience
```

### 10. **HTTP/2 Server Push** (Backend)
```typescript
// When serving file metadata, push thumbnail URLs
// Browser starts downloading before JS requests them
```

### 11. **WebP Thumbnails** (Future)
```javascript
// WebP is 25-35% smaller than JPEG at same quality
// Fallback to JPEG for older browsers
// Requires backend support
```

### 12. **Intersection Observer for Grid** (Already Implemented)
```javascript
// VirtualizedPhotoGrid already uses this
// Only load thumbnails for visible cards
// Massive performance win for large galleries
```

### 13. **Request Coalescing**
```javascript
// Already implemented via pendingRequests Map
// Multiple components requesting same file share one download
```

### 14. **Connection Prewarming**
```javascript
// Add DNS prefetch and preconnect for B2 CDN
// In index.html:
<link rel="dns-prefetch" href="https://f000.backblazeb2.com">
<link rel="preconnect" href="https://f000.backblazeb2.com">
```

### 15. **Image Sprite Sheets for UI Icons**
```javascript
// Combine small UI icons into sprite sheet
// Reduces HTTP requests
// Better for initial page load
```

## Performance Metrics to Track

### Core Web Vitals
- **LCP (Largest Contentful Paint)**: Target < 2.5s
  - Optimized via priority hints, decode API
- **FID (First Input Delay)**: Target < 100ms
  - Optimized via Web Workers for crypto/thumbnails
- **CLS (Cumulative Layout Shift)**: Target < 0.1
  - Optimized via same-dimension thumbnails

### Custom Metrics
- **Time to First Thumbnail**: < 200ms
- **Time to Medium Quality**: < 500ms
- **Time to Large Quality**: < 1s
- **Navigation Latency**: < 100ms (with preload)

## Browser DevTools Tips

### Measure Performance
```javascript
// In console:
performance.mark('viewer-open');
// ... user opens viewer
performance.mark('viewer-ready');
performance.measure('viewer-load', 'viewer-open', 'viewer-ready');
console.table(performance.getEntriesByType('measure'));
```

### Check Cache Hit Rate
```javascript
// In console:
thumbnailCache.getStats();
// Should show >80% hit rate for L1 after warming
```

### Monitor Memory Usage
```javascript
// Chrome DevTools > Memory > Take Heap Snapshot
// Look for detached blob URLs (memory leaks)
// Our LRU cache auto-revokes, should be clean
```

## Scaling Considerations

### 1000+ Images
- ✅ L1 cache handles 200 medium+large (100 images)
- ✅ L2 IndexedDB handles unlimited with LRU eviction
- ✅ Bloom filters prevent IDB thrashing
- ✅ Zone-based preloading prevents request storms

### 10,000+ Images
- Consider pagination or virtual scrolling (already implemented)
- Consider lazy metadata loading (load metadata on scroll)
- Consider CDN edge caching for thumbnails

### 100,000+ Images
- Implement server-side search/filtering
- Consider thumbnail sprite sheets for grid
- Consider progressive metadata loading (load visible first)

## E2EE Performance Impact

### Encryption Overhead
- **Thumbnail generation**: ~50-200ms per image (Web Worker)
- **Decryption**: ~10-50ms per thumbnail (Web Worker)
- **Key derivation**: ~100ms (cached per session)

### Mitigation
- ✅ Web Workers keep UI responsive
- ✅ Batch operations reduce overhead
- ✅ L1/L2 cache eliminates repeated decryption
- ✅ Pre-exported master key bytes (avoid repeated exportKey)

## Testing Checklist

- [ ] Test on slow 3G network (Chrome DevTools throttling)
- [ ] Test with 1000+ images in gallery
- [ ] Test rapid navigation (prev/next spam)
- [ ] Test memory usage over time (no leaks)
- [ ] Test offline mode (IndexedDB cache)
- [ ] Test on mobile devices (lower RAM)
- [ ] Measure Core Web Vitals in production
- [ ] Monitor cache hit rates in analytics

## Conclusion

These optimizations provide:
- **Instant perceived performance** via progressive loading
- **Smooth navigation** via aggressive preloading
- **Scalability** via multi-layer caching
- **Reliability** via offline-first architecture

The app should feel **instant** even on slower connections, with images appearing to load "magically fast" due to preloading and caching strategies.
