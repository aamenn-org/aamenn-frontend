import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faXmark,
  faMinus,
  faPause,
  faPlay,
  faCheck,
  faChevronDown,
  faChevronUp,
} from '@fortawesome/free-solid-svg-icons';

/**
 * Upload Progress Panel — Shows detailed per-file upload progress.
 *
 * Features:
 * - Byte-based overall progress bar
 * - Aggregate speed (MB/s) and ETA display
 * - Expandable per-file list with individual progress, speed, chunk indicators
 * - Per-file pause / resume / cancel controls
 * - Global pause all / resume all / cancel all / retry failed
 */

import React, { useState } from 'react';
import { UploadStatus } from '../../hooks/useUpload';

// ─── Formatting helpers ─────────────────────────────────────
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), units.length - 1);
  return `${(bytes / Math.pow(k, i)).toFixed(i > 1 ? 1 : 0)} ${units[i]}`;
}

function formatSpeed(bps) {
  if (!bps || bps <= 0) return '';
  if (bps > 1024 * 1024) return `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
  if (bps > 1024) return `${(bps / 1024).toFixed(0)} KB/s`;
  return `${Math.round(bps)} B/s`;
}

function formatEta(seconds) {
  if (!seconds || !isFinite(seconds) || seconds <= 0) return '';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

// ─── Status badge colors ────────────────────────────────────
const STATUS_DOT = {
  [UploadStatus.PENDING]: 'bg-gray-400',
  [UploadStatus.HASHING]: 'bg-yellow-500',
  [UploadStatus.ENCRYPTING]: 'bg-purple-500',
  [UploadStatus.UPLOADING]: 'bg-blue-500',
  [UploadStatus.PAUSED]: 'bg-orange-500',
  [UploadStatus.RETRYING]: 'bg-amber-500',
  [UploadStatus.COMPLETED]: 'bg-green-500',
  [UploadStatus.FAILED]: 'bg-red-500',
  [UploadStatus.INTERRUPTED]: 'bg-red-400',
  [UploadStatus.DUPLICATE]: 'bg-gray-400',
};

const STATUS_BAR = {
  [UploadStatus.COMPLETED]: 'bg-green-500',
  [UploadStatus.FAILED]: 'bg-red-500',
  [UploadStatus.INTERRUPTED]: 'bg-red-400',
  [UploadStatus.PAUSED]: 'bg-orange-500',
};

// ─── Per-file row ───────────────────────────────────────────
const UploadFileRow = ({ upload, onPause, onResume, onCancel }) => {
  const barColor = STATUS_BAR[upload.status] || 'bg-blue-500';

  return (
    <div className="flex items-center gap-2 text-sm py-1.5">
      <div className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[upload.status] || 'bg-gray-400'}`} />

      <div className="flex-1 min-w-0">
        <div className="truncate text-gray-700 dark:text-gray-300 text-xs">{upload.name}</div>
        <div className="flex items-center gap-2 text-[10px] text-gray-400 mt-0.5">
          <span>{formatBytes(upload.size || upload.totalBytes || 0)}</span>
          {upload.status === UploadStatus.UPLOADING && upload.speed > 0 && (
            <span>{formatSpeed(upload.speed)}</span>
          )}
          {upload.chunksTotal > 0 && (
            <span>Part {upload.chunksCompleted || 0}/{upload.chunksTotal}</span>
          )}
          {upload.status === UploadStatus.PAUSED && (
            <span className="text-orange-500">Paused</span>
          )}
          {upload.status === UploadStatus.RETRYING && (
            <span className="text-amber-500">Retrying...</span>
          )}
          {upload.status === UploadStatus.DUPLICATE && (
            <span className="text-gray-500">Duplicate</span>
          )}
        </div>
        <div className="w-full bg-gray-100 dark:bg-zinc-700 rounded-full h-1 mt-1">
          <div
            className={`h-1 rounded-full transition-all duration-200 ${barColor}`}
            style={{ width: `${upload.progress || 0}%` }}
          />
        </div>
      </div>

      <div className="flex gap-0.5 shrink-0">
        {upload.status === UploadStatus.UPLOADING && (
          <button
            onClick={onPause}
            className="p-1 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            title="Pause"
          >
            <FontAwesomeIcon icon={faPause} className="w-2.5 h-2.5" />
          </button>
        )}
        {upload.status === UploadStatus.PAUSED && (
          <button
            onClick={onResume}
            className="p-1 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded text-blue-500 hover:text-blue-600"
            title="Resume"
          >
            <FontAwesomeIcon icon={faPlay} className="w-2.5 h-2.5" />
          </button>
        )}
        {![UploadStatus.COMPLETED, UploadStatus.DUPLICATE].includes(upload.status) && (
          <button
            onClick={onCancel}
            className="p-1 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded text-gray-400 hover:text-red-500"
            title="Cancel"
          >
            <FontAwesomeIcon icon={faXmark} className="w-2.5 h-2.5" />
          </button>
        )}
        {upload.status === UploadStatus.COMPLETED && (
          <span className="p-1 text-green-500">
            <FontAwesomeIcon icon={faCheck} className="w-2.5 h-2.5" />
          </span>
        )}
      </div>
    </div>
  );
};

// ─── Main Panel ─────────────────────────────────────────────
const UploadProgressPanel = ({
  stats,
  uploads,
  onCancelAll,
  onRetryFailed,
  onClear,
  onPauseUpload,
  onResumeUpload,
  onCancelUpload,
  onPauseAll,
  onResumeAll,
  isMinimized = false,
  onToggleMinimize,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const {
    total,
    queued = 0,
    hashing = 0,
    active = 0,
    paused = 0,
    completed = 0,
    failed = 0,
    totalBytes = 0,
    totalBytesUploaded = 0,
    aggregateSpeed = 0,
    aggregateEta = Infinity,
  } = stats;

  const hasUploads = total > 0;
  const isComplete = hasUploads && active === 0 && queued === 0 && hashing === 0 && paused === 0;
  const byteProgress = totalBytes > 0 ? Math.min(Math.round((totalBytesUploaded / totalBytes) * 100), 100) : 0;

  if (!hasUploads) return null;

  // Minimized floating pill
  if (isMinimized) {
    return (
      <div
        className="fixed bottom-4 right-4 bg-white dark:bg-zinc-900 rounded-lg shadow-lg border border-gray-200 dark:border-zinc-700 p-3 cursor-pointer hover:shadow-xl transition-shadow z-50"
        onClick={onToggleMinimize}
      >
        <div className="flex items-center gap-3">
          <div className="relative w-10 h-10">
            <svg className="w-10 h-10 transform -rotate-90">
              <circle cx="20" cy="20" r="16" stroke="#e5e7eb" strokeWidth="4" fill="none" />
              <circle
                cx="20" cy="20" r="16"
                stroke={isComplete ? '#10b981' : '#3b82f6'}
                strokeWidth="4" fill="none"
                strokeDasharray={`${byteProgress} 100`}
                strokeLinecap="round"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-xs font-medium dark:text-white">
              {byteProgress}%
            </span>
          </div>
          <div className="text-sm">
            {isComplete ? (
              <span className="text-green-600 font-medium">Complete</span>
            ) : (
              <div>
                <span className="text-gray-600 dark:text-gray-300">
                  {completed}/{total}
                </span>
                {aggregateSpeed > 0 && (
                  <span className="text-gray-400 dark:text-gray-500 ml-2 text-xs">
                    {formatSpeed(aggregateSpeed)}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  const uploadsArray = uploads ? [...uploads.values()] : [];

  return (
    <div className="fixed bottom-4 right-4 w-96 bg-white dark:bg-zinc-900 rounded-lg shadow-xl border border-gray-200 dark:border-zinc-700 overflow-hidden z-50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 dark:bg-zinc-800 border-b border-gray-200 dark:border-zinc-700">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-900 dark:text-white text-sm">
              {isComplete ? 'Upload Complete' : 'Uploading'}
            </span>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {formatBytes(totalBytesUploaded)} / {formatBytes(totalBytes)}
            </span>
          </div>
          {!isComplete && aggregateSpeed > 0 && (
            <div className="flex items-center gap-2 text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
              <span>{formatSpeed(aggregateSpeed)}</span>
              {isFinite(aggregateEta) && aggregateEta > 0 && (
                <span>~{formatEta(aggregateEta)} remaining</span>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-2">
          <button
            onClick={onToggleMinimize}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded transition-colors"
            title="Minimize"
          >
            <FontAwesomeIcon icon={faMinus} className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClear}
            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded transition-colors"
            title="Close"
          >
            <FontAwesomeIcon icon={faXmark} className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Overall progress bar (byte-based) */}
      <div className="px-4 py-2">
        <div className="w-full bg-gray-200 dark:bg-zinc-700 rounded-full h-1.5">
          <div
            className={`h-1.5 rounded-full transition-all duration-300 ${isComplete ? 'bg-green-500' : 'bg-blue-500'}`}
            style={{ width: `${byteProgress}%` }}
          />
        </div>
      </div>

      {/* Expand toggle */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-1 text-xs text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-zinc-800 flex items-center gap-1"
      >
        <FontAwesomeIcon
          icon={isExpanded ? faChevronUp : faChevronDown}
          className="w-2.5 h-2.5"
        />
        {completed} of {total} files
        {paused > 0 && <span className="text-orange-500 ml-1">({paused} paused)</span>}
        {failed > 0 && <span className="text-red-500 ml-1">({failed} failed)</span>}
      </button>

      {/* Per-file list */}
      {isExpanded && uploadsArray.length > 0 && (
        <div className="max-h-64 overflow-y-auto px-4 py-1 border-t border-gray-100 dark:border-zinc-700">
          {uploadsArray.map((upload) => (
            <UploadFileRow
              key={upload.id}
              upload={upload}
              onPause={() => onPauseUpload?.(upload.id)}
              onResume={() => onResumeUpload?.(upload.id)}
              onCancel={() => onCancelUpload?.(upload.id)}
            />
          ))}
        </div>
      )}

      {/* Footer: global controls */}
      <div className="px-4 py-2 border-t border-gray-200 dark:border-zinc-700 bg-gray-50 dark:bg-zinc-800 flex items-center justify-between text-xs">
        <div className="flex gap-2">
          {active > 0 && onPauseAll && (
            <button
              onClick={onPauseAll}
              className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
            >
              Pause All
            </button>
          )}
          {paused > 0 && onResumeAll && (
            <button
              onClick={onResumeAll}
              className="text-blue-600 hover:text-blue-700 transition-colors"
            >
              Resume All
            </button>
          )}
          {!isComplete && (
            <button
              onClick={onCancelAll}
              className="text-gray-500 dark:text-gray-400 hover:text-red-500 transition-colors"
            >
              Cancel All
            </button>
          )}
        </div>
        <div>
          {failed > 0 && (
            <button
              onClick={onRetryFailed}
              className="text-blue-600 hover:text-blue-700 transition-colors"
            >
              Retry {failed} Failed
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default UploadProgressPanel;
