import { useState, useEffect, useCallback } from 'react';
import { albumService } from '../../services';
import PhotoGrid from './PhotoGrid';

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
            <svg
              className="w-5 h-5 text-gray-600 dark:text-gray-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
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
                <svg
                  className="w-4 h-4 mr-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
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
            <svg
              className="w-12 h-12 text-gray-300 dark:text-gray-600"
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
