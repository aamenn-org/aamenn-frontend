import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../../context';
import { useVaultState } from '../../../hooks/useVaultState';
import { authService, userService } from '../../../services';
import { reEncryptMasterKey } from '../../../utils/crypto';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faTimes, faSpinner, faTriangleExclamation, faTrash } from '@fortawesome/free-solid-svg-icons';

const SecuritySection = () => {
  const { t } = useTranslation('settings');
  const { user, logout, getEncryptionParams, updateEncryptionParams } = useAuth();
  const { vaultConfigured, needsVaultSetup } = useVaultState();
  const navigate = useNavigate();

  // Check if user is OAuth (Google) user
  const isOAuthUser = localStorage.getItem('authProvider') !== 'local';

  // Change password state
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState('');

  // Delete account state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // Handle password change
  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess(false);

    // Validation
    if (passwordForm.newPassword.length < 8) {
      setPasswordError(t('password.requirements'));
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError(t('password.mismatch'));
      return;
    }

    setPasswordLoading(true);

    try {
      // Get current encryption params
      const encryptionParams = getEncryptionParams();
      if (!encryptionParams) {
        throw new Error('Encryption parameters not found');
      }

      // Re-encrypt master key with new password
      const { newEncryptedMasterKey, newKekSalt } = await reEncryptMasterKey(
        passwordForm.currentPassword,
        passwordForm.newPassword,
        encryptionParams.encryptedMasterKey,
        encryptionParams.kekSalt
      );

      // Call the vault password change endpoint
      await authService.changeVaultPassword({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword,
        newEncryptedMasterKey,
        newKekSalt,
      });

      // Update stored encryption params for future password changes
      updateEncryptionParams({
        encryptedMasterKey: newEncryptedMasterKey,
        kekSalt: newKekSalt,
      });

      // Clear form
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      });
      setPasswordSuccess(true);
      setTimeout(() => setPasswordSuccess(false), 5000);
    } catch (err) {
      console.error('Password change failed:', err);
      if (err.response?.status === 401) {
        setPasswordError(t('password.incorrectCurrent'));
      } else {
        setPasswordError(
          err.response?.data?.message || t('password.changeError')
        );
      }
    } finally {
      setPasswordLoading(false);
    }
  };

  // Handle account deletion
  const handleDeleteAccount = async () => {
    setDeleteError('');
    setDeleteLoading(true);

    try {
      // Always use the provided password (now required for both local and Google users)
      await userService.deleteAccount(deletePassword);
      logout();
      navigate('/');
    } catch (err) {
      console.error('Account deletion failed:', err);
      if (err.response?.status === 401) {
        setDeleteError(isOAuthUser ? 'Invalid Vault Password' : t('deleteAccount.incorrectPassword'));
      } else {
        setDeleteError(
          err.response?.data?.message || t('deleteAccount.deleteError')
        );
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Change Password Card */}
      {!isOAuthUser && (
        <div className="bg-white dark:bg-zinc-800 rounded-xl shadow-sm border border-gray-200 dark:border-zinc-700 p-6">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
            {t('password.title')}
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
            {t('password.description')}
          </p>

          <form onSubmit={handlePasswordChange} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                {t('password.currentPassword')}
              </label>
              <input
                type="password"
                value={passwordForm.currentPassword}
                onChange={(e) =>
                  setPasswordForm((prev) => ({
                    ...prev,
                    currentPassword: e.target.value,
                  }))
                }
                placeholder={t('password.currentPasswordPlaceholder')}
                className="w-full px-4 py-3 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-600 
                  rounded-lg text-gray-900 dark:text-white text-sm
                  placeholder:text-gray-400 dark:placeholder:text-gray-500
                  focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                {t('password.newPassword')}
              </label>
              <input
                type="password"
                value={passwordForm.newPassword}
                onChange={(e) =>
                  setPasswordForm((prev) => ({
                    ...prev,
                    newPassword: e.target.value,
                  }))
                }
                placeholder={t('password.newPasswordPlaceholder')}
                className="w-full px-4 py-3 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-600 
                  rounded-lg text-gray-900 dark:text-white text-sm
                  placeholder:text-gray-400 dark:placeholder:text-gray-500
                  focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                required
                minLength={8}
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">
                {t('password.requirements')}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                {t('password.confirmPassword')}
              </label>
              <input
                type="password"
                value={passwordForm.confirmPassword}
                onChange={(e) =>
                  setPasswordForm((prev) => ({
                    ...prev,
                    confirmPassword: e.target.value,
                  }))
                }
                placeholder={t('password.confirmPasswordPlaceholder')}
                className="w-full px-4 py-3 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-600 
                  rounded-lg text-gray-900 dark:text-white text-sm
                  placeholder:text-gray-400 dark:placeholder:text-gray-500
                  focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                required
              />
</div>
          {/* Success/Error Messages */}
          {passwordSuccess && (
            <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-lg text-sm">
              <FontAwesomeIcon icon={faCheck} className="w-5 h-5" />
              {t('password.changeSuccess')}
            </div>
          )}

          {passwordError && (
            <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm">
              <FontAwesomeIcon icon={faTimes} className="w-5 h-5" />
              {passwordError}
            </div>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={passwordLoading}
                className="px-6 py-2.5 bg-primary-500 text-white text-sm font-medium rounded-lg
                  hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2
                  disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200
                  dark:focus:ring-offset-zinc-800"
              >
                {passwordLoading ? (
                  <span className="flex items-center gap-2">
                    <FontAwesomeIcon icon={faSpinner} className="animate-spin h-4 w-4" />
                    {t('common:actions.loading')}
                  </span>
                ) : (
                  t('password.changePassword')
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Vault Setup Required for New Google Users */}
      {needsVaultSetup && isOAuthUser && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-900/30 rounded-xl p-6">
          <div className="flex gap-3 mb-4">
            <FontAwesomeIcon icon={faTriangleExclamation} className="w-6 h-6 text-blue-500 flex-shrink-0" />
            <div>
              <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-2">
                Set Up Your Vault Password
              </h3>
              <p className="text-sm text-blue-700 dark:text-blue-300 mb-4">
                You're signed in with Google, but you need to create a vault password to secure your encrypted files. This password is used to encrypt and decrypt your photos and documents.
              </p>
              <div className="bg-blue-100 dark:bg-blue-900/40 rounded-lg p-3 mb-4">
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  <strong>Important:</strong> Your vault password is different from your Google password. Only you can access your encrypted files with this password.
                </p>
              </div>
              <button
                onClick={() => window.location.href = '/photos?setupVault=true'}
                className="px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-lg hover:bg-blue-600 transition-colors"
              >
                Set Up Vault Password
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Account Card - Only show if user has vault setup */}
      {vaultConfigured && (
        <div className="bg-white dark:bg-zinc-800 rounded-xl shadow-sm border border-red-200 dark:border-red-900/50 p-6">
        <h2 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-1">
          {t('deleteAccount.title')}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
          {t('deleteAccount.description')}
        </p>

        <div className="p-4 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/30 rounded-lg mb-4">
          <div className="flex gap-3">
            <FontAwesomeIcon icon={faTriangleExclamation} className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700 dark:text-red-300">
              {t('deleteAccount.warning')}
            </p>
          </div>
        </div>

        {!showDeleteConfirm ? (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="px-6 py-2.5 bg-red-500 text-white text-sm font-medium rounded-lg
              hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2
              transition-all duration-200 dark:focus:ring-offset-zinc-800"
          >
            {t('deleteAccount.deleteButton')}
          </button>
        ) : (
          <div className="space-y-4 p-4 bg-gray-50 dark:bg-zinc-900 rounded-lg border border-gray-200 dark:border-zinc-700">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              {t('deleteAccount.confirmTitle')}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t('deleteAccount.confirmDescription')}
            </p>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                {isOAuthUser ? 'Vault Password' : t('deleteAccount.passwordLabel')}
              </label>
              <input
                type="password"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                placeholder={isOAuthUser ? 'Enter your vault password' : t('deleteAccount.passwordPlaceholder')}
                className="w-full px-4 py-3 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-600 
                  rounded-lg text-gray-900 dark:text-white text-sm
                  focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                required
              />
              {isOAuthUser && (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Enter your vault password to confirm account deletion
                </p>
              )}
            </div>

            {deleteError && (
              <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm">
                <FontAwesomeIcon icon={faTimes} className="w-5 h-5" />
                {deleteError}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeletePassword('');
                  setDeleteError('');
                }}
                className="px-4 py-2 bg-gray-200 dark:bg-zinc-700 text-gray-700 dark:text-gray-200 text-sm font-medium rounded-lg
                  hover:bg-gray-300 dark:hover:bg-zinc-600 transition-all duration-200"
              >
                {t('common:actions.cancel')}
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleteLoading || !deletePassword}
                className="px-4 py-2 bg-red-500 text-white text-sm font-medium rounded-lg
                  hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              >
                {deleteLoading ? (
                  <span className="flex items-center gap-2">
                    <FontAwesomeIcon icon={faSpinner} className="animate-spin h-4 w-4" />
                    {t('common:actions.loading')}
                  </span>
                ) : (
                  t('deleteAccount.deleteButton')
                )}
              </button>
            </div>
          </div>
        )}
      </div>
      )}
    </div>
  );
};

export default SecuritySection;
