import { useState, useEffect, useCallback } from 'react';
import { albumService } from '../../services';
import { useAuth } from '../../context';
import { encryptFilename, decryptFilename } from '../../utils/crypto';

const AddToAlbumModal = ({ isOpen, onClose, fileIds = [], onSuccess }) => {
  const { getMasterKey, hasMasterKey } = useAuth();
  const [albums, setAlbums] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [selectedAlbumId, setSelectedAlbumId] = useState(null);
  const [showCreateNew, setShowCreateNew] = useState(false);
  const [newAlbumName, setNewAlbumName] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchAlbums = useCallback(async () => {
    try {
      setLoading(true);
      const response = await albumService.listAlbums();
      const albumsData = response.albums || [];

      if (hasMasterKey()) {
        const masterKey = getMasterKey();
        const decryptedAlbums = await Promise.all(
          albumsData.map(async (album) => {
            try {
              const decryptedTitle = await decryptFilename(
                album.titleEncrypted,
                masterKey
              );
              return { ...album, title: decryptedTitle };
            } catch (error) {
              console.warn('Failed to decrypt album title:', error);
              return { ...album, title: 'Encrypted Album' };
            }
          })
        );
        setAlbums(decryptedAlbums);
      } else {
        setAlbums(
          albumsData.map((album) => ({ ...album, title: 'Encrypted Album' }))
        );
      }
    } catch (error) {
      console.error('Failed to fetch albums:', error);
      setAlbums([]);
    } finally {
      setLoading(false);
    }
  }, [getMasterKey, hasMasterKey]);

  useEffect(() => {
    if (isOpen) {
      fetchAlbums();
      setSelectedAlbumId(null);
      setShowCreateNew(false);
      setNewAlbumName('');
    }
  }, [isOpen, fetchAlbums]);

  const handleCreateAlbum = async () => {
    if (!newAlbumName.trim() || !hasMasterKey()) return;

    setCreating(true);
    try {
      const masterKey = getMasterKey();
      const titleEncrypted = await encryptFilename(
        newAlbumName.trim(),
        masterKey
      );

      const result = await albumService.createAlbum({ titleEncrypted });
      setNewAlbumName('');
      setShowCreateNew(false);
      await fetchAlbums();
      // Auto-select the newly created album
      setSelectedAlbumId(result.albumId);
    } catch (error) {
      console.error('Failed to create album:', error);
    } finally {
      setCreating(false);
    }
  };

  const handleAddToAlbum = async () => {
    if (!selectedAlbumId || fileIds.length === 0) return;

    setAdding(true);
    try {
      await albumService.addFilesToAlbum(selectedAlbumId, fileIds);
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error('Failed to add files to album:', error);
    } finally {
      setAdding(false);
    }
  };

  if (!isOpen) return null;

  const fileCount = fileIds.length;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
      <div className="bg-white dark:bg-zinc-800 p-6 w-full max-w-md mx-4 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Add to Album</h2>
          <button
            onClick={onClose}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          {fileCount === 1
            ? 'Select an album to add this photo to:'
            : `Select an album to add ${fileCount} photos to:`}
        </p>

        {/* Albums List */}
        <div className="flex-1 overflow-y-auto mb-4 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin h-8 w-8 border-2 border-blue-500 dark:border-blue-400 border-t-transparent"></div>
            </div>
          ) : albums.length === 0 && !showCreateNew ? (
            <div className="text-center py-8">
              <svg
                className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1}
                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                />
              </svg>
              <p className="text-gray-500 dark:text-gray-400 text-sm mb-3">No albums yet</p>
              <button
                onClick={() => setShowCreateNew(true)}
                className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium"
              >
                Create your first album
              </button>
            </div>
          ) : (
            <>
              {albums.map((album) => (
                <button
                  key={album.albumId}
                  onClick={() => setSelectedAlbumId(album.albumId)}
                  className={`w-full flex items-center p-3 border-2 transition-all ${
                    selectedAlbumId === album.albumId
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
                      : 'border-gray-200 dark:border-zinc-600 hover:border-gray-300 dark:hover:border-zinc-500'
                  }`}
                >
                  <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center mr-3">
                    <svg
                      className="w-5 h-5 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                      />
                    </svg>
                  </div>
                  <div className="flex-1 text-left">
                    <span className="font-medium text-gray-900 dark:text-white">
                      {album.title}
                    </span>
                    <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">
                      ({album.fileCount || 0} photos)
                    </span>
                  </div>
                  {selectedAlbumId === album.albumId && (
                    <svg
                      className="w-5 h-5 text-blue-500"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </button>
              ))}

              {/* Create New Album Option */}
              {showCreateNew ? (
                <div className="p-3 border-2 border-dashed border-gray-300 dark:border-zinc-600">
                  <input
                    type="text"
                    value={newAlbumName}
                    onChange={(e) => setNewAlbumName(e.target.value)}
                    placeholder="Album name"
                    className="w-full px-3 py-2 border border-gray-200 dark:border-zinc-600 dark:bg-zinc-700 dark:text-white dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleCreateAlbum();
                      if (e.key === 'Escape') setShowCreateNew(false);
                    }}
                  />
                  <div className="flex justify-end gap-2 mt-2">
                    <button
                      onClick={() => setShowCreateNew(false)}
                      className="px-3 py-1.5 text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreateAlbum}
                      disabled={!newAlbumName.trim() || creating}
                      className="px-3 py-1.5 bg-blue-500 text-white text-sm hover:bg-blue-600 disabled:opacity-50"
                    >
                      {creating ? 'Creating...' : 'Create'}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowCreateNew(true)}
                  className="w-full flex items-center p-3 border-2 border-dashed border-gray-300 dark:border-zinc-600 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all"
                >
                  <div className="w-10 h-10 bg-gray-100 dark:bg-zinc-700 flex items-center justify-center mr-3">
                    <svg
                      className="w-5 h-5 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                  </div>
                  <span className="font-medium text-gray-600 dark:text-gray-300">
                    Create New Album
                  </span>
                </button>
              )}
            </>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-100 dark:border-zinc-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleAddToAlbum}
            disabled={!selectedAlbumId || adding}
            className="px-4 py-2 bg-blue-500 text-white font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {adding ? 'Adding...' : 'Add to Album'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddToAlbumModal;
