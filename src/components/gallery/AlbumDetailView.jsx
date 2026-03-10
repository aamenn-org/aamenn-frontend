import { useState, useEffect, useCallback } from 'react';
import { albumService } from '../../services';
import PhotoGrid from './PhotoGrid';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faArrowLeft, 
  faTrash, 
  faImage 
} from '@fortawesome/free-solid-svg-icons';

const AlbumDetailView = ({ album, onBack, onViewFile, onFavoriteToggle }) => {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0,
  });

  const fetchAlbumFiles = useCallback(async () => {
    if (!album?.albumId) return;

    try {
      setLoading(true);
      const response = await albumService.listAlbumFiles(album.albumId, {
        page: pagination.page,
        limit: pagination.limit,
      });

      const filesData = response.files || [];
      const paginationData = response.pagination || {};

      setFiles(filesData);
      setPagination((prev) => ({
        ...prev,
        ...paginationData,
      }));
    } catch (error) {
      console.error('Failed to fetch album files:', error);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, [album?.albumId, pagination.page, pagination.limit]);

  useEffect(() => {
    fetchAlbumFiles();
  }, [fetchAlbumFiles]);

  const handleSelectFile = (file) => {
    const fileId = file.fileId;
    setSelectedFiles((prev) => {
      if (prev.includes(fileId)) {
        return prev.filter((id) => id !== fileId);
      }
      return [...prev, fileId];
    });
  };

  const handleRemoveFromAlbum = async () => {
    if (selectedFiles.length === 0 || !album?.albumId) return;

    const confirmMessage =
      selectedFiles.length === 1
        ? 'Remove this photo from the album?'
        : `Remove ${selectedFiles.length} photos from the album?`;

    if (!confirm(confirmMessage)) return;

    try {
      for (const fileId of selectedFiles) {
        await albumService.removeFileFromAlbum(album.albumId, fileId);
      }
      setSelectedFiles([]);
      await fetchAlbumFiles();
    } catch (error) {
      console.error('Failed to remove files from album:', error);
    }
  };

  const handleFavoriteToggleLocal = (fileId, isFavorite) => {
    setFiles((prevFiles) =>
      prevFiles.map((f) =>
        (f.fileId || f.id) === fileId ? { ...f, isFavorite } : f
      )
    );
    onFavoriteToggle?.(fileId, isFavorite);
  };

  return (
    <div>
      {/* Album Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <button
            onClick={onBack}
            className="mr-4 p-2 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded-lg transition-colors"
          >
            <FontAwesomeIcon icon={faArrowLeft} className="w-5 h-5 text-gray-600 dark:text-gray-300" />
          </button>
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              {album?.title || 'Album'}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {files.length} {files.length === 1 ? 'photo' : 'photos'}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center space-x-3">
          {selectedFiles.length > 0 && (
            <>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {selectedFiles.length} selected
              </span>
              <button
                onClick={handleRemoveFromAlbum}
                className="inline-flex items-center px-4 py-2 bg-red-500 text-white rounded-lg text-sm font-medium hover:bg-red-600 transition-colors"
              >
                <FontAwesomeIcon icon={faTrash} className="w-4 h-4 mr-2" />
                Remove from Album
              </button>
            </>
          )}
        </div>
      </div>

      {/* Photos Grid */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {[...Array(10)].map((_, i) => (
            <div
              key={i}
              className="aspect-square bg-gray-200 dark:bg-zinc-700 rounded-xl animate-pulse"
            />
          ))}
        </div>
      ) : files.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-24 h-24 bg-gray-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mb-6">
            <FontAwesomeIcon icon={faImage} className="w-12 h-12 text-gray-300 dark:text-gray-600" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            No photos in this album
          </h3>
          <p className="text-gray-500 dark:text-gray-400 mb-6 text-center max-w-md">
            Add photos to this album from your gallery.
          </p>
        </div>
      ) : (
        <PhotoGrid
          files={files}
          selectedFiles={selectedFiles}
          onSelectFile={handleSelectFile}
          onViewFile={onViewFile}
          onFavoriteToggle={handleFavoriteToggleLocal}
        />
      )}
    </div>
  );
};

export default AlbumDetailView;
