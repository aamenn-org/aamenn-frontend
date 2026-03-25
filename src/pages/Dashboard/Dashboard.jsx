import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../context';
import { useVaultState } from '../../hooks';
import { fileService, folderService } from '../../services';
import { getDragState, clearDragState } from '../../utils/dragState';
import { useUpload } from '../../hooks/useUpload';
import { getFileType, FILE_HANDLERS } from '../../utils/thumbnail';
import { DashboardNavbar } from '../../components/layout';
import { StorageBar } from '../../components/ui';
import { FilePreviewModal } from '../../components';
import RecoveryKeyDownloadPrompt from '../../components/RecoveryKeyDownloadPrompt';
import { ShareModal, OnboardingModal } from '../../components/modals';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faImage, 
  faPlus, 
  faTriangleExclamation,
  faFile,
  faFolderPlus,
  faFolderOpen,
  faArrowRight,
  faTrash,
  faPen,
  faShare,
  faXmark,
  faCloudUpload
} from '@fortawesome/free-solid-svg-icons';
import { encryptFilename } from '../../utils/crypto';
import {
  GalleryHeader,
  GalleryTabs,
  FavoritesSection,
  TrashSection,
  UploadModal,
  SyncingIndicator,
  PhotoViewer,
  UnlockModal,
  GridSizeControl,
  UploadProgressPanel,
  VirtualizedPhotoGrid,
  VaultSetupModal,
  ContactsSection,
  FolderCard,
  Breadcrumbs,
  FolderPickerModal,
  RenameModal,
} from '../../components/gallery';

const Dashboard = () => {
  const { hasMasterKey, setMasterKey, getMasterKey, user, setUser } = useAuth();
  const { needsVaultSetup, loading: vaultStateLoading } = useVaultState();
  const location = useLocation();
  const navigate = useNavigate();
  const { folderId: urlFolderId } = useParams();
  const [searchParams] = useSearchParams();

  // Derive active tab from URL path
  const path = location.pathname;
  const activeTab = path.startsWith('/files') ? 'files'
    : path.startsWith('/folders') ? 'folders'
    : path.startsWith('/favorites') ? 'favorites'
    : path.startsWith('/trash') ? 'trash'
    : path.startsWith('/contacts') ? 'contacts'
    : 'photos';

  // Folder ID comes from URL param (null = root)
  const currentFolderId = urlFolderId || null;

  // Folder workspace state (Folders tab)
  const [folderFiles, setFolderFiles] = useState([]);
  const [childFolders, setChildFolders] = useState([]);
  const [breadcrumbs, setBreadcrumbs] = useState([]);
  const [folderPagination, setFolderPagination] = useState({
    page: 1, limit: 100, total: 0, totalPages: 0, hasMore: true,
  });

  // All-files state (Photos + Files tabs — all files regardless of folder)
  const [allFiles, setAllFiles] = useState([]);
  const [allFilesLoading, setAllFilesLoading] = useState(false);
  const [allFilesPagination, setAllFilesPagination] = useState({
    page: 1, limit: 100, total: 0, totalPages: 0, hasMore: true,
  });

  const [selectedFiles, setSelectedFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [pendingFileView, setPendingFileView] = useState(null);

  // Upload progress panel state
  const [isUploadPanelMinimized, setIsUploadPanelMinimized] = useState(false);

  // Folder UI state
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [dragOverFolderId, setDragOverFolderId] = useState(null);

  // Folder selection + actions
  const [selectedFolders, setSelectedFolders] = useState([]);
  const [renamingFolder, setRenamingFolder] = useState(null); // folder object being renamed
  const [isRenamingFolder, setIsRenamingFolder] = useState(false);

  // Photo viewer state
  const [viewerOpen, setViewerOpen] = useState(false);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);

  // Document preview state
  const [documentViewerOpen, setDocumentViewerOpen] = useState(false);

  // Recovery key download state
  const [showRecoveryKeyPrompt, setShowRecoveryKeyPrompt] = useState(false);
  const [recoveryKeyPhrase, setRecoveryKeyPhrase] = useState('');

  // Share modal state
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareItems, setShareItems] = useState([]);

  // Folder picker modal state
  const [showFolderPickerModal, setShowFolderPickerModal] = useState(false);

  // Onboarding modal state
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Grid size preference (stored in localStorage)
  const [gridSize, setGridSize] = useState(() => {
    return localStorage.getItem('gallery-grid-size') || 'medium';
  });

  // Handle grid size change with persistence
  const handleGridSizeChange = (size) => {
    setGridSize(size);
    localStorage.setItem('gallery-grid-size', size);
  };

  // Loading states
  const [loadingMore, setLoadingMore] = useState(false);
  const isLoadingRef = useRef(false);
  const isAllFilesLoadingRef = useRef(false);

  // Fetch library (folders + files for current folder) — used by Folders tab
  const fetchLibrary = useCallback(
    async (folderId = null, page = 1, append = false) => {
      if (isLoadingRef.current) return;
      isLoadingRef.current = true;

      try {
        if (!append) setLoading(true);
        else setLoadingMore(true);

        const params = { page, limit: 100 };
        if (folderId) params.folderId = folderId;

        const response = await folderService.getLibrary(params);

        const filesData = response.files || [];
        const foldersData = response.folders || [];
        const paginationData = response.pagination || {};
        const breadcrumbsData = response.breadcrumbs || [];

        if (!append) {
          setFolderFiles(filesData);
          setChildFolders(foldersData);
          setBreadcrumbs(breadcrumbsData);
        } else {
          setFolderFiles((prev) => {
            const existingIds = new Set(prev.map((f) => f.fileId || f.id));
            return [...prev, ...filesData.filter((f) => !existingIds.has(f.fileId || f.id))];
          });
        }

        setFolderPagination((prev) => ({
          ...prev,
          page,
          total: paginationData.total || 0,
          totalPages: paginationData.totalPages || 1,
          hasMore: page < (paginationData.totalPages || 1),
        }));
      } catch (error) {
        if (error.response?.status !== 401) console.error('Failed to fetch library:', error);
        if (!append) { setFolderFiles([]); setChildFolders([]); }
      } finally {
        setLoading(false);
        setLoadingMore(false);
        isLoadingRef.current = false;
      }
    },
    []
  );

  // Fetch ALL user files (no folder filter) — used by Photos + Files tabs
  const fetchAllFiles = useCallback(
    async (page = 1, append = false) => {
      if (isAllFilesLoadingRef.current) return;
      isAllFilesLoadingRef.current = true;

      try {
        if (!append) setAllFilesLoading(true);

        const response = await fileService.listFiles({ page, limit: 100 });
        const filesData = response?.files || [];
        const total = response?.total || 0;
        const totalPages = response?.totalPages || 1;

        if (!append) {
          setAllFiles(filesData);
        } else {
          setAllFiles((prev) => {
            const existingIds = new Set(prev.map((f) => f.fileId || f.id));
            return [...prev, ...filesData.filter((f) => !existingIds.has(f.fileId || f.id))];
          });
        }

        setAllFilesPagination((prev) => ({
          ...prev, page, total, totalPages,
          hasMore: page < totalPages,
        }));
      } catch (error) {
        if (error.response?.status !== 401) console.error('Failed to fetch all files:', error);
        if (!append) setAllFiles([]);
      } finally {
        setAllFilesLoading(false);
        isAllFilesLoadingRef.current = false;
      }
    },
    []
  );

  // Load more files for Folders tab
  const loadMoreFolderFiles = useCallback(() => {
    if (folderPagination.hasMore && !loadingMore && !isLoadingRef.current) {
      fetchLibrary(currentFolderId, folderPagination.page + 1, true);
    }
  }, [folderPagination.page, folderPagination.hasMore, loadingMore, fetchLibrary, currentFolderId]);

  // Load more files for Photos / Files tabs
  const loadMoreAllFiles = useCallback(() => {
    if (allFilesPagination.hasMore && !isAllFilesLoadingRef.current) {
      fetchAllFiles(allFilesPagination.page + 1, true);
    }
  }, [allFilesPagination.page, allFilesPagination.hasMore, fetchAllFiles]);

  // Navigate into a folder — updates URL which triggers useEffect to fetch
  const navigateToFolder = useCallback((folderId) => {
    setSelectedFiles([]);
    if (folderId) {
      navigate(`/folders/${folderId}`);
    } else {
      navigate('/folders');
    }
  }, [navigate]);

  // Create folder
  const handleCreateFolder = async () => {
    if (!newFolderName.trim() || !hasMasterKey()) return;
    setCreatingFolder(true);
    try {
      const masterKey = getMasterKey();
      const nameEncrypted = await encryptFilename(newFolderName.trim(), masterKey);
      await folderService.createFolder({
        nameEncrypted,
        parentFolderId: currentFolderId || undefined,
      });
      setNewFolderName('');
      setShowCreateFolderModal(false);
      await fetchLibrary(currentFolderId, 1, false);
    } catch (error) {
      console.error('Failed to create folder:', error);
    } finally {
      setCreatingFolder(false);
    }
  };

  // Handle drag-and-drop: move files/folders into a target folder
  const handleDropOnFolder = async (targetFolder) => {
    setDragOverFolderId(null);
    const data = getDragState();
    clearDragState();

    if (!data) return;

    try {
      if (data.type === 'folder') {
        if (data.folderId === targetFolder.folderId) return;
        await folderService.moveFolderToFolder(data.folderId, targetFolder.folderId);
      } else if (data.type === 'files') {
        const fileIds = data.fileIds.length > 0 ? data.fileIds : selectedFiles;
        if (fileIds.length === 0) return;
        await folderService.moveFilesToFolder(fileIds, targetFolder.folderId);
        setSelectedFiles([]);
      }
      await fetchLibrary(currentFolderId, 1, false);
    } catch (error) {
      console.error('Failed to move items:', error);
    }
  };

  // Handle move selected files to folder
  const handleMoveToFolder = async (targetFolderId) => {
    if (selectedFiles.length === 0) return;
    try {
      await folderService.moveFilesToFolder(selectedFiles, targetFolderId);
      setSelectedFiles([]);
      await fetchLibrary(currentFolderId, 1, false);
    } catch (error) {
      console.error('Failed to move files:', error);
    }
  };

  // Simple upload hook - adds files to list immediately when uploaded
  const {
    stats: uploadStats,
    uploads: uploadsMap,
    isUploading,
    uploadFiles: uploadFilesWithEncryption,
    cancelAll: cancelAllUploads,
    retryFailed: retryFailedUploads,
    clearCompleted: clearUploadHistory,
    clearAllUploads,
    pauseUpload,
    resumeUpload,
    cancelUpload,
    pauseAll,
    resumeAll,
  } = useUpload({
    onFileUploaded: (uploadedFile) => {
      setFolderFiles((prev) => [uploadedFile, ...prev]);
      setAllFiles((prev) => [uploadedFile, ...prev]);
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
      window.location.href = '/folders?setupVault=true';
      return;
    }
  }, [needsVaultSetup, searchParams, vaultStateLoading]);

  // Show onboarding for normal signup path:
  // Vault is already set up during registration so handleMasterKeyUnlocked never fires.
  // SignUpPage sets aamenn_pending_onboarding before redirecting here.
  useEffect(() => {
    console.log('🔍 Onboarding check:', {
      vaultStateLoading,
      needsVaultSetup,
      hasMasterKey: hasMasterKey(),
      pending: localStorage.getItem('aamenn_pending_onboarding'),
      completed: localStorage.getItem('aamenn_onboarding_completed'),
      showRecoveryKeyPrompt
    });
    
    if (vaultStateLoading || needsVaultSetup) return;
    if (!hasMasterKey()) return;
    
    // Wait until recovery key flow is complete
    if (showRecoveryKeyPrompt) return;
    
    const pending = localStorage.getItem('aamenn_pending_onboarding');
    const completed = localStorage.getItem('aamenn_onboarding_completed');
    
    console.log('🔍 Final check:', { pending, completed });
    
    // Show onboarding if pending flag exists (new user signup)
    // This overrides any previous completed flag for this session
    if (pending) {
      console.log('✅ Showing onboarding (pending flag)!');
      localStorage.removeItem('aamenn_pending_onboarding');
      // Reset completed flag since this is a fresh signup
      localStorage.removeItem('aamenn_onboarding_completed');
      setShowOnboarding(true);
    }
  }, [vaultStateLoading, needsVaultSetup, showRecoveryKeyPrompt]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch data based on active tab and current folder (re-runs when tab or folder changes)
  useEffect(() => {
    if (needsVaultSetup || vaultStateLoading) return;

    if (activeTab === 'photos' || activeTab === 'files') {
      fetchAllFiles(1, false);
    } else if (activeTab === 'folders') {
      fetchLibrary(currentFolderId, 1, false);
    }
  }, [activeTab, currentFolderId, needsVaultSetup, vaultStateLoading, fetchLibrary, fetchAllFiles]);

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

  // Photos tab: ALL photos across ALL folders
  const photoFiles = allFiles.filter((f) => !FILE_HANDLERS[getFileType(f.mimeType)].usesPreviewModal);
  // Files tab: ALL documents across ALL folders
  const documentFiles = allFiles.filter((f) => FILE_HANDLERS[getFileType(f.mimeType)].usesPreviewModal);

  // Viewer file lists depend on which tab is active
  const viewerPhotoFiles = activeTab === 'folders'
    ? folderFiles.filter((f) => !FILE_HANDLERS[getFileType(f.mimeType)].usesPreviewModal)
    : photoFiles;
  const viewerDocumentFiles = activeTab === 'folders'
    ? folderFiles.filter((f) => FILE_HANDLERS[getFileType(f.mimeType)].usesPreviewModal)
    : documentFiles;

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
    const fileType = getFileType(file.mimeType);
    const handler = FILE_HANDLERS[fileType];

    const targetList = handler.usesPreviewModal ? viewerDocumentFiles : viewerPhotoFiles;
    const index = targetList.findIndex(
      (f) => f.fileId === file.fileId
    );

    if (index !== -1) {
      setCurrentFileIndex(index);
      if (handler.usesPreviewModal) {
        setDocumentViewerOpen(true);
      } else {
        setViewerOpen(true);
      }
    }
  };

  // Handle master key unlock
  const handleMasterKeyUnlocked = (masterKey, recoveryPhrase = null) => {
    setMasterKey(masterKey);

    // Update user state to reflect vault setup completion
    if (user) {
      setUser({ ...user, hasSecuritySetup: true });
    }

    // Show recovery key dialog if provided (new registration)
    if (recoveryPhrase) {
      setRecoveryKeyPhrase(recoveryPhrase);
      setShowRecoveryKeyPrompt(true);
    }

    // Clean vault setup URL param without a full page reload
    if (searchParams.has('setupVault')) {
      window.history.replaceState({}, '', '/folders');
    }

    // Show onboarding for first-time vault setup (Google signup path)
    const hasSeenOnboarding = localStorage.getItem('aamenn_onboarding_completed');
    if (!hasSeenOnboarding) {
      setShowOnboarding(true);
    }

    // If user was trying to view a file, open it now
    if (pendingFileView) {
      const file = pendingFileView;
      setPendingFileView(null);
      const mimeType = file.mimeType;
      const fileType = getFileType(mimeType);
      const handler = FILE_HANDLERS[fileType];
      
      const targetList = handler.usesPreviewModal ? viewerDocumentFiles : viewerPhotoFiles;
      const index = targetList.findIndex(
        (f) => f.fileId === file.fileId
      );
      if (index !== -1) {
        setCurrentFileIndex(index);
        if (handler.usesPreviewModal) {
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
      await uploadFilesWithEncryption(files, { folderId: currentFolderId });

      // Signal to the upload modal that files were accepted
      onProgress(100);
    } catch (error) {
      console.error('Upload failed:', error);
      throw error;
    }
  };

  // Handle share - create share links for selected files
  // Handle share single file from PhotoViewer
  const handleShareSingle = (file) => {
    const itemToShare = {
      fileId: file.fileId || file.id,
      cipherFileKey: file.cipherFileKey,
      fileNameEncrypted: file.fileNameEncrypted,
    };
    
    setShareItems([itemToShare]);
    setShowShareModal(true);
  };

  // Handle share bulk from header
  const handleShare = () => {
    if (selectedFiles.length === 0) return;

    const sourceList = activeTab === 'folders' ? folderFiles : allFiles;
    const itemsToShare = sourceList
      .filter((file) => selectedFiles.includes(file.fileId || file.id))
      .map((file) => ({
        fileId: file.fileId || file.id,
        cipherFileKey: file.cipherFileKey,
        fileNameEncrypted: file.fileNameEncrypted,
      }));

    setShareItems(itemsToShare);
    setShowShareModal(true);
  };

  // Handle delete - move to trash (for bulk selection)
  const handleDeleteSelected = async () => {
    if (selectedFiles.length === 0) return;

    const confirmMessage =
      selectedFiles.length === 1
        ? 'Move this file to trash?'
        : `Move ${selectedFiles.length} files to trash?`;

    if (!window.confirm(confirmMessage)) return;

    try {
      await fileService.moveToTrashBulk(selectedFiles);
      const deletedIds = new Set(selectedFiles);
      setFolderFiles((prev) => prev.filter((f) => !deletedIds.has(f.fileId || f.id)));
      setAllFiles((prev) => prev.filter((f) => !deletedIds.has(f.fileId || f.id)));
      setSelectedFiles([]);
    } catch (error) {
      console.error('Failed to move files to trash:', error);
    }
  };

  // Handle delete single file from PhotoViewer - move to trash
  const handleDeleteSingle = async (fileId) => {
    try {
      await fileService.moveToTrash(fileId);
      setViewerOpen(false);
      setFolderFiles((prev) => prev.filter((f) => (f.fileId || f.id) !== fileId));
      setAllFiles((prev) => prev.filter((f) => (f.fileId || f.id) !== fileId));
    } catch (error) {
      console.error('Failed to move file to trash:', error);
    }
  };

  // Handle favorite toggle
  const handleFavoriteToggle = (fileId, isFavorite) => {
    const update = (f) => (f.fileId || f.id) === fileId ? { ...f, isFavorite } : f;
    setFolderFiles((prev) => prev.map(update));
    setAllFiles((prev) => prev.map(update));
  };

  // Handle tab change — navigates to the tab's URL
  const handleTabChange = (tab) => {
    setSelectedFiles([]);
    const routes = {
      photos: '/photos', files: '/files', folders: '/folders',
      favorites: '/favorites', trash: '/trash', contacts: '/contacts',
    };
    navigate(routes[tab] || '/folders');
  };

  // Drop files/folders onto a breadcrumb item (move to that folder level)
  const handleDropOnBreadcrumb = async (targetFolderId) => {
    const data = getDragState();
    clearDragState();
    if (!data) return;

    try {
      if (data.type === 'folder') {
        if (data.folderId === targetFolderId) return;
        await folderService.moveFolderToFolder(data.folderId, targetFolderId);
      } else if (data.type === 'files') {
        const fileIds = data.fileIds.length > 0 ? data.fileIds : selectedFiles;
        if (fileIds.length === 0) return;
        await folderService.moveFilesToFolder(fileIds, targetFolderId);
        setSelectedFiles([]);
      }
      await fetchLibrary(currentFolderId, 1, false);
    } catch (error) {
      console.error('Failed to move items to breadcrumb target:', error);
    }
  };

  // Handle move to folder (bulk from header) - opens folder picker modal
  const handleMoveToFolderBulk = () => {
    if (selectedFiles.length === 0) return;
    setShowFolderPickerModal(true);
  };

  // Handle folder selection from picker modal
  const handleFolderPickerMove = async (targetFolderId) => {
    if (selectedFiles.length === 0) return;
    try {
      await folderService.moveFilesToFolder(selectedFiles, targetFolderId);
      const movedIds = new Set(selectedFiles);
      setFolderFiles((prev) => prev.filter((f) => !movedIds.has(f.fileId || f.id)));
      setAllFiles((prev) => prev.filter((f) => !movedIds.has(f.fileId || f.id)));
      setSelectedFiles([]);
      // Refresh current view
      if (activeTab === 'folders') {
        await fetchLibrary(currentFolderId, 1, false);
      } else {
        await fetchAllFiles(1, false);
      }
    } catch (error) {
      console.error('Failed to move files to folder:', error);
    }
  };

  // Toggle folder selection
  const handleFolderSelect = (folder) => {
    const id = folder.folderId;
    setSelectedFolders((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  // Rename a single folder (opens RenameModal)
  const handleFolderRenameSubmit = async (newName) => {
    if (!renamingFolder || !hasMasterKey()) return;
    setIsRenamingFolder(true);
    try {
      const masterKey = getMasterKey();
      const nameEncrypted = await encryptFilename(newName.trim(), masterKey);
      await folderService.updateFolder(renamingFolder.folderId, { nameEncrypted });
      await fetchLibrary(currentFolderId, 1, false);
      setSelectedFolders([]);
    } finally {
      setIsRenamingFolder(false);
      setRenamingFolder(null);
    }
  };

  // Delete selected folders (moves each to trash recursively)
  const handleFolderDeleteSelected = async () => {
    if (selectedFolders.length === 0) return;
    const confirmMsg = selectedFolders.length === 1
      ? 'Move this folder and all its contents to trash?'
      : `Move ${selectedFolders.length} folders and all their contents to trash?`;
    if (!window.confirm(confirmMsg)) return;

    try {
      await Promise.all(selectedFolders.map((id) => folderService.deleteFolder(id)));
      setChildFolders((prev) => prev.filter((f) => !selectedFolders.includes(f.folderId)));
      setSelectedFolders([]);
    } catch (error) {
      console.error('Failed to delete folders:', error);
    }
  };

  // Share selected folders — fetch all files and pass to ShareModal for re-encryption
  const handleFolderShareSelected = async () => {
    if (selectedFolders.length === 0 || !hasMasterKey()) return;
    try {
      const foldersToShare = await Promise.all(
        selectedFolders.map(async (id) => {
          const folder = childFolders.find((f) => f.folderId === id);
          if (!folder) return null;

          // Fetch all files in folder recursively
          const result = await folderService.getAllFilesInFolder(id);
          const files = result.files || [];

          return {
            folderId: folder.folderId,
            nameEncrypted: folder.nameEncrypted,
            files, // Array of { fileId, cipherFileKey, ... }
          };
        })
      );
      const validFolders = foldersToShare.filter((f) => f !== null);
      if (validFolders.length === 0) return;
      
      setShareItems(validFolders);
      setShowShareModal(true);
    } catch (error) {
      console.error('Failed to prepare folder share:', error);
    }
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
        <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 sm:py-6 md:py-8">
          {/* Header - without Upload button on mobile */}
          <GalleryHeader
            selectedCount={selectedFiles.length}
            onUpload={() => setShowUploadModal(true)}
            onDelete={handleDeleteSelected}
            onAddToAlbum={handleMoveToFolderBulk}
            onShare={handleShare}
            storageBar={<StorageBar refreshTrigger={folderFiles.length + allFiles.length} inline />}
            hideUploadOnMobile={true}
          />

          {/* Mobile: Tabs dropdown with Upload button */}
          <div className="flex items-center justify-between gap-2 mb-4 md:hidden">
            <div className="flex-1">
              <GalleryTabs activeTab={activeTab} onTabChange={handleTabChange} />
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {activeTab === 'folders' && (
                <button
                  onClick={() => setShowCreateFolderModal(true)}
                  disabled={!hasMasterKey()}
                  className="inline-flex items-center px-3 py-2 bg-amber-500 text-white text-xs font-medium hover:bg-amber-600 transition-colors whitespace-nowrap flex-shrink-0 disabled:opacity-50"
                >
                  <FontAwesomeIcon icon={faFolderPlus} className="w-3 h-3 mr-1" />
                  New
                </button>
              )}
              <button
                onClick={() => setShowUploadModal(true)}
                className="inline-flex items-center px-3 py-2 bg-blue-500 text-white text-xs font-medium hover:bg-blue-600 transition-colors whitespace-nowrap flex-shrink-0"
              >
                <FontAwesomeIcon icon={faCloudUpload} className="w-3 h-3 mr-1" />
                Upload
              </button>
            </div>
          </div>

          {/* Desktop: Normal tabs layout */}
          <div className="hidden md:flex flex-col md:flex-row items-start md:items-center justify-between gap-3 md:gap-0 mb-4 md:mb-6">
            <GalleryTabs activeTab={activeTab} onTabChange={handleTabChange} />
            {(activeTab === 'folders' || activeTab === 'photos' || activeTab === 'files') && (
              <div className="flex items-center gap-2">
                {activeTab === 'folders' && (
                  <button
                    onClick={() => setShowCreateFolderModal(true)}
                    disabled={!hasMasterKey()}
                    className="inline-flex items-center px-4 py-2 bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 transition-colors whitespace-nowrap flex-shrink-0 disabled:opacity-50"
                  >
                    <FontAwesomeIcon icon={faFolderPlus} className="w-4 h-4 mr-2" />
                    New Folder
                  </button>
                )}
                <button
                  onClick={() => setShowUploadModal(true)}
                  className="inline-flex items-center px-4 py-2 bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors whitespace-nowrap flex-shrink-0"
                >
                  <FontAwesomeIcon icon={faCloudUpload} className="w-4 h-4 mr-2" />
                  Upload Files
                </button>
                <GridSizeControl
                  size={gridSize}
                  onSizeChange={handleGridSizeChange}
                />
              </div>
            )}
          </div>

          {/* Folders Tab - Unified folder workspace */}
          {activeTab === 'folders' && (
            <div className="w-full">

              {/* Folder action toolbar — shown when 1+ folders are selected */}
              {selectedFolders.length > 0 && (
                <div className="flex items-center justify-between gap-3 mb-4 px-3 py-2 sm:px-4 sm:py-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
                  <span className="text-xs sm:text-sm font-medium text-blue-700 dark:text-blue-300 whitespace-nowrap">
                    {selectedFolders.length} folder{selectedFolders.length > 1 ? 's' : ''} selected
                  </span>
                  
                  {/* Desktop: Full buttons with text */}
                  <div className="hidden sm:flex items-center gap-2">
                    {selectedFolders.length === 1 && (
                      <button
                        onClick={async () => {
                          const folder = childFolders.find((f) => f.folderId === selectedFolders[0]);
                          if (!folder || !hasMasterKey()) return;
                          try {
                            const { decryptFilename } = await import('../../utils/crypto');
                            const plainName = await decryptFilename(folder.nameEncrypted, getMasterKey());
                            setRenamingFolder({ ...folder, decryptedName: plainName });
                          } catch {
                            setRenamingFolder({ ...folder, decryptedName: '' });
                          }
                        }}
                        className="inline-flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-zinc-700 border border-gray-300 dark:border-zinc-600 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-600 transition-colors"
                      >
                        <FontAwesomeIcon icon={faPen} className="w-3.5 h-3.5" />
                        Rename
                      </button>
                    )}
                    <button
                      onClick={handleFolderShareSelected}
                      disabled={!hasMasterKey()}
                      className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-500 text-white text-sm font-medium rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50"
                    >
                      <FontAwesomeIcon icon={faShare} className="w-3.5 h-3.5" />
                      Share
                    </button>
                    <button
                      onClick={handleFolderDeleteSelected}
                      className="inline-flex items-center gap-2 px-3 py-1.5 bg-red-500 text-white text-sm font-medium rounded-lg hover:bg-red-600 transition-colors"
                    >
                      <FontAwesomeIcon icon={faTrash} className="w-3.5 h-3.5" />
                      Delete
                    </button>
                  </div>

                  {/* Mobile: Icon-only buttons */}
                  <div className="flex sm:hidden items-center gap-1">
                    {selectedFolders.length === 1 && (
                      <button
                        onClick={async () => {
                          const folder = childFolders.find((f) => f.folderId === selectedFolders[0]);
                          if (!folder || !hasMasterKey()) return;
                          try {
                            const { decryptFilename } = await import('../../utils/crypto');
                            const plainName = await decryptFilename(folder.nameEncrypted, getMasterKey());
                            setRenamingFolder({ ...folder, decryptedName: plainName });
                          } catch {
                            setRenamingFolder({ ...folder, decryptedName: '' });
                          }
                        }}
                        className="p-2 bg-white dark:bg-zinc-700 border border-gray-300 dark:border-zinc-600 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-600 transition-colors"
                        aria-label="Rename"
                      >
                        <FontAwesomeIcon icon={faPen} className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={handleFolderShareSelected}
                      disabled={!hasMasterKey()}
                      className="p-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors disabled:opacity-50"
                      aria-label="Share"
                    >
                      <FontAwesomeIcon icon={faShare} className="w-4 h-4" />
                    </button>
                    <button
                      onClick={handleFolderDeleteSelected}
                      className="p-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
                      aria-label="Delete"
                    >
                      <FontAwesomeIcon icon={faTrash} className="w-4 h-4" />
                    </button>
                  </div>

                  <button
                    onClick={() => setSelectedFolders([])}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors ml-auto sm:ml-0"
                  >
                    <FontAwesomeIcon icon={faXmark} className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Breadcrumbs — also serve as drag targets to move items to parent folders */}
              {breadcrumbs.length > 0 && (
                <div className="mb-4">
                  <Breadcrumbs
                    breadcrumbs={breadcrumbs}
                    onNavigate={navigateToFolder}
                    onDropOnBreadcrumb={handleDropOnBreadcrumb}
                  />
                </div>
              )}

              {/* Child Folders Grid */}
              {childFolders.length > 0 && (
                <div
                  className="mb-4"
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget)) {
                      setDragOverFolderId(null);
                    }
                  }}
                  onDragEnd={() => setDragOverFolderId(null)}
                >
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-1">
                    {childFolders.map((folder) => (
                      <FolderCard
                        key={folder.folderId}
                        folder={folder}
                        onOpen={() => navigateToFolder(folder.folderId)}
                        isDragOver={dragOverFolderId === folder.folderId}
                        onDragOver={() => setDragOverFolderId(folder.folderId)}
                        onDrop={(targetFolder) => handleDropOnFolder(targetFolder)}
                        isSelected={selectedFolders.includes(folder.folderId)}
                        onSelect={handleFolderSelect}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Files in current folder */}
              {folderFiles.length === 0 && childFolders.length === 0 && !loading ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <div className="w-24 h-24 bg-gray-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mb-6">
                    <FontAwesomeIcon icon={faFolderOpen} className="w-12 h-12 text-gray-300 dark:text-gray-600" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                    {currentFolderId ? 'This folder is empty' : 'No files yet'}
                  </h3>
                  <p className="text-gray-500 dark:text-gray-400 mb-6 text-center max-w-md">
                    {currentFolderId
                      ? 'Upload files or create subfolders to organize your content.'
                      : 'Your encrypted vault is empty. Upload files or create folders to get started.'}
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowUploadModal(true)}
                      className="inline-flex items-center px-6 py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 transition-colors"
                    >
                      <FontAwesomeIcon icon={faPlus} className="w-5 h-5 mr-2" />
                      Upload Files
                    </button>
                    <button
                      onClick={() => setShowCreateFolderModal(true)}
                      disabled={!hasMasterKey()}
                      className="inline-flex items-center px-6 py-3 bg-amber-500 text-white rounded-lg font-medium hover:bg-amber-600 transition-colors disabled:opacity-50"
                    >
                      <FontAwesomeIcon icon={faFolderPlus} className="w-5 h-5 mr-2" />
                      New Folder
                    </button>
                  </div>
                </div>
              ) : folderFiles.length > 0 ? (
                <VirtualizedPhotoGrid
                  files={folderFiles}
                  selectedFiles={selectedFiles}
                  onSelectFile={handleSelectFile}
                  onViewFile={handleViewFile}
                  onFavoriteToggle={handleFavoriteToggle}
                  loading={loading || loadingMore}
                  hasMore={folderPagination.hasMore}
                  onLoadMore={loadMoreFolderFiles}
                  gridSize={gridSize}
                  emptyMessage="No files in this folder"
                />
              ) : null}

              <SyncingIndicator isSyncing={syncing} />
            </div>
          )}

          {/* Photos Tab - Images only */}
          {activeTab === 'photos' && (
            <div className="w-full">
              {photoFiles.length === 0 && !allFilesLoading ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <div className="w-24 h-24 bg-gray-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mb-6">
                    <FontAwesomeIcon icon={faImage} className="w-12 h-12 text-gray-300 dark:text-gray-600" />
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
                    <FontAwesomeIcon icon={faPlus} className="w-5 h-5 mr-2" />
                    Upload Photos
                  </button>
                </div>
              ) : (
                <VirtualizedPhotoGrid
                  files={photoFiles}
                  selectedFiles={selectedFiles}
                  onSelectFile={handleSelectFile}
                  onViewFile={handleViewFile}
                  onFavoriteToggle={handleFavoriteToggle}
                  loading={allFilesLoading}
                  hasMore={allFilesPagination.hasMore}
                  onLoadMore={loadMoreAllFiles}
                  gridSize={gridSize}
                  emptyMessage="No photos yet"
                />
              )}

              <SyncingIndicator isSyncing={syncing} />
            </div>
          )}

          {/* Files Tab - Documents (PDF, DOCX, TXT) */}
          {activeTab === 'files' && (
            <div className="w-full">
              {documentFiles.length === 0 && !allFilesLoading ? (
                <div className="flex flex-col items-center justify-center py-20">
                  <div className="w-24 h-24 bg-gray-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mb-6">
                    <FontAwesomeIcon icon={faFile} className="w-12 h-12 text-gray-300 dark:text-gray-600" />
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
                    <FontAwesomeIcon icon={faPlus} className="w-5 h-5 mr-2" />
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
                  loading={allFilesLoading}
                  hasMore={allFilesPagination.hasMore}
                  onLoadMore={loadMoreAllFiles}
                  gridSize={gridSize}
                  emptyMessage="No files yet"
                />
              )}
            </div>
          )}

          {activeTab === 'favorites' && (
            <FavoritesSection onViewFile={handleViewFile} />
          )}

          {activeTab === 'trash' && (
            <TrashSection onViewFile={handleViewFile} gridSize={gridSize} />
          )}

          {activeTab === 'contacts' && (
            <ContactsSection />
          )}
        </div>
      </main>

      {/* Upload Modal */}
      <UploadModal
        isOpen={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        onUpload={handleUpload}
      />

      {/* Create Folder Modal */}
      {showCreateFolderModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-zinc-800 p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              Create Folder
            </h2>
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
              className="w-full px-4 py-3 border border-gray-200 dark:border-zinc-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-white dark:bg-zinc-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateFolder();
                if (e.key === 'Escape') setShowCreateFolderModal(false);
              }}
            />
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowCreateFolderModal(false)}
                className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateFolder}
                disabled={!newFolderName.trim() || creatingFolder}
                className="px-4 py-2 bg-amber-500 text-white font-medium hover:bg-amber-600 transition-colors disabled:opacity-50"
              >
                {creatingFolder ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Photo Viewer */}
      {viewerPhotoFiles.length > 0 && (
        <PhotoViewer
          file={viewerPhotoFiles[currentFileIndex]}
          files={viewerPhotoFiles}
          isOpen={viewerOpen}
          onClose={() => setViewerOpen(false)}
          onNext={() => setCurrentFileIndex((i) => Math.min(i + 1, viewerPhotoFiles.length - 1))}
          onPrev={() => setCurrentFileIndex((i) => Math.max(i - 1, 0))}
          hasNext={currentFileIndex < viewerPhotoFiles.length - 1}
          hasPrev={currentFileIndex > 0}
          currentIndex={currentFileIndex}
          totalFiles={viewerPhotoFiles.length}
          onAddToAlbum={() => {}}
          onDelete={handleDeleteSingle}
          onShare={handleShareSingle}
        />
      )}

      {/* Document Preview Modal */}
      {viewerDocumentFiles.length > 0 && (
        <FilePreviewModal
          file={viewerDocumentFiles[currentFileIndex]}
          files={viewerDocumentFiles}
          isOpen={documentViewerOpen}
          onClose={() => setDocumentViewerOpen(false)}
          onNext={() => setCurrentFileIndex((i) => Math.min(i + 1, viewerDocumentFiles.length - 1))}
          onPrev={() => setCurrentFileIndex((i) => Math.max(i - 1, 0))}
          hasNext={currentFileIndex < viewerDocumentFiles.length - 1}
          hasPrev={currentFileIndex > 0}
          currentIndex={currentFileIndex}
        />
      )}

      {/* Session Locked Notification - Only show if user has vault configured but not unlocked */}
      {!hasMasterKey() && !needsVaultSetup && (
        <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 bg-zinc-900 border border-amber-500/30 rounded-lg p-4 shadow-lg z-50">
          <div className="flex items-start">
            <FontAwesomeIcon icon={faTriangleExclamation} className="w-5 h-5 text-amber-500 mt-0.5 mr-3 flex-shrink-0" />
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

      
      {/* Share Modal */}
      <ShareModal
        isOpen={showShareModal}
        onClose={() => {
          setShowShareModal(false);
          setShareItems([]);
        }}
        items={shareItems}
      />

      {/* Folder Picker Modal */}
      <FolderPickerModal
        isOpen={showFolderPickerModal}
        onClose={() => setShowFolderPickerModal(false)}
        onMoveToFolder={handleFolderPickerMove}
        selectedCount={selectedFiles.length}
      />

      {/* Rename Folder Modal */}
      <RenameModal
        isOpen={!!renamingFolder}
        onClose={() => { setRenamingFolder(null); setIsRenamingFolder(false); }}
        currentName={renamingFolder?.decryptedName || renamingFolder?.nameEncrypted || ''}
        onRename={handleFolderRenameSubmit}
        isRenaming={isRenamingFolder}
        label="Folder"
      />

      {/* Recovery Key Download Prompt */}
      {showRecoveryKeyPrompt && (
        <RecoveryKeyDownloadPrompt
          recoveryPhrase={recoveryKeyPhrase}
          onDismiss={() => {
            console.log('🔑 Recovery key dismissed, checking onboarding...');
            setShowRecoveryKeyPrompt(false);
            // Check if onboarding should be shown after recovery key
            const pending = localStorage.getItem('aamenn_pending_onboarding');
            const completed = localStorage.getItem('aamenn_onboarding_completed');
            console.log('🔑 After recovery key check:', { pending, completed });
            if (pending) {
              console.log('✅ Showing onboarding after recovery key!');
              localStorage.removeItem('aamenn_pending_onboarding');
              localStorage.removeItem('aamenn_onboarding_completed');
              setShowOnboarding(true);
            }
          }}
        />
      )}

      {/* Onboarding Modal */}
      <OnboardingModal
        isOpen={showOnboarding}
        onComplete={() => setShowOnboarding(false)}
      />

      {/* Upload Progress Panel */}
      {uploadStats.total > 0 && (
        <UploadProgressPanel
          stats={uploadStats}
          uploads={uploadsMap}
          onCancelAll={cancelAllUploads}
          onRetryFailed={retryFailedUploads}
          onClear={clearAllUploads}
          onPauseUpload={pauseUpload}
          onResumeUpload={resumeUpload}
          onCancelUpload={cancelUpload}
          onPauseAll={pauseAll}
          onResumeAll={resumeAll}
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
