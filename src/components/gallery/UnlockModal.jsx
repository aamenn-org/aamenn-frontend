import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { unlockMasterKey } from '../../utils/crypto';
import { userService } from '../../services';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faKey, 
  faXmark, 
  faSpinner, 
  faUnlock 
} from '@fortawesome/free-solid-svg-icons';

const UnlockModal = ({ isOpen, onClose, onUnlocked }) => {
  const { t } = useTranslation('photos');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleUnlock = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Get encryption keys from server using current session
      const response = await userService.getUserSecurity();
      const { encryptedMasterKey, kekSalt } = response;

      if (!encryptedMasterKey || !kekSalt) {
        throw new Error('Failed to retrieve encryption keys');
      }

      // Unlock master key with password (trim to remove accidental whitespace)
      const trimmedPassword = password.trim();
      const masterKey = await unlockMasterKey(
        trimmedPassword,
        encryptedMasterKey,
        kekSalt
      );

      // Notify parent that unlock was successful
      onUnlocked(masterKey);
      setPassword('');
      onClose();
    } catch (err) {
      console.error('[UnlockModal] Unlock failed:', err);

      // Provide more specific error messages
      if (err.name === 'OperationError') {
        setError(
          'Incorrect password. The password does not match the one used to encrypt your data.'
        );
      } else if (err.message?.includes('encryption keys')) {
        setError(
          'Unable to retrieve encryption keys from server. Please try logging in again.'
        );
      } else {
        setError(
          'Failed to unlock. Please try again or re-login if the problem persists.'
        );
      }
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
      <div className="bg-zinc-900 rounded-2xl p-6 w-full max-w-md mx-4 border border-white/10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary-600/20 rounded-full flex items-center justify-center">
              <FontAwesomeIcon icon={faKey} className="w-5 h-5 text-primary-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">
                {t('vault.locked', 'Vault Locked')}
              </h3>
              <p className="text-sm text-gray-400">
                {t('vault.unlockDescription', 'Enter your Vault Password to unlock your encrypted files')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <FontAwesomeIcon icon={faXmark} className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleUnlock}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Vault Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your Vault Password"
              className="w-full px-4 py-3 bg-zinc-800 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              autoFocus
              required
            />
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <div className="mb-3 text-right">
            <a
              href="/forgot-password"
              className="text-sm text-blue-400 hover:text-blue-300 transition-colors"
            >
              Forgot Vault Password?
            </a>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-3 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !password}
              className="flex-1 px-4 py-3 bg-primary-600 hover:bg-primary-500 disabled:bg-primary-600/50 disabled:cursor-not-allowed text-white rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <FontAwesomeIcon icon={faSpinner} className="animate-spin w-4 h-4" />
                  <span>Unlocking...</span>
                </>
              ) : (
                <>
                  <FontAwesomeIcon icon={faUnlock} className="w-4 h-4" />
                  <span>Unlock</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UnlockModal;
