import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faImage, 
  faSpinner 
} from '@fortawesome/free-solid-svg-icons';

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
import { useTranslation } from 'react-i18next';
import PhotoCard from './PhotoCard';

// Tailwind grid classes for each size
const GRID_CLASSES = {
  small:
    'grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8',
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
  onContextMenu,
  mimeType,
  selectedFileIds,
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
    <div ref={ref} className="aspect-square" data-select-id={`file:${file.fileId}`}>
      {hasBeenVisible ? (
        <PhotoCard
          file={file}
          isSelected={isSelected}
          onSelect={onSelect}
          onView={onView}
          onFavoriteToggle={onFavoriteToggle}
          onContextMenu={onContextMenu}
          mimeType={mimeType}
          isVisible={isVisible}
          selectedFileIds={selectedFileIds}
        />
      ) : (
        /* Placeholder until first visible */
        <div className="w-full h-full bg-gray-100 dark:bg-zinc-800 rounded-sm" />
      )}
    </div>
  );
};

/**
 * Virtualized photo grid component for efficient rendering
 * Handles large numbers of photos with lazy loading
 */

const VirtualizedPhotoGrid = ({
  files,
  selectedFiles,
  onSelectFile,
  onViewFile,
  onFavoriteToggle,
  onItemContextMenu,
  loading,
  hasMore,
  onLoadMore,
  emptyMessage = 'No photos yet',
  gridSize = 'small',
}) => {
  const { t } = useTranslation('photos');
  const loadMoreRef = useRef(null);
  const gridClasses = GRID_CLASSES[gridSize] || GRID_CLASSES.small;

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
        <FontAwesomeIcon icon={faImage} className="w-16 h-16 mb-4" />
        <p className="text-lg">{emptyMessage || t('empty.photos', 'No photos yet')}</p>
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
              onContextMenu={onItemContextMenu}
              mimeType={file.mimeType}
              selectedFileIds={selectedFiles || []}
            />
          );
        })}
      </div>

      {/* Load more sentinel */}
      <div ref={loadMoreRef} className="flex justify-center py-8">
        {loading && (
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
            <FontAwesomeIcon icon={faSpinner} className="animate-spin h-5 w-5" />
            <span>Loading more...</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default VirtualizedPhotoGrid;
