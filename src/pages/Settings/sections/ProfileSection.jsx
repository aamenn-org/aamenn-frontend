import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../../context';
import { userService } from '../../../services';

const ProfileSection = () => {
  const { t } = useTranslation('settings');
  const { user, setUser } = useAuth();
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  // Check if user is a Google user
  const isGoogleUser = user?.authProvider === 'google';

  useEffect(() => {
    if (user?.displayName) {
      setDisplayName(user.displayName);
    }
  }, [user]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setLoading(true);

    try {
      const updatedUser = await userService.updateProfile({
        displayName: displayName.trim() || null,
      });
      setUser((prev) => ({ ...prev, ...updatedUser }));
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err.response?.data?.message || t('profile.updateError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Profile Information Card */}
      <div className="bg-white dark:bg-zinc-800 rounded-xl shadow-sm border border-gray-200 dark:border-zinc-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
          {t('profile.title')}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          {t('profile.description')}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Display Name */}
          <div>
            <label
              htmlFor="displayName"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
            >
              {t('profile.fullName')}
            </label>
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t('profile.fullNamePlaceholder')}
              disabled={isGoogleUser}
              className={`w-full px-4 py-3 border rounded-lg text-sm transition-all duration-200
                ${isGoogleUser 
                  ? 'bg-gray-100 dark:bg-zinc-900/50 border-gray-200 dark:border-zinc-700 text-gray-500 dark:text-gray-400 cursor-not-allowed' 
                  : 'bg-gray-50 dark:bg-zinc-900 border-gray-200 dark:border-zinc-600 text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent'
                }`}
              maxLength={255}
            />
            {isGoogleUser && (
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">
                Your name is managed by Google and cannot be changed here.
              </p>
            )}
          </div>

          {/* Email (Read-only) */}
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5"
            >
              {t('profile.email')}
            </label>
            <input
              id="email"
              type="email"
              value={user?.email || ''}
              readOnly
              disabled
              className="w-full px-4 py-3 bg-gray-100 dark:bg-zinc-900/50 border border-gray-200 dark:border-zinc-700 
                rounded-lg text-gray-500 dark:text-gray-400 text-sm cursor-not-allowed"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-500">
              {isGoogleUser 
                ? 'Your email is managed by Google and cannot be changed here.'
                : t('profile.emailDescription')
              }
            </p>
          </div>

          {/* Success/Error Messages */}
          {success && (
            <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 rounded-lg text-sm">
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              {t('profile.updateSuccess')}
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-lg text-sm">
              <svg
                className="w-5 h-5"
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
              {error}
            </div>
          )}

          {/* Submit Button - Only show for non-Google users */}
          {!isGoogleUser && (
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={loading}
                className="px-6 py-2.5 bg-primary-500 text-white text-sm font-medium rounded-lg
                  hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2
                  disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200
                  dark:focus:ring-offset-zinc-800"
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <svg
                      className="animate-spin h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
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
                    {t('common:actions.loading')}
                  </span>
                ) : (
                  t('profile.saveChanges')
                )}
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

export default ProfileSection;
