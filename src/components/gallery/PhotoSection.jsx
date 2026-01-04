import PhotoGrid from './PhotoGrid';

const PhotoSection = ({
  title,
  files,
  selectedFiles,
  onSelectFile,
  onViewFile,
  onFavoriteToggle,
  loading,
  rightContent,
  gridSize = 'medium',
}) => {
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          {title}
        </h2>
        {rightContent}
      </div>
      <PhotoGrid
        files={files}
        selectedFiles={selectedFiles}
        onSelectFile={onSelectFile}
        onViewFile={onViewFile}
        onFavoriteToggle={onFavoriteToggle}
        loading={loading}
        gridSize={gridSize}
      />
    </div>
  );
};

export default PhotoSection;
