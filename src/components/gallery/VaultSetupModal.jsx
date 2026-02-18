import { useState } from 'react';
import { generateRegistrationKeys, generateRecoveryParams } from '../../utils/crypto';
import { userService } from '../../services';
import RecoveryKeyDownloadPrompt from '../RecoveryKeyDownloadPrompt';

/**
 * VaultSetupModal - Modal for new Google users to create their Vault Password
 * 
 * @param {boolean} isOpen - Whether the modal is visible
 * @param {function} onClose - Callback when modal is closed
 * @param {function} onSetup - Callback with master key when setup is complete
 */
const VaultSetupModal = ({ isOpen, onClose, onSetup }) => {
  // Check if master key is already available (from AuthContext)
  const hasMasterKey = () => {
    try {
      return !!window.sessionStorage.getItem('aamenn_mk');
    } catch {
      return false;
    }
  };
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [recoveryPhrase, setRecoveryPhrase] = useState(null);
  const [pendingMasterKey, setPendingMasterKey] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validate password
    if (password.length < 8) {
      setError('Vault Password must be at least 8 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      // Generate all keys in one step
      const { encryptedMasterKey, kekSalt, kdfParams, masterKey } = await generateRegistrationKeys(password.trim());

      // Generate recovery key params
      const recoveryData = await generateRecoveryParams(masterKey);

      // Send to server (including recovery params)
      await userService.setupSecurity({
        encryptedMasterKey,
        kekSalt,
        kdfParams,
        recoveryEncryptedMasterKey: recoveryData.recoveryEncryptedMasterKey,
        recoverySalt: recoveryData.recoverySalt,
        recoveryKdfParams: recoveryData.recoveryKdfParams,
        encryptedRecoveryKey: recoveryData.encryptedRecoveryKey,
      });

      // Store master key and show recovery key modal
      setPendingMasterKey(masterKey);
      setRecoveryPhrase(recoveryData.recoveryPhrase);
      
      // Clear form
      setPassword('');
      setConfirmPassword('');
    } catch (err) {
      console.error('Vault setup error:', err);
      setError(err.response?.data?.message || 'Failed to set up vault. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  // Show recovery key download prompt after vault setup
  if (recoveryPhrase) {
    return (
      <RecoveryKeyDownloadPrompt
        recoveryPhrase={recoveryPhrase}
        onDismiss={() => {
          setRecoveryPhrase(null);
          // Only call onSetup if we haven't already set up the master key
          if (pendingMasterKey && !hasMasterKey()) {
            onSetup(pendingMasterKey);
            setPendingMasterKey(null);
          }
          // Don't call onClose() - let the parent handle the redirect after successful setup
          // This prevents the redirect loop
        }}
      />
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 rounded-xl p-6 w-full max-w-md">
        <div className="flex items-center mb-4">
          <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-lg font-semibold text-white">Create Password</h3>
            <p className="text-sm text-gray-400">Set up encryption for your files</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Create a strong password"
              className="w-full px-4 py-3 bg-zinc-800 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
              required
              minLength={8}
            />
            <p className="text-xs text-gray-500 mt-1">Must be at least 8 characters</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Confirm Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm your password"
              className="w-full px-4 py-3 bg-zinc-800 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              minLength={8}
            />
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={loading || !password || !confirmPassword}
              className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-white rounded-xl transition-colors"
            >
              {loading ? 'Setting up...' : 'Create Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default VaultSetupModal;
