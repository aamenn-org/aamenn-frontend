import { useState, useEffect } from 'react';
import { useAuth } from '../../context';
import { folderService } from '../../services';
import { decryptFilename } from '../../utils/crypto';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faFolder, 
  faFolderOpen, 
  faHome, 
  faChevronRight,
  faArrowLeft,
  faTimes
} from '@fortawesome/free-solid-svg-icons';

const FolderPickerModal = ({ isOpen, onClose, onMoveToFolder, selectedCount = 0, initialFolderId = null }) => {
  const { getMasterKey, hasMasterKey } = useAuth();
  const [currentFolderId, setCurrentFolderId] = useState(initialFolderId);
  const [folders, setFolders] = useState([]);
  const [breadcrumbs, setBreadcrumbs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [decryptedFolders, setDecryptedFolders] = useState([]);
  const [decryptedBreadcrumbs, setDecryptedBreadcrumbs] = useState([]);

  useEffect(() => {
    if (!isOpen || !hasMasterKey()) return;

    const fetchFolders = async () => {
      setLoading(true);
      try {
        const params = {};
        if (currentFolderId) params.folderId = currentFolderId;

        const response = await folderService.getLibrary(params);
        setFolders(response.folders || []);
        setBreadcrumbs(response.breadcrumbs || []);
      } catch (error) {
        console.error('Failed to fetch folders:', error);
        setFolders([]);
      } finally {
        setLoading(false);
      }
    };

    fetchFolders();
  }, [isOpen, currentFolderId, hasMasterKey]);

  // Decrypt folder names
  useEffect(() => {
    if (!hasMasterKey() || folders.length === 0) {
      setDecryptedFolders([]);
      return;
    }

    const decrypt = async () => {
      const masterKey = getMasterKey();
      const results = await Promise.all(
        folders.map(async (folder) => {
          try {
            const name = await decryptFilename(folder.nameEncrypted, masterKey);
            return { ...folder, decryptedName: name };
          } catch {
            return { ...folder, decryptedName: 'Encrypted Folder' };
          }
        })
      );
      setDecryptedFolders(results);
    };

    decrypt();
  }, [folders, getMasterKey, hasMasterKey]);

  // Decrypt breadcrumbs
  useEffect(() => {
    if (!hasMasterKey() || breadcrumbs.length === 0) {
      setDecryptedBreadcrumbs([]);
      return;
    }

    const decrypt = async () => {
      const masterKey = getMasterKey();
      const results = await Promise.all(
        breadcrumbs.map(async (crumb) => {
          try {
            const name = await decryptFilename(crumb.nameEncrypted, masterKey);
            return { ...crumb, decryptedName: name };
          } catch {
            return { ...crumb, decryptedName: 'Encrypted' };
          }
        })
      );
      setDecryptedBreadcrumbs(results);
    };

    decrypt();
  }, [breadcrumbs, getMasterKey, hasMasterKey]);

  const handleMoveHere = () => {
    onMoveToFolder(currentFolderId);
    onClose();
  };

  const navigateToFolder = (folderId) => {
    setCurrentFolderId(folderId);
  };

  const goBack = () => {
    if (decryptedBreadcrumbs.length === 0) {
      setCurrentFolderId(null);
    } else {
      const parent = decryptedBreadcrumbs[decryptedBreadcrumbs.length - 2];
      setCurrentFolderId(parent ? parent.folderId : null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-zinc-800 rounded-lg w-full max-w-2xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-zinc-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Move {selectedCount} {selectedCount === 1 ? 'item' : 'items'} to folder
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <FontAwesomeIcon icon={faTimes} className="w-5 h-5" />
          </button>
        </div>

        {/* Breadcrumbs */}
        <div className="px-4 py-3 border-b border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-900/50">
          <div className="flex items-center gap-2 text-sm">
            <button
              onClick={() => navigateToFolder(null)}
              className="flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-600 dark:text-gray-300 transition-colors"
            >
              <FontAwesomeIcon icon={faHome} className="w-3.5 h-3.5" />
              <span>Home</span>
            </button>

            {decryptedBreadcrumbs.map((crumb, index) => (
              <div key={crumb.folderId} className="flex items-center gap-2">
                <FontAwesomeIcon
                  icon={faChevronRight}
                  className="w-2.5 h-2.5 text-gray-400 dark:text-gray-500"
                />
                <button
                  onClick={() => navigateToFolder(crumb.folderId)}
                  className="px-2 py-1 rounded hover:bg-gray-200 dark:hover:bg-zinc-700 text-gray-600 dark:text-gray-300 transition-colors"
                >
                  {crumb.decryptedName}
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Folder List */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
          ) : decryptedFolders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-400 dark:text-gray-500">
              <FontAwesomeIcon icon={faFolderOpen} className="w-16 h-16 mb-3" />
              <p>No subfolders here</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {decryptedFolders.map((folder) => (
                <button
                  key={folder.folderId}
                  onClick={() => navigateToFolder(folder.folderId)}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors text-left group"
                >
                  <FontAwesomeIcon
                    icon={faFolder}
                    className="w-6 h-6 text-amber-400 dark:text-amber-500 group-hover:text-amber-500 dark:group-hover:text-amber-400 transition-colors"
                  />
                  <span className="flex-1 text-gray-900 dark:text-white font-medium">
                    {folder.decryptedName}
                  </span>
                  <FontAwesomeIcon
                    icon={faChevronRight}
                    className="w-4 h-4 text-gray-400 dark:text-gray-500"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between gap-3 p-4 border-t border-gray-200 dark:border-zinc-700">
          <button
            onClick={goBack}
            disabled={currentFolderId === null}
            className="inline-flex items-center px-4 py-2 text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FontAwesomeIcon icon={faArrowLeft} className="w-4 h-4 mr-2" />
            Back
          </button>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleMoveHere}
              className="px-6 py-2 bg-blue-500 text-white font-medium rounded-lg hover:bg-blue-600 transition-colors"
            >
              Move Here
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FolderPickerModal;
