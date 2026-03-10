import { useState } from 'react';
import { shareService } from '../../services';
import { generateShareKey, generateFolderShareKeys, decryptFilename } from '../../utils/crypto';
import { useAuth } from '../../context';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faShare, 
  faCheck, 
  faCopy 
} from '@fortawesome/free-solid-svg-icons';

const ShareModal = ({ isOpen, onClose, items }) => {
  const { getMasterKey, masterKeyAvailable } = useAuth();
  const [loading, setLoading] = useState(false);
  const [shareLinks, setShareLinks] = useState([]);
  const [expirationValue, setExpirationValue] = useState('24');
  const [expirationUnit, setExpirationUnit] = useState('hours');
  const [step, setStep] = useState('configure'); // 'configure' | 'success'

  if (!isOpen) return null;

  const handleCreate = async () => {
    const masterKey = getMasterKey();

    // Validate master key is available
    if (!masterKeyAvailable || !masterKey) {
      alert('Vault is locked. Please unlock your vault to create share links.');
      return;
    }

    try {
      setLoading(true);

      // Calculate expiration in seconds
      let expiresInSeconds = null;
      if (expirationValue) {
        const value = parseInt(expirationValue, 10);
        if (isNaN(value) || value < 1) {
          alert('Please enter a valid expiration duration.');
          return;
        }
        const multipliers = {
          minutes: 60,
          hours: 3600,
          days: 86400,
          weeks: 604800,
        };
        expiresInSeconds = value * multipliers[expirationUnit];
      }

      // Validate items
      if (!items || items.length === 0) {
        alert('No items selected for sharing.');
        return;
      }

      // Process each item
      const shareItems = [];
      const shareKeyRawArray = [];
      for (const item of items) {
        try {
          const isFolder = !!item.folderId;
          const isFile = !!item.fileId;

          if (isFolder) {
            // FOLDER: generate one share key, re-encrypt all file keys + folder name
            const folderFiles = item.files || [];
            const result = await generateFolderShareKeys(folderFiles, masterKey, item.nameEncrypted);

            // Derive slug from decrypted folder name
            let slugBase = 'shared-folder';
            try {
              const decrypted = await decryptFilename(item.nameEncrypted, masterKey);
              slugBase = decrypted.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 50);
            } catch { /* use default */ }

            shareItems.push({
              type: 'folder',
              id: item.folderId,
              slugBase,
              shareKey: result.shareKey,
              fileKeys: result.fileKeys,
              expiresInSeconds,
            });
            shareKeyRawArray.push(result.shareKeyRaw);
          } else {
            // FILE or ALBUM
            if (!item.cipherFileKey && !item.titleEncrypted) continue;

            const generated = await generateShareKey(item.cipherFileKey, masterKey);

            let slugBase = 'shared-item';
            if (item.fileNameEncrypted) {
              try {
                const decrypted = await decryptFilename(item.fileNameEncrypted, masterKey);
                slugBase = decrypted.toLowerCase().replace(/\.[^/.]+$/, '').replace(/[^a-z0-9]+/g, '-').substring(0, 50);
              } catch { /* use default */ }
            } else if (item.titleEncrypted) {
              try {
                const decrypted = await decryptFilename(item.titleEncrypted, masterKey);
                slugBase = decrypted.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 50);
              } catch { /* use default */ }
            }

            shareItems.push({
              type: isFile ? 'file' : 'album',
              id: item.fileId || item.albumId,
              slugBase,
              shareKey: generated.shareKey,
              expiresInSeconds,
            });
            shareKeyRawArray.push(generated.shareKeyRaw);
          }
        } catch (err) {
          console.error('Failed to process item:', err);
        }
      }

      if (shareItems.length === 0) {
        alert('No valid items could be processed for sharing.');
        return;
      }

      const response = await shareService.createShares(shareItems);
      const frontendBaseUrl = window.location.origin;
      const sharesWithUrls = response.shares.map((share, index) => ({
        ...share,
        url: `${frontendBaseUrl}/share/${share.slug}#k=${encodeURIComponent(shareKeyRawArray[index])}`,
      }));
      setShareLinks(sharesWithUrls);
      setStep('success');
    } catch (error) {
      console.error('Failed to create share links:', error);
      alert('Failed to create share links. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (url) => {
    navigator.clipboard.writeText(url);
    alert('Link copied to clipboard!');
  };

  const handleClose = () => {
    setStep('configure');
    setShareLinks([]);
    setExpirationValue('24');
    setExpirationUnit('hours');
    onClose();
  };

return (
  <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
    <div className="bg-white dark:bg-zinc-800 rounded-xl p-6 w-full max-w-md mx-4">
      {step === 'configure' ? (
        <div>
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
              <FontAwesomeIcon icon={faShare} className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Create Share Link</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Sharing {items.length} {items.length === 1 ? 'item' : 'items'}
              </p>
            </div>
          </div>

          {/* Content */}
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Link Expiration
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="1"
                  value={expirationValue}
                  onChange={(e) => setExpirationValue(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                  placeholder="24"
                />
                <select
                  value={expirationUnit}
                  onChange={(e) => setExpirationUnit(e.target.value)}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                >
                  <option value="hours">Hours</option>
                  <option value="days">Days</option>
                  <option value="weeks">Weeks</option>
                </select>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Leave empty for no expiration
              </p>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-lg">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                <strong>Public Access:</strong> Anyone with the link can view and download. The link includes a decryption key for secure access.
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3 mt-6">
            <button
              onClick={handleClose}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Link'}
            </button>
          </div>
        </div>
      ) : (
        <div>
          {/* Success Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
              <FontAwesomeIcon icon={faCheck} className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Share Link Created</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {shareLinks.length} link{shareLinks.length > 1 ? 's' : ''} ready to share
              </p>
            </div>
          </div>

          {/* Share Links */}
          <div className="space-y-3">
            {shareLinks.map((share) => (
              <div key={share.id} className="bg-gray-50 dark:bg-gray-700 p-3 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {share.slug}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {share.expiresAt ? `Expires: ${new Date(share.expiresAt).toLocaleDateString()}` : 'Never expires'}
                    </p>
                  </div>
                  <button
                    onClick={() => handleCopy(share.url)}
                    className="ml-2 p-2 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                  >
                    <FontAwesomeIcon icon={faCopy} className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Action */}
          <button
            onClick={handleClose}
            className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors mt-6"
          >
            Done
          </button>
        </div>
      )}
    </div>
  </div>
  );
};

export default ShareModal;
