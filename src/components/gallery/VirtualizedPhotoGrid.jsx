/**
 * VirtualizedPhotoGrid - High-performance grid for large photo libraries
 *
 * Features:
 * - Renders all grid cells but lazy-loads thumbnails only when visible
 * - Uses IntersectionObserver to detect visibility
 * - Infinite scroll with automatic page loading
 * - Memory-efficient as thumbnails are only loaded on demand
 * - Responsive grid sizing using Tailwind classes
 * - Priority-based decryption (visible first)
 * - Cancellation when scrolled away
 */

import { useState, useEffect, useRef } from 'react';
import PhotoCard from './PhotoCard';

// Tailwind grid classes for each size
const GRID_CLASSES = {
  small:
    'grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8',
  medium:
    'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6',
  large:
    'grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4',
};

/**
 * LazyPhotoCard - Wrapper that tracks visibility for priority loading
 *
 * Improvements for 10K scale:
 * - Tracks both enter AND exit from viewport
 * - Passes visibility state to PhotoCard for priority-based loading
 * - Cancels thumbnail load when scrolled away (via PhotoCard)
 */
const LazyPhotoCard = ({
  file,
  isSelected,
  onSelect,
  onView,
  onFavoriteToggle,
  mimeType,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [hasBeenVisible, setHasBeenVisible] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!ref.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        const nowVisible = entry.isIntersecting;

        setIsVisible(nowVisible);

        if (nowVisible) {
          setHasBeenVisible(true);
        }
      },
      {
        rootMargin: '200px', // Start loading 200px before visible
        threshold: 0,
      }
    );

    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="aspect-square">
      {hasBeenVisible ? (
        <PhotoCard
          file={file}
          isSelected={isSelected}
          onSelect={onSelect}
          onView={onView}
          onFavoriteToggle={onFavoriteToggle}
          mimeType={mimeType}
          isVisible={isVisible}
        />
      ) : (
        /* Placeholder until first visible */
        <div className="w-full h-full bg-gray-100 dark:bg-zinc-800 rounded-sm" />
      )}
    </div>
  );
};

const VirtualizedPhotoGrid = ({
  files,
  selectedFiles,
  onSelectFile,
  onViewFile,
  onFavoriteToggle,
  loading,
  hasMore,
  onLoadMore,
  emptyMessage = 'No photos yet',
  gridSize = 'medium',
}) => {
  const loadMoreRef = useRef(null);
  const gridClasses = GRID_CLASSES[gridSize] || GRID_CLASSES.medium;

  // Infinite scroll: load more when reaching bottom
  useEffect(() => {
    if (!loadMoreRef.current || !hasMore || loading) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading) {
          console.log('[VirtualizedGrid] Loading more files...');
          onLoadMore?.();
        }
      },
      {
        threshold: 0.1,
        rootMargin: '300px',
      }
    );

    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [hasMore, loading, onLoadMore]);

  // Loading skeleton
  if (loading && files.length === 0) {
    return (
      <div className={`grid ${gridClasses} gap-1`}>
        {[...Array(24)].map((_, i) => (
          <div
            key={i}
            className="aspect-square bg-gray-100 dark:bg-zinc-800 animate-pulse rounded-sm"
          />
        ))}
      </div>
    );
  }

  // Empty state
  if (!files || files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-400 dark:text-gray-500">
        <svg
          className="w-16 h-16 mb-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
        <p className="text-lg">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Grid with all items - thumbnails load lazily */}
      <div className={`grid ${gridClasses} gap-1`}>
        {files.map((file) => {
          const fileId = file.fileId;
          return (
            <LazyPhotoCard
              key={fileId}
              file={file}
              isSelected={selectedFiles?.includes(fileId)}
              onSelect={onSelectFile}
              onView={onViewFile}
              onFavoriteToggle={onFavoriteToggle}
              mimeType={file.mimeType}
            />
          );
        })}
      </div>

      {/* Load more sentinel */}
      <div ref={loadMoreRef} className="flex justify-center py-8">
        {loading && (
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <span>Loading more...</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default VirtualizedPhotoGrid;
