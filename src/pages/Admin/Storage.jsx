import { useState, useEffect } from 'react';
import { adminService } from '../../services';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faHardDrive,
  faImage,
  faChartLine,
  faCalendar,
  faFile,
  faVideo,
  faDownload,
} from '@fortawesome/free-solid-svg-icons';

/**
 * Format bytes to human readable
 */
const formatBytes = (bytes) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

/**
 * Progress Bar Component
 */
const ProgressBar = ({ value, max, color = 'blue' }) => {
  const percent = Math.min((value / max) * 100, 100);
  const colorClasses = {
    blue: 'bg-blue-500',
    green: 'bg-green-500',
    orange: 'bg-orange-500',
    red: 'bg-red-500',
  };

  return (
    <div className="w-full bg-gray-200 dark:bg-gray-700 h-3">
      <div
        className={`h-3 transition-all ${colorClasses[color]}`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
};

/**
 * Stat Card Component
 */
const StatCard = ({ title, value, subtitle, icon: Icon, color = 'blue' }) => {
  const colorClasses = {
    blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
    green:
      'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400',
    purple:
      'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
    orange:
      'bg-orange-50 dark:bg-orange-900/20 text-orange-600 dark:text-orange-400',
  };

  return (
    <div className="bg-white dark:bg-gray-800 p-4 lg:p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className={`p-2 lg:p-3 ${colorClasses[color]}`}>
          <Icon size={20} className="lg:w-6 lg:h-6" />
        </div>
      </div>
      <div className="text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white mb-1">
        {value}
      </div>
      <div className="text-xs lg:text-sm text-gray-500 dark:text-gray-400">{title}</div>
      {subtitle && (
        <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
          {subtitle}
        </div>
      )}
    </div>
  );
};

/**
 * Get icon for mime type
 */
const getMimeIcon = (mimeType) => {
  if (mimeType?.startsWith('video/')) return faVideo;
  return faFile;
};

const Storage = () => {
  const [stats, setStats] = useState(null);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [storageData, healthData] = await Promise.all([
          adminService.getStorageStats(),
          adminService.getSystemHealth(),
        ]);
        setStats(storageData);
        setHealth(healthData);
      } catch (err) {
        setError('Failed to load storage statistics');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4">
        {error}
      </div>
    );
  }

  // Get storage limit from health endpoint (defaults to 10GB from backend)
  const STORAGE_LIMIT = health?.storageLimit || 10 * 1024 * 1024 * 1024;
  const storagePercent = (stats?.totalStorageBytes / STORAGE_LIMIT) * 100;

  return (
    <div className="space-y-6">
      {/* Header */}
      <h2 className="text-xl lg:text-2xl font-bold text-gray-900 dark:text-white">
        Storage & Files
      </h2>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
        <StatCard
          title="Total Files"
          value={stats?.totalFiles?.toLocaleString() || 0}
          subtitle={`+${stats?.uploadsToday || 0} today`}
          icon={faImage}
          color="blue"
        />
        <StatCard
          title="Total Storage"
          value={formatBytes(stats?.totalStorageBytes || 0)}
          subtitle={`of ${formatBytes(STORAGE_LIMIT)}`}
          icon={faHardDrive}
          color="purple"
        />
        <StatCard
          title="Avg File Size"
          value={formatBytes(stats?.avgFileSize || 0)}
          icon={faFile}
          color="green"
        />
        <StatCard
          title="Daily Growth"
          value={formatBytes(stats?.storageGrowthDaily || 0)}
          subtitle="per day (30d avg)"
          icon={faChartLine}
          color="orange"
        />
      </div>

      {/* Storage Usage */}
      <div className="bg-white dark:bg-gray-800 p-4 lg:p-6 shadow-sm">
        <h3 className="text-base lg:text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Storage Usage
        </h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs lg:text-sm">
            <span className="text-gray-600 dark:text-gray-400">
              {formatBytes(stats?.totalStorageBytes || 0)} used
            </span>
            <span className="text-gray-600 dark:text-gray-400">
              {storagePercent.toFixed(1)}% of {formatBytes(STORAGE_LIMIT)}
            </span>
          </div>
          <ProgressBar
            value={stats?.totalStorageBytes || 0}
            max={STORAGE_LIMIT}
            color={
              storagePercent > 80
                ? 'red'
                : storagePercent > 60
                ? 'orange'
                : 'blue'
            }
          />
        </div>
      </div>

      {/* Upload Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
        {/* Upload Stats */}
        <div className="bg-white dark:bg-gray-800 p-4 lg:p-6 shadow-sm">
          <h3 className="text-base lg:text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Upload Activity
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-2 lg:gap-3">
                <FontAwesomeIcon icon={faCalendar} className="w-4 h-4 text-gray-400 lg:w-[18px] lg:h-[18px]" />
                <span className="text-sm lg:text-base text-gray-600 dark:text-gray-400">Today</span>
              </div>
              <span className="text-sm lg:text-base font-semibold text-gray-900 dark:text-white">
                {stats?.uploadsToday?.toLocaleString() || 0} uploads
              </span>
            </div>
            <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-2 lg:gap-3">
                <FontAwesomeIcon icon={faCalendar} className="w-4 h-4 text-gray-400 lg:w-[18px] lg:h-[18px]" />
                <span className="text-sm lg:text-base text-gray-600 dark:text-gray-400">
                  This Week
                </span>
              </div>
              <span className="text-sm lg:text-base font-semibold text-gray-900 dark:text-white">
                {stats?.uploadsThisWeek?.toLocaleString() || 0} uploads
              </span>
            </div>
            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-2 lg:gap-3">
                <FontAwesomeIcon icon={faCalendar} className="w-4 h-4 text-gray-400 lg:w-[18px] lg:h-[18px]" />
                <span className="text-sm lg:text-base text-gray-600 dark:text-gray-400">
                  This Month
                </span>
              </div>
              <span className="text-sm lg:text-base font-semibold text-gray-900 dark:text-white">
                {stats?.uploadsThisMonth?.toLocaleString() || 0} uploads
              </span>
            </div>
          </div>
        </div>

        {/* File Views Stats */}
        <div className="bg-white dark:bg-gray-800 p-4 lg:p-6 shadow-sm">
          <h3 className="text-base lg:text-lg font-semibold text-gray-900 dark:text-white mb-4">
            File View Statistics
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between py-3 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-2 lg:gap-3">
                <FontAwesomeIcon icon={faDownload} className="w-4 h-4 text-blue-500 lg:w-[18px] lg:h-[18px]" />
                <span className="text-sm lg:text-base text-gray-600 dark:text-gray-400">Today</span>
              </div>
              <div className="text-right">
                <span className="text-sm lg:text-base font-semibold text-gray-900 dark:text-white">
                  {formatBytes(stats?.bandwidthToday || 0)}
                </span>
                <span className="text-xs text-gray-400 ml-2">
                  ({stats?.downloadsToday?.toLocaleString() || 0} views)
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-2 lg:gap-3">
                <FontAwesomeIcon icon={faDownload} className="w-4 h-4 text-purple-500 lg:w-[18px] lg:h-[18px]" />
                <span className="text-sm lg:text-base text-gray-600 dark:text-gray-400">
                  This Month
                </span>
              </div>
              <div className="text-right">
                <span className="text-sm lg:text-base font-semibold text-gray-900 dark:text-white">
                  {formatBytes(stats?.bandwidthMonth || 0)}
                </span>
                <span className="text-xs text-gray-400 ml-2">
                  ({stats?.downloadsMonth?.toLocaleString() || 0} views)
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Files by Type */}
      <div className="bg-white dark:bg-gray-800 p-4 lg:p-6 shadow-sm">
        <h3 className="text-base lg:text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Files by Type
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-4">
          {stats?.filesByMimeType?.slice(0, 6).map((item) => {
            const Icon = getMimeIcon(item.mimeType);
            return (
              <div
                key={item.mimeType}
                className="flex items-center justify-between py-2 px-3 bg-gray-50 dark:bg-gray-700/50 rounded"
              >
                <div className="flex items-center gap-2 lg:gap-3 min-w-0">
                  <Icon size={16} className="text-gray-400 flex-shrink-0 lg:w-[18px] lg:h-[18px]" />
                  <span className="text-gray-600 dark:text-gray-400 text-xs lg:text-sm truncate">
                    {item.mimeType || 'unknown'}
                  </span>
                </div>
                <div className="text-right flex-shrink-0 ml-2">
                  <div className="font-semibold text-gray-900 dark:text-white text-xs lg:text-sm">
                    {item.count.toLocaleString()}
                  </div>
                  <div className="text-xs text-gray-400">
                    {formatBytes(item.totalBytes)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Storage;
