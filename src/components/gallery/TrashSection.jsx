import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { fileService } from '../../services';
import { useAuth } from '../../context';
import VirtualizedPhotoGrid from './VirtualizedPhotoGrid';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faTrash, 
  faArrowRotateLeft, 
  faTrashCan 
} from '@fortawesome/free-solid-svg-icons';

const TrashSection = ({ onViewFile, gridSize }) => {
  const { user } = useAuth();
  const { t } = useTranslation('photos');
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 100,
    total: 0,
    totalPages: 0,
    hasMore: true,
  });

  const fetchTrash = useCallback(async (page = 1, append = false) => {
    try {
      if (!append) {
        setLoading(true);
      }

      const response = await fileService.listTrash({
        page,
        limit: pagination.limit,
      });

      const filesData = response.files || [];
      const paginationData = response.pagination || {};

      if (append) {
        setFiles((prev) => {
          const existingIds = new Set(prev.map((f) => f.fileId || f.id));
          const newFiles = filesData.filter(
            (f) => !existingIds.has(f.fileId || f.id)
          );
          return [...prev, ...newFiles];
        });
      } else {
        setFiles(filesData);
      }

      setPagination((prev) => ({
        ...prev,
        page,
        total: paginationData.total || 0,
        totalPages: paginationData.totalPages || 1,
        hasMore: page < (paginationData.totalPages || 1),
      }));
    } catch (error) {
      console.error('Failed to fetch trash:', error);
      if (!append) {
        setFiles([]);
      }
    } finally {
      setLoading(false);
    }
  }, [pagination.limit]);

  useEffect(() => {
    fetchTrash(1, false);
  }, [fetchTrash]);

  const loadMoreFiles = useCallback(() => {
    if (pagination.hasMore && !loading) {
      fetchTrash(pagination.page + 1, true);
    }
  }, [pagination.page, pagination.hasMore, loading, fetchTrash]);

  const handleSelectFile = (file) => {
    const fileId = file.fileId;
    setSelectedFiles((prev) => {
      if (prev.includes(fileId)) {
        return prev.filter((id) => id !== fileId);
      }
      return [...prev, fileId];
    });
  };

  const handleRestore = async () => {
    if (selectedFiles.length === 0) return;

    const confirmMessage =
      selectedFiles.length === 1
        ? 'Restore this file?'
        : `Restore ${selectedFiles.length} files?`;

    if (!window.confirm(confirmMessage)) return;

    try {
      await fileService.restoreFilesBulk(selectedFiles);
      setSelectedFiles([]);
      await fetchTrash(1, false);
    } catch (error) {
      console.error('Failed to restore files:', error);
      alert('Failed to restore files. Please try again.');
    }
  };

  const handleDeletePermanently = async () => {
    if (selectedFiles.length === 0) return;

    const confirmMessage =
      selectedFiles.length === 1
        ? 'Permanently delete this file? This action cannot be undone.'
        : `Permanently delete ${selectedFiles.length} files? This action cannot be undone.`;

    if (!window.confirm(confirmMessage)) return;

    try {
      await fileService.deleteFilesPermanentlyBulk(selectedFiles);
      setSelectedFiles([]);
      await fetchTrash(1, false);
    } catch (error) {
      console.error('Failed to delete files:', error);
      alert('Failed to delete files. Please try again.');
    }
  };

  const [emptyingTrash, setEmptyingTrash] = useState(false);
  const [emptyProgress, setEmptyProgress] = useState({ deleted: 0, total: 0 });

  const handleEmptyTrash = async () => {
    if (files.length === 0) return;

    const totalToDelete = pagination.total > 0 ? pagination.total : files.length;
    const confirmMessage = `Permanently delete all ${totalToDelete} file${totalToDelete !== 1 ? 's' : ''} in trash? This action cannot be undone.`;

    if (!window.confirm(confirmMessage)) return;

    setEmptyingTrash(true);
    setEmptyProgress({ deleted: 0, total: totalToDelete });
    setSelectedFiles([]);

    try {
      let remaining = totalToDelete;

      while (remaining > 0) {
        const result = await fileService.emptyTrashBatch();

        if (result.deletedIds && result.deletedIds.length > 0) {
          const deletedSet = new Set(result.deletedIds);
          setFiles((prev) => prev.filter((f) => !deletedSet.has(f.fileId || f.id)));
          setEmptyProgress((prev) => ({
            ...prev,
            deleted: prev.deleted + result.deletedIds.length,
          }));
        }

        remaining = result.remaining;

        if (result.deletedIds.length === 0) {
          break;
        }
      }

      setPagination((prev) => ({ ...prev, total: 0, totalPages: 0, hasMore: false }));
    } catch (error) {
      console.error('Failed to empty trash:', error);
      alert('Failed to empty trash. Please try again.');
      await fetchTrash(1, false);
    } finally {
      setEmptyingTrash(false);
      setEmptyProgress({ deleted: 0, total: 0 });
    }
  };

  const getDaysRemaining = (deletedAt) => {
    if (!deletedAt || !user?.trashRetentionDays) return null;
    
    const deleted = new Date(deletedAt);
    const expiresAt = new Date(deleted);
    expiresAt.setDate(expiresAt.getDate() + user.trashRetentionDays);
    
    const now = new Date();
    const daysLeft = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));
    
    return daysLeft > 0 ? daysLeft : 0;
  };

  if (loading && files.length === 0) {
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
          <FontAwesomeIcon icon={faTrash} className="w-12 h-12 text-gray-300 dark:text-gray-600" />
        </div>
        <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          {t('trash.empty.title', 'Trash is empty')}
        </h3>
        <p className="text-gray-500 dark:text-gray-400 text-center max-w-md">
          {t('trash.empty.description', 'Deleted files will appear here and be automatically removed after {{days}} days.', { days: user?.trashRetentionDays || 30 })}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with actions */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {selectedFiles.length > 0 && (
            <span className="text-sm text-gray-500 dark:text-gray-400">
              {t('selected', '{{count}} selected', { count: selectedFiles.length })}
            </span>
          )}
        </div>

        <div className="flex items-center space-x-3">
          {selectedFiles.length > 0 && (
            <>
              <button
                onClick={handleRestore}
                disabled={emptyingTrash}
                className="inline-flex items-center px-4 py-2 bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors rounded-lg"
              >
                <FontAwesomeIcon icon={faArrowRotateLeft} className="w-4 h-4 mr-2" />
                {t('restore', 'Restore')}
              </button>
              <button
                onClick={handleDeletePermanently}
                disabled={emptyingTrash}
                className="inline-flex items-center px-4 py-2 bg-red-500 text-white text-sm font-medium hover:bg-red-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors rounded-lg"
              >
                <FontAwesomeIcon icon={faTrashCan} className="w-4 h-4 mr-2" />
                {t('deleteForever', 'Delete Forever')}
              </button>
            </>
          )}

          {files.length > 0 && (
            <button
              onClick={handleEmptyTrash}
              disabled={emptyingTrash}
              className="inline-flex items-center px-4 py-2 bg-gray-200 dark:bg-zinc-700 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-300 dark:hover:bg-zinc-600 disabled:opacity-60 disabled:cursor-not-allowed transition-colors rounded-lg"
            >
              {emptyingTrash
                ? `Deleting… ${emptyProgress.deleted} / ${emptyProgress.total}`
                : t('emptyTrash', 'Empty Trash')}
            </button>
          )}
        </div>
      </div>

      {/* Files grid */}
      <VirtualizedPhotoGrid
        files={files}
        selectedFiles={selectedFiles}
        onSelectFile={handleSelectFile}
        onViewFile={onViewFile}
        loading={loading}
        hasMore={pagination.hasMore}
        onLoadMore={loadMoreFiles}
        gridSize={gridSize}
        emptyMessage={t('trash.empty.title', 'Trash is empty')}
        showDaysRemaining={true}
        getDaysRemaining={getDaysRemaining}
      />
    </div>
  );
};

export default TrashSection;
