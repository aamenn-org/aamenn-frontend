import { useState, useEffect, useRef } from 'react';
import { userService } from '../../services';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faDatabase, 
  faTriangleExclamation 
} from '@fortawesome/free-solid-svg-icons';

// Debounce delay to prevent excessive API calls during bulk uploads
const STORAGE_REFRESH_DEBOUNCE_MS = 2000;

const StorageBar = ({ refreshTrigger, inline = false }) => {
  const { t } = useTranslation('photos');
  const [storageData, setStorageData] = useState(null);
  const [loading, setLoading] = useState(true);
  const debounceTimerRef = useRef(null);
  const lastFetchRef = useRef(0);

  useEffect(() => {
    const fetchStorageUsage = async () => {
      try {
        const data = await userService.getStorageUsage();
        setStorageData(data);
        lastFetchRef.current = Date.now();
      } catch (error) {
        // Don't log 401 errors - they're expected after logout/deletion
        if (error.response?.status !== 401) {
          console.error('Failed to fetch storage usage:', error);
        }
      } finally {
        setLoading(false);
      }
    };

    // Initial load - fetch immediately
    if (lastFetchRef.current === 0) {
      fetchStorageUsage();
      return;
    }

    // Debounce subsequent refreshes during bulk uploads
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      fetchStorageUsage();
    }, STORAGE_REFRESH_DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [refreshTrigger]);

  if (loading || !storageData) {
    return inline ? null : (
      <div className="bg-white dark:bg-zinc-800 rounded-lg p-4 shadow-sm animate-pulse">
        <div className="h-4 bg-gray-200 dark:bg-zinc-700 rounded w-1/3 mb-3"></div>
        <div className="h-2 bg-gray-200 dark:bg-zinc-700 rounded w-full"></div>
      </div>
    );
  }

  const { usedGb, limitGb, percentUsed, exceeded } = storageData;

  // Determine color based on usage
  const getBarColor = () => {
    if (exceeded || percentUsed >= 90) return 'bg-red-500';
    if (percentUsed >= 70) return 'bg-amber-500';
    return 'bg-blue-500';
  };

  const getTextColor = () => {
    if (exceeded || percentUsed >= 90) return 'text-red-500';
    if (percentUsed >= 70) return 'text-amber-500';
    return 'text-gray-500 dark:text-gray-400';
  };

  // Inline compact version
  if (inline) {
    return (
      <div className="flex items-center gap-3">
        <div className="w-32 bg-gray-200 dark:bg-zinc-700 rounded-full h-1.5 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${getBarColor()}`}
            style={{ width: `${Math.min(percentUsed, 100)}%` }}
          />
        </div>
        <span
          className={`text-xs font-medium whitespace-nowrap ${getTextColor()}`}
        >
          {usedGb.toFixed(2)} / {limitGb} GB
        </span>
      </div>
    );
  }

  // Full version
  return (
    <div className="bg-white dark:bg-zinc-800 rounded-lg p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <FontAwesomeIcon icon={faDatabase} className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            {t('storage.title', 'Storage')}
          </span>
        </div>
        <span className={`text-sm font-medium ${getTextColor()}`}>
          {usedGb.toFixed(2)} GB / {limitGb} GB
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-gray-200 dark:bg-zinc-700 rounded-full h-2 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${getBarColor()}`}
          style={{ width: `${Math.min(percentUsed, 100)}%` }}
        />
      </div>

      {/* Warning message if exceeded */}
      {exceeded && (
        <p className="text-xs text-red-500 mt-2 flex items-center gap-1">
          <FontAwesomeIcon icon={faTriangleExclamation} className="w-3 h-3" />
          {t('storage.limitReached', 'Storage limit reached. Delete files to upload more.')}
        </p>
      )}
    </div>
  );
};

export default StorageBar;
