import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { albumService } from '../../services';
import { useAuth } from '../../context';
import { encryptFilename, decryptFilename } from '../../utils/crypto';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faFolderOpen, 
  faPlus,
  faTrash,
  faEye
} from '@fortawesome/free-solid-svg-icons';

const AlbumsSection = ({ onAlbumSelect }) => {
  const { t } = useTranslation(['albums', 'common']);
  const { getMasterKey, hasMasterKey } = useAuth();
  const [albums, setAlbums] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newAlbumName, setNewAlbumName] = useState('');
  const [creating, setCreating] = useState(false);

  const fetchAlbums = useCallback(async () => {
    try {
      setLoading(true);
      const response = await albumService.listAlbums();
      const albumsData = response.albums || [];

      // Decrypt album titles if master key is available
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
              return { ...album, title: t('encryptedAlbum', 'Encrypted Album') };
            }
          })
        );
        setAlbums(decryptedAlbums);
      } else {
        setAlbums(
          albumsData.map((album) => ({ ...album, title: t('encryptedAlbum', 'Encrypted Album') }))
        );
      }
    } catch (error) {
      console.error('Failed to fetch albums:', error);
      setAlbums([]);
    } finally {
      setLoading(false);
    }
  }, [getMasterKey, hasMasterKey]);

  // Fetch albums on mount
  useEffect(() => {
    fetchAlbums();
  }, [fetchAlbums]);

  const handleCreateAlbum = async () => {
    if (!newAlbumName.trim() || !hasMasterKey()) return;

    setCreating(true);
    try {
      const masterKey = getMasterKey();
      const titleEncrypted = await encryptFilename(
        newAlbumName.trim(),
        masterKey
      );

      await albumService.createAlbum({ titleEncrypted });
      setNewAlbumName('');
      setShowCreateModal(false);
      await fetchAlbums();
    } catch (error) {
      console.error('Failed to create album:', error);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteAlbum = async (albumId) => {
    if (!confirm(t('confirmDelete.message', 'Delete this album? Photos will not be deleted.'))) return;

    try {
      await albumService.deleteAlbum(albumId);
      await fetchAlbums();
    } catch (error) {
      console.error('Failed to delete album:', error);
    }
  };

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="aspect-square bg-gray-200 dark:bg-zinc-800 rounded-xl animate-pulse"
          />
        ))}
      </div>
    );
  }

  return (
    <div>
      {/* Create Album Button */}
      <div className="mb-6">
        <button
          onClick={() => setShowCreateModal(true)}
          disabled={!hasMasterKey()}
          className="inline-flex items-center px-4 py-2 bg-blue-500 text-white text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <FontAwesomeIcon icon={faPlus} className="w-4 h-4 mr-2" />
          {t('createAlbum', 'New Album')}
        </button>
      </div>

      {/* Albums Grid */}
      {albums.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-24 h-24 bg-gray-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mb-6">
            <FontAwesomeIcon icon={faFolderOpen} className="w-12 h-12 text-gray-300 dark:text-gray-600" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            {t('empty.title', 'No albums yet')}
          </h3>
          <p className="text-gray-500 dark:text-gray-400 mb-6 text-center max-w-md">
            {t('empty.description', 'Create your first album to organize your photos.')}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {albums.map((album) => (
            <div
              key={album.albumId}
              className="group relative aspect-square bg-gradient-to-br from-blue-500 to-blue-600 overflow-hidden cursor-pointer hover:shadow-lg transition-shadow"
              onClick={() => onAlbumSelect?.(album)}
            >
              {/* Album Cover */}
              <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
                <FontAwesomeIcon icon={faFolderOpen} className="w-12 h-12 text-white/80 mb-2" />
                <span className="text-white font-medium text-center text-sm truncate w-full">
                  {album.title}
                </span>
                <span className="text-white/70 text-xs mt-1">
                  {t('photoCount', '{{count}} photos', { count: album.fileCount || 0 })}
                </span>
              </div>

              {/* Delete button on hover */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleDeleteAlbum(album.albumId);
                }}
                className="absolute top-2 right-2 w-8 h-8 bg-black/50 hover:bg-red-500 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <FontAwesomeIcon icon={faEye} className="w-4 h-4 text-white" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Create Album Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-zinc-800 p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
              {t('create.title', 'Create Album')}
            </h2>
            <input
              type="text"
              value={newAlbumName}
              onChange={(e) => setNewAlbumName(e.target.value)}
              placeholder={t('namePlaceholder', 'Album name')}
              className="w-full px-4 py-3 border border-gray-200 dark:border-zinc-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none bg-white dark:bg-zinc-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateAlbum();
                if (e.key === 'Escape') setShowCreateModal(false);
              }}
            />
            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-white transition-colors"
              >
                {t('cancel', 'Cancel')}
              </button>
              <button
                onClick={handleCreateAlbum}
                disabled={!newAlbumName.trim() || creating}
                className="px-4 py-2 bg-blue-500 text-white font-medium hover:bg-blue-600 transition-colors disabled:opacity-50"
              >
                {creating ? t('creating', 'Creating...') : t('create', 'Create')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AlbumsSection;
