import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { fileService } from '../../services';
import FileListView from '../fileList/FileListView';
import VirtualizedPhotoGrid from './VirtualizedPhotoGrid';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHeart } from '@fortawesome/free-solid-svg-icons';

const FavoritesSection = ({
  onViewFile,
  onFavoriteToggle,
  onFilesLoaded,
  searchQuery = '',
  viewMode = 'list',
  selectedFiles = [],
  onSelectFile,
}) => {
  const { t } = useTranslation('photos');
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchFavorites = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fileService.listFavorites();
      const filesData = response.files || response.data?.files || [];
      setFiles(filesData);
      onFilesLoaded?.(filesData);
    } catch (error) {
      console.error('Failed to fetch favorites:', error);
      setFiles([]);
      onFilesLoaded?.([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFavorites();
  }, [fetchFavorites]);

  const handleSelectFile = (file) => {
    onSelectFile?.(file);
  };

  const handleFavoriteToggle = (fileId, isFavorite) => {
    if (!isFavorite) {
      const next = files.filter((f) => (f.fileId || f.id) !== fileId);
      setFiles(next);
      onFilesLoaded?.(next);
    }
    onFavoriteToggle?.(fileId, isFavorite);
  };

  if (viewMode === 'grid') {
    return (
      <div className="p-4 overflow-y-auto h-full">
        <VirtualizedPhotoGrid
          files={files}
          selectedFiles={selectedFiles}
          onSelectFile={handleSelectFile}
          onViewFile={onViewFile}
          onFavoriteToggle={handleFavoriteToggle}
          loading={loading}
          hasMore={false}
          emptyMessage={t('favorites.empty.title', 'No favorites yet')}
          gridSize="small"
        />
      </div>
    );
  }

  return (
    <FileListView
      folders={[]}
      files={files}
      searchQuery={searchQuery}
      selectedFiles={selectedFiles}
      selectedFolders={[]}
      onSelectFile={handleSelectFile}
      onViewFile={onViewFile}
      onFavoriteToggle={handleFavoriteToggle}
      loading={loading}
      emptyMessage={t('favorites.empty.title', 'No favorites yet')}
      emptyIcon={faHeart}
    />
  );
};

export default FavoritesSection;
