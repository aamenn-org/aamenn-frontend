import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faXmark, 
  faMinus, 
  faPlus 
} from '@fortawesome/free-solid-svg-icons';

/**
 * Upload Progress Panel - Shows detailed upload progress
 *
 * Features:
 * - Overall progress bar
 * - Per-file progress with status
 * - Cancel controls
 * - Retry failed uploads
 */

import React from 'react';
import { useTranslation } from 'react-i18next';

// Upload states - matches useUpload hook
const UploadStatus = {
  PENDING: 'pending',
  HASHING: 'hashing',
  ENCRYPTING: 'encrypting',
  UPLOADING: 'uploading',
  RETRYING: 'retrying',
  INTERRUPTED: 'interrupted',
  COMPLETED: 'completed',
  FAILED: 'failed',
  DUPLICATE: 'duplicate',
};

const UploadProgressPanel = ({
  stats,
  onCancelAll,
  onRetryFailed,
  onClear,
  isMinimized = false,
  onToggleMinimize,
}) => {
  const { t } = useTranslation('photos');
  const {
    total,
    queued,
    hashing = 0,
    active,
    retrying = 0,
    interrupted = 0,
    duplicate = 0,
    completed,
    failed,
    overallProgress,
    activeTasks,
  } = stats;

  const hasUploads = total > 0;
  const isComplete =
    hasUploads &&
    active === 0 &&
    queued === 0 &&
    interrupted === 0 &&
    hashing === 0;

  // Calculate progress based on completed files, not bytes
  const filesProgress = total > 0 ? Math.round((completed / total) * 100) : 0;

  if (!hasUploads) return null;

  // Minimized view
  if (isMinimized) {
    return (
      <div
        className="fixed bottom-4 right-4 bg-white rounded-lg shadow-lg border border-gray-200 p-3 cursor-pointer hover:shadow-xl transition-shadow z-50"
        onClick={onToggleMinimize}
      >
        <div className="flex items-center gap-3">
          {/* Progress circle */}
          <div className="relative w-10 h-10">
            <svg className="w-10 h-10 transform -rotate-90">
              <circle
                cx="20"
                cy="20"
                r="16"
                stroke="#e5e7eb"
                strokeWidth="4"
                fill="none"
              />
              <circle
                cx="20"
                cy="20"
                r="16"
                stroke={isComplete ? '#10b981' : '#3b82f6'}
                strokeWidth="4"
                fill="none"
                strokeDasharray={`${filesProgress} 100`}
                strokeLinecap="round"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-xs font-medium">
              {filesProgress}%
            </span>
          </div>

          {/* Status text */}
          <div className="text-sm">
            {isComplete ? (
              <span className="text-green-600 font-medium">{t('upload.complete', 'Complete')}</span>
            ) : (
              <span className="text-gray-600">
                {t('upload.uploadingFiles', 'Uploading {{count}} files...', { count: active + queued })}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 w-80 bg-white dark:bg-zinc-900 rounded-lg shadow-xl border border-gray-200 dark:border-zinc-700 overflow-hidden z-50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-zinc-800 border-b border-gray-200 dark:border-zinc-700">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900 dark:text-white">
            {isComplete ? 'Upload Complete' : 'Uploading'}
          </span>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {completed}/{total}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onToggleMinimize}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded transition-colors"
            title="Minimize"
          >
            <FontAwesomeIcon icon={faMinus} className="w-4 h-4" />
          </button>
          <button
            onClick={onClear}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded transition-colors"
            title="Close"
          >
            <FontAwesomeIcon icon={faXmark} className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Overall Progress */}
      <div className="px-4 py-3">
        <div className="w-full bg-gray-200 dark:bg-zinc-700 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all duration-300 ${
              isComplete ? 'bg-green-500' : 'bg-blue-500'
            }`}
            style={{ width: `${filesProgress}%` }}
          />
        </div>
      </div>


      {/* Simple Status */}
      <div className="px-4 py-2 bg-gray-50 dark:bg-zinc-800 border-t border-gray-200 dark:border-zinc-700">
        <div className="flex items-center justify-between text-sm">
          {!isComplete && (
            <span className="text-gray-600 dark:text-gray-400">
              {completed} of {total} files uploaded
            </span>
          )}
          {isComplete && completed > 0 && (
            <span className="text-green-600 dark:text-green-500">✓ {completed} of {total} uploaded</span>
          )}
          {failed > 0 && (
            <span className="text-red-600 dark:text-red-500">✗ {failed} failed</span>
          )}
        </div>
      </div>

      {/* Controls */}
      {failed > 0 && (
        <div className="px-4 py-3 bg-gray-50 dark:bg-zinc-800 border-t border-gray-200 dark:border-zinc-700 flex items-center justify-center">
          <button
            onClick={onRetryFailed}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors"
          >
            Retry Failed
          </button>
        </div>
      )}
    </div>
  );
};

export default UploadProgressPanel;
