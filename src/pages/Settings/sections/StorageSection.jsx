import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { userService } from '../../../services';
import { useAuth } from '../../../context';

// Format bytes to human readable format
const formatBytes = (bytes, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const StorageSection = () => {
  const { t } = useTranslation('settings');
  const { user, setUser } = useAuth();
  const [storageData, setStorageData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [trashRetentionDays, setTrashRetentionDays] = useState(30);
  const [savingRetention, setSavingRetention] = useState(false);
  const [retentionSuccess, setRetentionSuccess] = useState(false);

  useEffect(() => {
    const fetchStorageUsage = async () => {
      try {
        const data = await userService.getStorageUsage();
        setStorageData(data);
      } catch (err) {
        console.error('Failed to fetch storage usage:', err);
        setError('Failed to load storage information');
      } finally {
        setLoading(false);
      }
    };

    fetchStorageUsage();
  }, []);

  useEffect(() => {
    if (user?.trashRetentionDays) {
      setTrashRetentionDays(user.trashRetentionDays);
    }
  }, [user?.trashRetentionDays]);

  const handleSaveRetention = async () => {
    setSavingRetention(true);
    setError('');
    setRetentionSuccess(false);

    try {
      await userService.updateProfile({ trashRetentionDays });
      setUser((prev) => ({ ...prev, trashRetentionDays }));
      setRetentionSuccess(true);
      setTimeout(() => setRetentionSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to update trash retention:', err);
      setError('Failed to update trash retention setting');
    } finally {
      setSavingRetention(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-zinc-800 rounded-xl shadow-sm border border-gray-200 dark:border-zinc-700 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 dark:bg-zinc-700 rounded w-1/3"></div>
          <div className="h-4 bg-gray-200 dark:bg-zinc-700 rounded w-1/2"></div>
          <div className="h-4 bg-gray-200 dark:bg-zinc-700 rounded-full"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white dark:bg-zinc-800 rounded-xl shadow-sm border border-red-200 dark:border-red-900/50 p-6">
        <p className="text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  const usedBytes = storageData?.usedBytes || 0;
  const totalBytes = storageData?.totalBytes || 1073741824; // 1GB default
  const percentage = Math.min((usedBytes / totalBytes) * 100, 100);
  const fileCount = storageData?.fileCount || 0;

  // Determine color based on usage
  const getProgressColor = () => {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 70) return 'bg-yellow-500';
    return 'bg-primary-500';
  };

  return (
    <div className="space-y-6">
      {/* Storage Usage Card */}
      <div className="bg-white dark:bg-zinc-800 rounded-xl shadow-sm border border-gray-200 dark:border-zinc-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
          {t('storage.title')}
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          {t('storage.description')}
        </p>

        {/* Storage Stats */}
        <div className="mb-6">
          <div className="flex justify-between items-baseline mb-2">
            <span className="text-3xl font-bold text-gray-900 dark:text-white">
              {formatBytes(usedBytes)}
            </span>
            <span className="text-sm text-gray-500 dark:text-gray-400">
              of {formatBytes(totalBytes)}
            </span>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-3 bg-gray-200 dark:bg-zinc-700 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${getProgressColor()}`}
              style={{ width: `${percentage}%` }}
            />
          </div>

          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            {percentage.toFixed(1)}% used
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4">
          <div className="p-4 bg-gray-50 dark:bg-zinc-900 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary-100 dark:bg-primary-900/30 rounded-lg">
                <svg
                  className="w-5 h-5 text-primary-600 dark:text-primary-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {fileCount}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Files
                </p>
              </div>
            </div>
          </div>

          <div className="p-4 bg-gray-50 dark:bg-zinc-900 rounded-lg">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                <svg
                  className="w-5 h-5 text-green-600 dark:text-green-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
                  />
                </svg>
              </div>
              <div>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  {formatBytes(totalBytes - usedBytes)}
                </p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Available
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Warning if near limit */}
        {percentage >= 80 && (
          <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-900/30 rounded-lg">
            <div className="flex gap-3">
              <svg
                className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <div>
                <p className="text-sm font-medium text-yellow-700 dark:text-yellow-300">
                  Storage Almost Full
                </p>
                <p className="text-sm text-yellow-600 dark:text-yellow-400">
                  You're running low on storage. Consider deleting some files to
                  free up space.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Trash Retention Settings */}
      <div className="bg-white dark:bg-zinc-800 rounded-xl shadow-sm border border-gray-200 dark:border-zinc-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
          Trash Settings
        </h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
          Configure how long deleted files are kept in trash before permanent deletion.
        </p>

        <div className="space-y-4">
          <div>
            <label
              htmlFor="trashRetention"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2"
            >
              Trash retention period (days)
            </label>
            <div className="flex items-center gap-4">
              <input
                id="trashRetention"
                type="number"
                min="1"
                max="365"
                value={trashRetentionDays}
                onChange={(e) => setTrashRetentionDays(parseInt(e.target.value, 10))}
                className="w-32 px-4 py-2 bg-gray-50 dark:bg-zinc-900 border border-gray-200 dark:border-zinc-600 text-gray-900 dark:text-white rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <button
                onClick={handleSaveRetention}
                disabled={savingRetention || trashRetentionDays === user?.trashRetentionDays}
                className="px-4 py-2 bg-primary-500 text-white text-sm font-medium rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {savingRetention ? 'Saving...' : 'Save'}
              </button>
            </div>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Files in trash will be automatically deleted after {trashRetentionDays} days.
            </p>
          </div>

          {retentionSuccess && (
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
              Trash retention updated successfully
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StorageSection;
