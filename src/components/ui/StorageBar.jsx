import { useState, useEffect, useRef } from 'react';
import { fileService } from '../../services';

// Debounce delay to prevent excessive API calls during bulk uploads
const STORAGE_REFRESH_DEBOUNCE_MS = 2000;

const StorageBar = ({ refreshTrigger, inline = false }) => {
  const [storageData, setStorageData] = useState(null);
  const [loading, setLoading] = useState(true);
  const debounceTimerRef = useRef(null);
  const lastFetchRef = useRef(0);

  useEffect(() => {
    const fetchStorageUsage = async () => {
      try {
        const data = await fileService.getStorageUsage();
        setStorageData(data);
        lastFetchRef.current = Date.now();
      } catch (error) {
        console.error('Failed to fetch storage usage:', error);
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
          <svg
            className="w-4 h-4 text-gray-500 dark:text-gray-400"
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
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Storage
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
          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
          Storage limit reached. Delete files to upload more.
        </p>
      )}
    </div>
  );
};

export default StorageBar;
