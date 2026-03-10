import PhotoCard from './PhotoCard';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faImage } from '@fortawesome/free-solid-svg-icons';

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
        <FontAwesomeIcon icon={faImage} className="w-16 h-16 mb-4" />
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
