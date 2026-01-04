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
                strokeDasharray={`${overallProgress} 100`}
                strokeLinecap="round"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-xs font-medium">
              {overallProgress}%
            </span>
          </div>

          {/* Status text */}
          <div className="text-sm">
            {isComplete ? (
              <span className="text-green-600 font-medium">Complete</span>
            ) : (
              <span className="text-gray-600">
                Uploading {active + queued} files...
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 w-96 bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden z-50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900">
            {isComplete ? 'Upload Complete' : 'Uploading Files'}
          </span>
          {!isComplete && (
            <span className="text-sm text-gray-500">
              ({completed}/{total})
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onToggleMinimize}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
            title="Minimize"
          >
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
                d="M18 12H6"
              />
            </svg>
          </button>
          {isComplete && (
            <button
              onClick={onClear}
              className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
              title="Close"
            >
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
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Overall Progress */}
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">
            Overall Progress
          </span>
          <span className="text-sm text-gray-500">{overallProgress}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all duration-300 ${
              isComplete ? 'bg-green-500' : 'bg-blue-500'
            }`}
            style={{ width: `${overallProgress}%` }}
          />
        </div>
      </div>

      {/* Active uploads */}
      {activeTasks.length > 0 && (
        <div className="max-h-48 overflow-y-auto">
          {activeTasks.map((task) => (
            <div
              key={task.id}
              className="px-4 py-2 border-b border-gray-50 last:border-0"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-gray-600 truncate flex-1 mr-2">
                  {task.name}
                </span>
                <span
                  className={`text-xs ${
                    task.status === UploadStatus.RETRYING ||
                    task.status === 'retrying'
                      ? 'text-orange-500'
                      : task.status === UploadStatus.INTERRUPTED ||
                        task.status === 'interrupted'
                      ? 'text-red-500'
                      : task.status === UploadStatus.HASHING ||
                        task.status === 'hashing'
                      ? 'text-cyan-500'
                      : task.status === UploadStatus.DUPLICATE ||
                        task.status === 'duplicate'
                      ? 'text-amber-500'
                      : 'text-gray-400'
                  }`}
                >
                  {task.status === UploadStatus.HASHING ||
                  task.status === 'hashing'
                    ? 'Computing hash...'
                    : task.status === UploadStatus.ENCRYPTING ||
                      task.status === 'encrypting'
                    ? 'Encrypting...'
                    : task.status === UploadStatus.UPLOADING ||
                      task.status === 'uploading'
                    ? 'Uploading...'
                    : task.status === UploadStatus.RETRYING ||
                      task.status === 'retrying'
                    ? task.error || 'Retrying...'
                    : task.status === UploadStatus.INTERRUPTED ||
                      task.status === 'interrupted'
                    ? 'Interrupted'
                    : task.status === UploadStatus.DUPLICATE ||
                      task.status === 'duplicate'
                    ? 'Duplicate - Skipped'
                    : task.status}
                </span>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-1">
                <div
                  className={`h-1 rounded-full transition-all duration-200 ${
                    task.status === UploadStatus.HASHING ||
                    task.status === 'hashing'
                      ? 'bg-cyan-400'
                      : task.status === UploadStatus.ENCRYPTING ||
                        task.status === 'encrypting'
                      ? 'bg-purple-400'
                      : task.status === UploadStatus.RETRYING ||
                        task.status === 'retrying'
                      ? 'bg-orange-400'
                      : task.status === UploadStatus.INTERRUPTED ||
                        task.status === 'interrupted'
                      ? 'bg-red-400'
                      : task.status === UploadStatus.DUPLICATE ||
                        task.status === 'duplicate'
                      ? 'bg-amber-400'
                      : 'bg-blue-400'
                  }`}
                  style={{ width: `${task.progress}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Status summary */}
      <div className="px-4 py-2 bg-gray-50 flex items-center justify-between text-xs text-gray-500">
        <div className="flex items-center gap-3">
          {queued > 0 && <span>Queued: {queued}</span>}
          {hashing > 0 && (
            <span className="text-cyan-600">Hashing: {hashing}</span>
          )}
          {active > 0 && <span>Active: {active}</span>}
          {retrying > 0 && (
            <span className="text-orange-600">Retrying: {retrying}</span>
          )}
          {interrupted > 0 && (
            <span className="text-red-600">Interrupted: {interrupted}</span>
          )}
          {duplicate > 0 && (
            <span className="text-amber-600">Skipped: {duplicate}</span>
          )}
          {completed > 0 && (
            <span className="text-green-600">Done: {completed}</span>
          )}
          {failed > 0 && <span className="text-red-600">Failed: {failed}</span>}
        </div>
      </div>

      {/* Controls */}
      <div className="px-4 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {!isComplete && (
            <button
              onClick={onCancelAll}
              className="px-3 py-1.5 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded"
            >
              Cancel All
            </button>
          )}
        </div>

        {(failed > 0 || interrupted > 0) && (
          <button
            onClick={onClear}
            className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-700 hover:bg-gray-100 rounded"
          >
            Clear {interrupted > 0 ? 'Interrupted' : 'Failed'}
          </button>
        )}
      </div>
    </div>
  );
};

export default UploadProgressPanel;
