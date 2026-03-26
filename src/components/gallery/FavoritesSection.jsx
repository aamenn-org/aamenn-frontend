import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { fileService } from '../../services';
import PhotoGrid from './PhotoGrid';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHeart } from '@fortawesome/free-solid-svg-icons';

const FavoritesSection = ({ onViewFile, onFavoriteToggle }) => {
  const { t } = useTranslation('photos');
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedFiles, setSelectedFiles] = useState([]);

  const fetchFavorites = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fileService.listFavorites();
      const filesData = response.files || [];
      setFiles(filesData);
    } catch (error) {
      console.error('Failed to fetch favorites:', error);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFavorites();
  }, [fetchFavorites]);

  const handleSelectFile = (file) => {
    const fileId = file.fileId;
    setSelectedFiles((prev) => {
      if (prev.includes(fileId)) {
        return prev.filter((id) => id !== fileId);
      }
      return [...prev, fileId];
    });
  };

  const handleFavoriteToggle = (fileId, isFavorite) => {
    // If unfavorited, remove from list
    if (!isFavorite) {
      setFiles((prev) => prev.filter((f) => (f.fileId || f.id) !== fileId));
    }
    onFavoriteToggle?.(fileId, isFavorite);
  };

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {[...Array(10)].map((_, i) => (
          <div
            key={i}
            className="aspect-square bg-gray-200 dark:bg-zinc-700 rounded-xl animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-24 h-24 bg-gray-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mb-6">
          <FontAwesomeIcon icon={faHeart} className="w-12 h-12 text-gray-300 dark:text-gray-600" />
        </div>
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          {t('favorites.empty.title', 'No favorites yet')}
        </h3>
        <p className="text-gray-500 dark:text-gray-400 mb-6 text-center max-w-md">
          {t('favorites.empty.description', 'Click the heart icon on any photo to add it to your favorites.')}
        </p>
      </div>
    );
  }

  return (
    <PhotoGrid
      files={files}
      selectedFiles={selectedFiles}
      onSelectFile={handleSelectFile}
      onViewFile={onViewFile}
      onFavoriteToggle={handleFavoriteToggle}
      gridSize="small"
    />
  );
};

export default FavoritesSection;
