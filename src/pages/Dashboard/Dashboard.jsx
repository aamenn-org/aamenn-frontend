import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context';
import { useVaultState } from '../../hooks/useVaultState';
import { fileService } from '../../services';
import { useUpload } from '../../hooks/useUpload';
import { isDocumentPreviewable } from '../../utils/thumbnail';
import { DashboardNavbar } from '../../components/layout';
import { StorageBar } from '../../components/ui';
import RecoveryKeyDownloadPrompt from '../../components/RecoveryKeyDownloadPrompt';
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
  VaultSetupModal,
} from '../../components/gallery';

const Dashboard = () => {
  const { hasMasterKey, setMasterKey, getMasterKey, user, setUser } = useAuth();
  const { needsVaultSetup, loading: vaultStateLoading } = useVaultState();
  const [searchParams] = useSearchParams();
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

  // Document preview state
  const [documentViewerOpen, setDocumentViewerOpen] = useState(false);

  // Recovery key download state
  const [showRecoveryKeyPrompt, setShowRecoveryKeyPrompt] = useState(false);
  const [recoveryKeyPhrase, setRecoveryKeyPhrase] = useState('');

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
        // Don't log 401 errors - they're expected after logout/deletion
        if (error.response?.status !== 401) {
          console.error('Failed to fetch files:', error);
        }
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
    clearAllUploads,
  } = useUpload({
    onFileUploaded: (uploadedFile) => {
      // Add the new file to the list immediately without a full refresh
      setFiles((prev) => [uploadedFile, ...prev]);
    },
  });

  // Mandatory vault setup check - redirect if vault not set up and not already on setup page
  useEffect(() => {
    // Wait for vault state to load before making decisions
    if (vaultStateLoading) return;

    const setupVault = searchParams.get('setupVault');
    
    // Check for vault setup parameter first
    if (setupVault === 'true') {
      // Remove the parameter from URL
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }

    // Only redirect if vault needs setup and not already on setup page
    if (needsVaultSetup) {
      // Redirect to vault setup page
      window.location.href = '/photos?setupVault=true';
      return;
    }
  }, [needsVaultSetup, searchParams, vaultStateLoading]);

  useEffect(() => {
    // Only fetch files if vault is set up and state is loaded
    if (!needsVaultSetup && !vaultStateLoading) {
      fetchFiles(1, false); // Initial load
    }
  }, [needsVaultSetup, vaultStateLoading]);

  // Check for recovery key in URL params and show download prompt
  useEffect(() => {
    const recoveryKey = searchParams.get('recoveryKey');
    if (recoveryKey) {
      setRecoveryKeyPhrase(recoveryKey);
      setShowRecoveryKeyPrompt(true);
      // Remove the parameter from URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [searchParams]);

  // Filter files into photos/videos and documents
  const photoFiles = files.filter((f) => !isDocumentPreviewable(f.mimeType));
  const documentFiles = files.filter((f) => isDocumentPreviewable(f.mimeType));

  // Handle file selection
  const handleSelectFile = (file) => {
    const fileId = file.fileId;
    setSelectedFiles((prev) => {
      if (prev.includes(fileId)) {
        return prev.filter((id) => id !== fileId);
      }
      return [...prev, fileId];
    });
  };

  // Handle file view - route to appropriate viewer
  const handleViewFile = (file) => {
    // Check if master key is available
    if (!hasMasterKey()) {
      // Store the file user wanted to view and show unlock modal
      setPendingFileView(file);
      setShowUnlockModal(true);
      return;
    }

    const mimeType = file.mimeType;
    const isDoc = isDocumentPreviewable(mimeType);
    const targetList = isDoc ? documentFiles : photoFiles;
    const index = targetList.findIndex(
      (f) => f.fileId === file.fileId
    );
    if (index !== -1) {
      setCurrentFileIndex(index);
      if (isDoc) {
        setDocumentViewerOpen(true);
      } else {
        setViewerOpen(true);
      }
    }
  };

  // Handle master key unlock
  const handleMasterKeyUnlocked = (masterKey) => {
    setMasterKey(masterKey);

    // Update user state to reflect vault setup completion
    if (user) {
      setUser({ ...user, hasSecuritySetup: true });
    }

    // If we're coming from vault setup, redirect to clean URL to prevent loop
    if (window.location.pathname === '/photos' && searchParams.has('setupVault')) {
      window.location.href = '/photos';
      return;
    }

    // If user was trying to view a file, open it now
    if (pendingFileView) {
      const file = pendingFileView;
      setPendingFileView(null);
      const mimeType = file.mimeType;
      const isDoc = isDocumentPreviewable(mimeType);
      const targetList = isDoc ? documentFiles : photoFiles;
      const index = targetList.findIndex(
        (f) => f.fileId === file.fileId
      );
      if (index !== -1) {
        setCurrentFileIndex(index);
        if (isDoc) {
          setDocumentViewerOpen(true);
        } else {
          setViewerOpen(true);
        }
      }
    }
  };

  // Handle upload - encrypts and uploads files
  const handleUpload = async (files, onProgress) => {
    const masterKey = getMasterKey();

    if (!masterKey) {
      alert('Session expired. Please log in again to upload files.');
      return;
    }

    try {
      // Ensure panel is visible
      setIsUploadPanelMinimized(false);

      // Add files to upload queue - encryption and upload happens in background
      await uploadFilesWithEncryption(files);

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
    const fileId = file.fileId;
    setAddToAlbumFileIds([fileId]);
    setShowAddToAlbumModal(true);
  };

  // Handle add to album success
  const handleAddToAlbumSuccess = () => {
    setSelectedFiles([]);
    setAddToAlbumFileIds([]);
  };

  // If vault state is loading, show loading spinner
  if (vaultStateLoading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-zinc-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-2 text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  // If vault needs setup, show only the setup modal
  if (needsVaultSetup) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-zinc-900 flex items-center justify-center">
        <VaultSetupModal
          isOpen={true}
          onClose={() => {}} // No-op - cannot close
          onSetup={handleMasterKeyUnlocked}
        />
      </div>
    );
  }

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
              storageBar={<StorageBar refreshTrigger={files.length} inline />}
            />
          )}

          {/* Tabs and Grid Size Control - only show when not viewing album detail */}
          {!selectedAlbum && (
            <div className="flex items-center justify-between mb-6">
              <GalleryTabs activeTab={activeTab} onTabChange={setActiveTab} />
              {(activeTab === 'photos' || activeTab === 'files') && (
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
              {photoFiles.length === 0 && !loading ? (
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
                  files={photoFiles}
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

          {/* Files Tab - Documents (PDF, DOCX, TXT) */}
          {!selectedAlbum && activeTab === 'files' && (
            <div className="w-full">
              {documentFiles.length === 0 && !loading ? (
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
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                    No files yet
                  </h3>
                  <p className="text-gray-500 dark:text-gray-400 mb-6 text-center max-w-md">
                    Upload PDF, Word, or text documents to preview them securely.
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
                    Upload Files
                  </button>
                </div>
              ) : (
                <VirtualizedPhotoGrid
                  files={documentFiles}
                  selectedFiles={selectedFiles}
                  onSelectFile={handleSelectFile}
                  onViewFile={handleViewFile}
                  onFavoriteToggle={handleFavoriteToggle}
                  loading={loading || loadingMore}
                  hasMore={pagination.hasMore}
                  onLoadMore={loadMoreFiles}
                  gridSize={gridSize}
                  emptyMessage="No files yet"
                />
              )}
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
      {photoFiles.length > 0 && (
        <PhotoViewer
          file={photoFiles[currentFileIndex]}
          files={photoFiles}
          isOpen={viewerOpen}
          onClose={() => setViewerOpen(false)}
          onNext={() => setCurrentFileIndex((i) => Math.min(i + 1, photoFiles.length - 1))}
          onPrev={() => setCurrentFileIndex((i) => Math.max(i - 1, 0))}
          hasNext={currentFileIndex < photoFiles.length - 1}
          hasPrev={currentFileIndex > 0}
          currentIndex={currentFileIndex}
          totalFiles={photoFiles.length}
          onAddToAlbum={handleAddToAlbumSingle}
          onDelete={handleDeleteSingle}
        />
      )}

      {/* Document Preview Modal */}
      {documentFiles.length > 0 && (
        <FilePreviewModal
          file={documentFiles[currentFileIndex]}
          files={documentFiles}
          isOpen={documentViewerOpen}
          onClose={() => setDocumentViewerOpen(false)}
          onNext={() => setCurrentFileIndex((i) => Math.min(i + 1, documentFiles.length - 1))}
          onPrev={() => setCurrentFileIndex((i) => Math.max(i - 1, 0))}
          hasNext={currentFileIndex < documentFiles.length - 1}
          hasPrev={currentFileIndex > 0}
          currentIndex={currentFileIndex}
        />
      )}

      {/* Session Locked Notification - Only show if user has vault configured but not unlocked */}
      {!hasMasterKey() && !needsVaultSetup && (
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
                Vault Locked
              </h4>
              <p className="text-sm text-gray-400 mt-1">
                Enter your Vault Password to view and manage your encrypted photos.
              </p>
              <button
                onClick={() => setShowUnlockModal(true)}
                className="mt-3 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-black text-sm font-medium rounded-lg transition-colors"
              >
                Unlock Vault
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

      
      {/* Recovery Key Download Prompt */}
      {showRecoveryKeyPrompt && (
        <RecoveryKeyDownloadPrompt
          recoveryPhrase={recoveryKeyPhrase}
          onDismiss={() => setShowRecoveryKeyPrompt(false)}
        />
      )}

      {/* Upload Progress Panel */}
      {uploadStats.total > 0 && (
        <UploadProgressPanel
          stats={uploadStats}
          onCancelAll={cancelAllUploads}
          onRetryFailed={retryFailedUploads}
          onClear={clearAllUploads}
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
