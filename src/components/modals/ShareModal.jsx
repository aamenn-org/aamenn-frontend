import { useState } from 'react';
import { shareService } from '../../services';
import { generateUnifiedShareKeys, decryptFilename } from '../../utils/crypto';
import { useAuth } from '../../context';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faShare, 
  faCheck, 
  faCopy 
} from '@fortawesome/free-solid-svg-icons';

const EXPIRY_MULTIPLIERS = {
  hours: 3600,
  days: 86400,
  weeks: 604800,
};


const ShareModal = ({ isOpen, onClose, items }) => {
  const { getMasterKey, masterKeyAvailable } = useAuth();
  const [loading, setLoading] = useState(false);
  const [shareLinks, setShareLinks] = useState([]);
  const [shareLink, setShareLink] = useState(null);
  const [copied, setCopied] = useState(false);
  const [expirationValue, setExpirationValue] = useState('24');
  const [expirationUnit, setExpirationUnit] = useState('hours');
  const step = shareLink ? 'success' : 'configure';

  if (!isOpen) return null;

  const handleCreate = async () => {
    const masterKey = getMasterKey();

    if (!masterKeyAvailable || !masterKey) {
      alert('Vault is locked. Please unlock your vault to create share links.');
      return;
    }
    if (!items || items.length === 0) {
      alert('No items selected for sharing.');
      return;
    }
 
    let expiresInSeconds = null;
    if (expirationValue) {
      const value = parseInt(expirationValue, 10);
      if (isNaN(value) || value < 1) {
        alert('Please enter a valid expiration duration.');
        return;
      }
      expiresInSeconds = value * EXPIRY_MULTIPLIERS[expirationUnit];
    }

    try {
      setLoading(true);

      const fileItems = items.filter((i) => !!i.fileId);
      const folderItems = items.filter((i) => !!i.folderId);
 
      const { shareKeyRaw, shareKey, fileKeys, fileNames } = await generateUnifiedShareKeys(
        fileItems,
        folderItems,
        masterKey,
      );
 
      const slugBase = await buildSlugBase(items, masterKey);
 
      const shareItemsList = [
        ...fileItems.map((f) => ({ type: 'file', id: f.fileId })),
        ...folderItems.map((f) => ({ type: 'folder', id: f.folderId })),
      ];
 
      const response = await shareService.createShare({
        slugBase,
        shareKey,
        items: shareItemsList,
        fileKeys: Object.keys(fileKeys).length > 0 ? fileKeys : undefined,
        fileNames: Object.keys(fileNames).length > 0 ? fileNames : undefined,
        expiresInSeconds,
      });
 
      const url = `${window.location.origin}/share/${response.share.slug}#k=${encodeURIComponent(shareKeyRaw)}`;
      setShareLink({ ...response.share, url });

    } catch (error) {
      console.error('Failed to create share link:', error);
      alert('Failed to create share link. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = async () => {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert('Failed to copy — please copy the link manually.');
    }
  };

  const handleClose = () => {
    setShareLink(null);
    setCopied(false);
    setExpirationValue('24');
    setExpirationUnit('hours');
    onClose();
  };

 return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
      <div className="bg-white dark:bg-zinc-800 rounded-xl p-6 w-full max-w-md mx-4">
        {step === 'configure' ? (
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                <FontAwesomeIcon icon={faShare} className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Create Share Link</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Sharing {items.length} {items.length === 1 ? 'item' : 'items'}
                </p>
              </div>
            </div>
 
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
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-zinc-700 dark:text-white"
                    placeholder="24"
                  />
                  <select
                    value={expirationUnit}
                    onChange={(e) => setExpirationUnit(e.target.value)}
                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-zinc-700 dark:text-white"
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
 
              <div className=" p-3 rounded-lg">
                <p className="text-sm">
                  <strong>Public Access:</strong> Anyone with the link can view and download.
                  The link includes a decryption key for secure access.
                </p>
              </div>
            </div>
 
            <div className="flex gap-3 mt-6">
              <button
                onClick={handleClose}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors"
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
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                <FontAwesomeIcon icon={faCheck} className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Share Link Ready</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {shareLink?.expiresAt
                    ? `Expires ${new Date(shareLink.expiresAt).toLocaleDateString()}`
                    : 'Never expires'}
                </p>
              </div>
            </div>
 
            <div className="bg-gray-50 dark:bg-zinc-700 p-3 rounded-lg flex items-center gap-2">
              <p className="flex-1 text-sm text-gray-700 dark:text-gray-300 truncate font-mono">
                {shareLink?.url}
              </p>
              <button
                onClick={handleCopy}
                className="flex-shrink-0 p-2 text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                title="Copy link"
              >
                <FontAwesomeIcon icon={copied ? faCheck : faCopy} className="w-4 h-4" />
              </button>
            </div>
 
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

async function buildSlugBase(items, masterKey) {
  const fileItems = items.filter((i) => !!i.fileId);
  const folderItems = items.filter((i) => !!i.folderId);
 
  if (folderItems.length === 1 && fileItems.length === 0) {
    try {
      const name = await decryptFilename(folderItems[0].nameEncrypted, masterKey);
      return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').substring(0, 50);
    } catch { /* fall through */ }
  }
 
  if (fileItems.length === 1 && folderItems.length === 0) {
    try {
      const name = await decryptFilename(fileItems[0].fileNameEncrypted, masterKey);
      return name.toLowerCase().replace(/\.[^/.]+$/, '').replace(/[^a-z0-9]+/g, '-').substring(0, 50);
    } catch { /* fall through */ }
  }
 
  return 'shared-items';
}

export default ShareModal;
