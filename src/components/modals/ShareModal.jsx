import { useState } from 'react';
import { shareService } from '../../services';
import { generateShareKey, decryptFilename } from '../../utils/crypto';
import { useAuth } from '../../context';

const ShareModal = ({ isOpen, onClose, items, type }) => {
  console.log('ShareModal render', { isOpen, items, type });
  
  const { getMasterKey, masterKeyAvailable } = useAuth();
  const [loading, setLoading] = useState(false);
  const [shareLinks, setShareLinks] = useState([]);
  const [expirationValue, setExpirationValue] = useState('24');
  const [expirationUnit, setExpirationUnit] = useState('hours');
  const [step, setStep] = useState('configure'); // 'configure' | 'success'

  if (!isOpen) {
    console.log('ShareModal not open, returning null');
    return null;
  }

  const handleCreate = async () => {
    // Get master key using the function
    const masterKey = getMasterKey();
    
    // Debug master key state
    console.log('Master key state:', { 
      masterKeyAvailable, 
      masterKey: !!masterKey,
      masterKeyType: masterKey?.constructor?.name 
    });

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
        };
        expiresInSeconds = value * multipliers[expirationUnit];
      }

      // Validate items
      if (!items || items.length === 0) {
        alert('No items selected for sharing.');
        return;
      }

      // Process each item with better error handling
      const shareItems = [];
      const shareKeyRawArray = []; // Store shareKeyRaw during the loop
      for (const item of items) {
        try {
          // Validate item has required fields
          if (!item.cipherFileKey && !item.titleEncrypted) {
            console.error('Item missing encryption keys:', item);
            continue;
          }

          // Generate share key
          const { shareKey, shareKeyRaw } = await generateShareKey(
            item.cipherFileKey,
            masterKey
          );

          console.log(`🔑 SHARE KEY GENERATION for item index ${items.indexOf(item)}:`, {
            shareKeyLength: shareKey?.length,
            shareKeyRawLength: shareKeyRaw?.length,
            shareKeyRaw: shareKeyRaw?.substring(0, 20) + '...',
            shareKey: shareKey?.substring(0, 20) + '...'
          });

          // Generate slug from filename
          let slugBase = 'shared-item';
          if (item.fileNameEncrypted) {
            try {
              const decrypted = await decryptFilename(item.fileNameEncrypted, masterKey);
              slugBase = decrypted
                .toLowerCase()
                .replace(/\.[^/.]+$/, '') // Remove extension
                .replace(/[^a-z0-9]+/g, '-')
                .substring(0, 50);
            } catch (err) {
              console.error('Failed to decrypt filename:', err);
            }
          } else if (item.titleEncrypted) {
            try {
              // For albums, decrypt title
              const decrypted = await decryptFilename(item.titleEncrypted, masterKey);
              slugBase = decrypted
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .substring(0, 50);
            } catch (err) {
              console.error('Failed to decrypt album title:', err);
            }
          }

          const shareItem = {
            type: type || (item.fileNameEncrypted ? 'file' : 'album'),
            id: item.fileId || item.albumId,
            slugBase,
            shareKey,
            expiresInSeconds,
          };
          
          // Store shareKeyRaw separately for URL construction (not sent to backend)
          const itemWithShareKeyRaw = {
            ...shareItem,
            shareKeyRaw, // Keep for URL construction
          };
          
          console.log('📦 CREATED SHARE ITEM:', {
            type: shareItem.type,
            id: shareItem.id,
            idType: typeof shareItem.id,
            slugBase: shareItem.slugBase,
            slugBaseLength: shareItem.slugBase?.length,
            shareKeyLength: shareItem.shareKey?.length,
            shareKeyRawLength: itemWithShareKeyRaw.shareKeyRaw?.length,
            expiresInSeconds: shareItem.expiresInSeconds
          });
          
          console.log('📝 BEFORE PUSHING TO shareItems:', {
            shareItemsLength: shareItems.length,
            shareKeyRaw: itemWithShareKeyRaw.shareKeyRaw?.substring(0, 20) + '...'
          });
          
          shareItems.push(shareItem);
          shareKeyRawArray.push(shareKeyRaw); // Store shareKeyRaw in separate array
          
          console.log('📝 AFTER PUSHING TO shareItems:', {
            shareItemsLength: shareItems.length,
            shareKeyRawArrayLength: shareKeyRawArray.length,
            lastShareKeyRaw: shareKeyRaw?.substring(0, 20) + '...'
          });
        } catch (err) {
          console.error('Failed to process item:', item, err);
          // Continue with other items instead of failing completely
        }
      }

      if (shareItems.length === 0) {
        alert('No valid items could be processed for sharing.');
        return;
      }

      console.log('� shareKeyRawArray after loop:', {
        length: shareKeyRawArray.length,
        keys: shareKeyRawArray.map((key, index) => ({
          index,
          hasKey: !!key,
          keyLength: key?.length,
          key: key?.substring(0, 20) + '...'
        }))
      });

      // Debug the data being sent
      console.log('Sending to backend:', shareItems);

      // Create shares on backend
      const response = await shareService.createShares(shareItems);
      console.log('Backend response:', response);
      
      // Construct proper URLs with shareKeyRaw
      const sharesWithUrls = response.shares.map((share, index) => {
        const shareKeyRaw = shareKeyRawArray[index];
        console.log(`Constructing URL for share ${index}:`, {
          shareSlug: share.slug,
          shareKeyRaw,
          shareKeyRawLength: shareKeyRaw?.length
        });
        const frontendBaseUrl = window.location.origin;
        const url = `${frontendBaseUrl}/share/${share.slug}#k=${encodeURIComponent(shareKeyRaw)}`;
        
        console.log(`Constructed URL: ${url}`);
        
        return {
          ...share,
          url,
        };
      });
      
      console.log('Shares with proper URLs:', sharesWithUrls);
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
              <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
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
              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
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
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
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
