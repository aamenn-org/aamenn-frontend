import PhotoCard from './PhotoCard';

// Grid size configurations
const GRID_SIZES = {
  small:
    'grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 xl:grid-cols-8',
  medium:
    'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6',
  large:
    'grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4',
};

const PhotoGrid = ({
  files,
  selectedFiles,
  onSelectFile,
  onViewFile,
  onFavoriteToggle,
  loading,
  emptyMessage = 'No photos yet',
  gridSize = 'medium',
}) => {
  const gridClasses = GRID_SIZES[gridSize] || GRID_SIZES.medium;

  if (loading) {
    return (
      <div className={`grid ${gridClasses} gap-1`}>
        {[...Array(10)].map((_, i) => (
          <div key={i} className="aspect-square bg-gray-100 dark:bg-zinc-800 animate-pulse" />
        ))}
      </div>
    );
  }

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
    <div className={`grid ${gridClasses} gap-1`}>
      {files.map((file) => {
        const fileId = file.fileId;
        return (
          <PhotoCard
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
  );
};

export default PhotoGrid;
