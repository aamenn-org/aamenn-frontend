import { useState, useEffect, useCallback, useRef } from 'react';
import { DashboardNavbar } from '../../components/layout';
import {
  GalleryHeader,
  GalleryTabs,
  PhotoSection,
  AlbumsSection,
  AlbumDetailView,
  AddToAlbumModal,
  FavoritesSection,
  UploadModal,
  SyncingIndicator,
  PhotoViewer,
  UnlockModal,
  GridSizeControl,
  UploadProgressPanel,
  VirtualizedPhotoGrid,
} from '../../components/gallery';
import { fileService } from '../../services';
import { useAuth } from '../../context';
import { useUpload } from '../../hooks';

const Dashboard = () => {
  const { getMasterKey, hasMasterKey, setMasterKey } = useAuth();
  const [activeTab, setActiveTab] = useState('photos');
  const [files, setFiles] = useState([]);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [pendingFileView, setPendingFileView] = useState(null);

  // Upload progress panel state
  const [isUploadPanelMinimized, setIsUploadPanelMinimized] = useState(false);

  // Album state
  const [selectedAlbum, setSelectedAlbum] = useState(null);
  const [showAddToAlbumModal, setShowAddToAlbumModal] = useState(false);
  const [addToAlbumFileIds, setAddToAlbumFileIds] = useState([]);

  // Photo viewer state
  const [viewerOpen, setViewerOpen] = useState(false);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);

  // Grid size preference (stored in localStorage)
  const [gridSize, setGridSize] = useState(() => {
    return localStorage.getItem('gallery-grid-size') || 'medium';
  });

  // Handle grid size change with persistence
  const handleGridSizeChange = (size) => {
    setGridSize(size);
    localStorage.setItem('gallery-grid-size', size);
  };

  const [pagination, setPagination] = useState({
    page: 1,
    limit: 100, // Larger batch size for efficiency
    total: 0,
    totalPages: 0,
    hasMore: true,
  });

  // Loading states
  const [loadingMore, setLoadingMore] = useState(false);
  const isLoadingRef = useRef(false); // Prevent duplicate loads

  // Fetch files (initial load or next page)
  const fetchFiles = useCallback(
    async (page = 1, append = false) => {
      // Prevent duplicate requests
      if (isLoadingRef.current) return;
      isLoadingRef.current = true;

      try {
        if (!append) {
          setLoading(true);
        } else {
          setLoadingMore(true);
        }

        const response = await fileService.listFiles({
          page,
          limit: pagination.limit,
        });

        console.log('Files response:', response);

        const filesData = response.files || response.data?.files || [];
        const paginationData =
          response.pagination || response.data?.pagination || {};

        if (append) {
          // Append to existing files (infinite scroll)
          setFiles((prev) => {
            // Dedupe by fileId
            const existingIds = new Set(prev.map((f) => f.fileId || f.id));
            const newFiles = filesData.filter(
              (f) => !existingIds.has(f.fileId || f.id)
            );
            return [...prev, ...newFiles];
          });
        } else {
          // Replace files (initial load)
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
        console.error('Failed to fetch files:', error);
        if (!append) {
          setFiles([]);
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
        isLoadingRef.current = false;
      }
    },
    [pagination.limit]
  );

  // Load more files (for infinite scroll)
  const loadMoreFiles = useCallback(() => {
    if (pagination.hasMore && !loadingMore && !isLoadingRef.current) {
      fetchFiles(pagination.page + 1, true);
    }
  }, [pagination.page, pagination.hasMore, loadingMore, fetchFiles]);

  // Simple upload hook - adds files to list immediately when uploaded
  const {
    stats: uploadStats,
    isUploading,
    uploadFiles: uploadFilesWithEncryption,
    cancelAll: cancelAllUploads,
    retryFailed: retryFailedUploads,
    clearCompleted: clearUploadHistory,
  } = useUpload({
    onFileUploaded: (uploadedFile) => {
      console.log('[Dashboard] File uploaded:', uploadedFile);
      // Add the new file to the list immediately without a full refresh
      setFiles((prev) => [uploadedFile, ...prev]);
    },
  });

  useEffect(() => {
    fetchFiles(1, false); // Initial load
  }, []);

  // Handle file selection
  const handleSelectFile = (file) => {
    const fileId = file.fileId || file.id;
    setSelectedFiles((prev) => {
      if (prev.includes(fileId)) {
        return prev.filter((id) => id !== fileId);
      }
      return [...prev, fileId];
    });
  };

  // Handle file view - open photo viewer
  const handleViewFile = (file) => {
    // Check if master key is available
    if (!hasMasterKey()) {
      // Store the file user wanted to view and show unlock modal
      setPendingFileView(file);
      setShowUnlockModal(true);
      return;
    }

    const index = files.findIndex(
      (f) => (f.fileId || f.id) === (file.fileId || file.id)
    );
    if (index !== -1) {
      setCurrentFileIndex(index);
      setViewerOpen(true);
    }
  };

  // Handle master key unlock
  const handleMasterKeyUnlocked = (masterKey) => {
    setMasterKey(masterKey);

    // If user was trying to view a file, open it now
    if (pendingFileView) {
      const file = pendingFileView;
      setPendingFileView(null);
      const index = files.findIndex(
        (f) => (f.fileId || f.id) === (file.fileId || file.id)
      );
      if (index !== -1) {
        setCurrentFileIndex(index);
        setViewerOpen(true);
      }
    }
  };

  // Navigate to next/prev photo
  const handleNextPhoto = () => {
    if (currentFileIndex < files.length - 1) {
      setCurrentFileIndex(currentFileIndex + 1);
    }
  };

  const handlePrevPhoto = () => {
    if (currentFileIndex > 0) {
      setCurrentFileIndex(currentFileIndex - 1);
    }
  };

  // Handle upload - encrypts and uploads files
  const handleUpload = async (files, onProgress) => {
    const masterKey = getMasterKey();

    if (!masterKey) {
      console.error('No master key available. Please log in again.');
      alert('Session expired. Please log in again to upload files.');
      return;
    }

    try {
      // Ensure panel is visible
      setIsUploadPanelMinimized(false);

      // Add files to upload queue - encryption and upload happens in background
      const taskIds = await uploadFilesWithEncryption(files);
      console.log('[Dashboard] Started upload tasks:', taskIds);

      // Signal to the upload modal that files were accepted
      onProgress(100);
    } catch (error) {
      console.error('Upload failed:', error);
      throw error;
    }
  };

  // Handle delete - permanent deletion (for bulk selection)
  const handleDeleteSelected = async () => {
    if (selectedFiles.length === 0) return;

    const confirmMessage =
      selectedFiles.length === 1
        ? 'Are you sure you want to permanently delete this file? This action cannot be undone.'
        : `Are you sure you want to permanently delete ${selectedFiles.length} files? This action cannot be undone.`;

    if (!window.confirm(confirmMessage)) return;

    try {
      for (const fileId of selectedFiles) {
        await fileService.deleteFile(fileId);
      }
      setSelectedFiles([]);
      await fetchFiles();
    } catch (error) {
      console.error('Failed to delete files:', error);
    }
  };

  // Handle delete single file from PhotoViewer
  const handleDeleteSingle = async (fileId) => {
    try {
      await fileService.deleteFile(fileId);
      setViewerOpen(false);
      await fetchFiles();
    } catch (error) {
      console.error('Failed to delete file:', error);
    }
  };

  // Handle favorite toggle
  const handleFavoriteToggle = (fileId, isFavorite) => {
    setFiles((prevFiles) =>
      prevFiles.map((f) =>
        (f.fileId || f.id) === fileId ? { ...f, isFavorite } : f
      )
    );
  };

  // Handle album selection
  const handleAlbumSelect = (album) => {
    setSelectedAlbum(album);
  };

  // Handle back from album detail view
  const handleBackFromAlbum = () => {
    setSelectedAlbum(null);
  };

  // Handle add to album (bulk from header)
  const handleAddToAlbumBulk = () => {
    if (selectedFiles.length === 0) return;
    setAddToAlbumFileIds(selectedFiles);
    setShowAddToAlbumModal(true);
  };

  // Handle add to album (single from photo viewer)
  const handleAddToAlbumSingle = (file) => {
    const fileId = file.fileId || file.id;
    setAddToAlbumFileIds([fileId]);
    setShowAddToAlbumModal(true);
  };

  // Handle add to album success
  const handleAddToAlbumSuccess = () => {
    setSelectedFiles([]);
    setAddToAlbumFileIds([]);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-900 flex flex-col">
      <DashboardNavbar />

      <main className="flex-1 pt-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header - only show when not viewing album detail */}
          {!selectedAlbum && (
            <GalleryHeader
              selectedCount={selectedFiles.length}
              onUpload={() => setShowUploadModal(true)}
              onDelete={handleDeleteSelected}
              onAddToAlbum={handleAddToAlbumBulk}
            />
          )}

          {/* Tabs and Grid Size Control - only show when not viewing album detail */}
          {!selectedAlbum && (
            <div className="flex items-center justify-between mb-6">
              <GalleryTabs activeTab={activeTab} onTabChange={setActiveTab} />
              {activeTab === 'photos' && (
                <GridSizeControl
                  size={gridSize}
                  onSizeChange={handleGridSizeChange}
                />
              )}
            </div>
          )}

          {/* Album Detail View */}
          {selectedAlbum && (
            <AlbumDetailView
              album={selectedAlbum}
              onBack={handleBackFromAlbum}
              onViewFile={handleViewFile}
              onFavoriteToggle={handleFavoriteToggle}
            />
          )}

          {/* Content based on active tab */}
          {!selectedAlbum && activeTab === 'photos' && (
            <div className="w-full">
              {files.length === 0 && !loading ? (
                /* Empty State */
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
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                    No photos yet
                  </h3>
                  <p className="text-gray-500 dark:text-gray-400 mb-6 text-center max-w-md">
                    Your encrypted photo vault is empty. Upload your first
                    photos to get started.
                  </p>
                  <button
                    onClick={() => setShowUploadModal(true)}
                    className="inline-flex items-center px-6 py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors"
                  >
                    <svg
                      className="w-5 h-5 mr-2"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                      />
                    </svg>
                    Upload Photos
                  </button>
                </div>
              ) : (
                /* Virtualized Photo Grid with infinite scroll */
                <VirtualizedPhotoGrid
                  files={files}
                  selectedFiles={selectedFiles}
                  onSelectFile={handleSelectFile}
                  onViewFile={handleViewFile}
                  onFavoriteToggle={handleFavoriteToggle}
                  loading={loading || loadingMore}
                  hasMore={pagination.hasMore}
                  onLoadMore={loadMoreFiles}
                  gridSize={gridSize}
                  emptyMessage="No photos yet"
                />
              )}

              {/* Syncing Indicator */}
              <SyncingIndicator isSyncing={syncing} />
            </div>
          )}

          {!selectedAlbum && activeTab === 'albums' && (
            <AlbumsSection onAlbumSelect={handleAlbumSelect} />
          )}

          {!selectedAlbum && activeTab === 'favorites' && (
            <FavoritesSection onViewFile={handleViewFile} />
          )}
        </div>
      </main>

      {/* Upload Modal */}
      <UploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onUpload={handleUpload}
      />

      {/* Add to Album Modal */}
      <AddToAlbumModal
        isOpen={showAddToAlbumModal}
        onClose={() => {
          setShowAddToAlbumModal(false);
          setAddToAlbumFileIds([]);
        }}
        fileIds={addToAlbumFileIds}
        onSuccess={handleAddToAlbumSuccess}
      />

      {/* Photo Viewer */}
      {files.length > 0 && (
        <PhotoViewer
          file={files[currentFileIndex]}
          files={files}
          isOpen={viewerOpen}
          onClose={() => setViewerOpen(false)}
          onNext={handleNextPhoto}
          onPrev={handlePrevPhoto}
          hasNext={currentFileIndex < files.length - 1}
          hasPrev={currentFileIndex > 0}
          currentIndex={currentFileIndex}
          totalFiles={files.length}
          onAddToAlbum={handleAddToAlbumSingle}
          onDelete={handleDeleteSingle}
        />
      )}

      {/* Session Locked Notification */}
      {!hasMasterKey() && (
        <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 bg-zinc-900 border border-amber-500/30 rounded-lg p-4 shadow-lg z-50">
          <div className="flex items-start">
            <svg
              className="w-5 h-5 text-amber-500 mt-0.5 mr-3 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
            <div className="flex-1">
              <h4 className="text-sm font-medium text-amber-400">
                Session Locked
              </h4>
              <p className="text-sm text-gray-400 mt-1">
                Enter your password to view and manage your photos.
              </p>
              <button
                onClick={() => setShowUnlockModal(true)}
                className="mt-3 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black text-sm font-medium rounded-lg transition-colors"
              >
                Unlock
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unlock Modal */}
      <UnlockModal
        isOpen={showUnlockModal}
        onClose={() => {
          setShowUnlockModal(false);
          setPendingFileView(null);
        }}
        onUnlocked={handleMasterKeyUnlocked}
      />

      {/* Upload Progress Panel */}
      {uploadStats.total > 0 && (
        <UploadProgressPanel
          stats={uploadStats}
          onCancelAll={cancelAllUploads}
          onRetryFailed={retryFailedUploads}
          onClear={clearUploadHistory}
          isMinimized={isUploadPanelMinimized}
          onToggleMinimize={() =>
            setIsUploadPanelMinimized(!isUploadPanelMinimized)
          }
        />
      )}
    </div>
  );
};

export default Dashboard;
