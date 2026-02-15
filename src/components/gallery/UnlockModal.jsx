import { useState } from 'react';
import { unlockMasterKey } from '../../utils/crypto';
import { authService, userService } from '../../services';

const UnlockModal = ({ isOpen, onClose, onUnlocked }) => {
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

      console.log('[UnlockModal] Encryption keys response:', {
        hasEncryptedMasterKey: !!response.encryptedMasterKey,
        encryptedMasterKeyLength: response.encryptedMasterKey?.length,
        hasKekSalt: !!response.kekSalt,
        kekSaltLength: response.kekSalt?.length,
      });

      const { encryptedMasterKey, kekSalt } = response;

      if (!encryptedMasterKey || !kekSalt) {
        console.error('[UnlockModal] Missing keys:', {
          encryptedMasterKey,
          kekSalt,
        });
        throw new Error('Failed to retrieve encryption keys');
      }

      // Unlock master key with password (trim to remove accidental whitespace)
      const trimmedPassword = password.trim();
      console.log('[UnlockModal] Attempting to unlock master key...');
      const masterKey = await unlockMasterKey(
        trimmedPassword,
        encryptedMasterKey,
        kekSalt
      );

      console.log('[UnlockModal] Master key unlocked successfully');

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
              <svg
                className="w-5 h-5 text-primary-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">
                Session Locked
              </h3>
              <p className="text-sm text-gray-400">
                Enter your password to unlock
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
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

        {/* Form */}
        <form onSubmit={handleUnlock}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
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
                  <svg
                    className="animate-spin w-4 h-4"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  <span>Unlocking...</span>
                </>
              ) : (
                <>
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"
                    />
                  </svg>
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
