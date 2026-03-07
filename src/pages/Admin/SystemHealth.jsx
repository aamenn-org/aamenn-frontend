import { useState, useEffect } from 'react';
import { adminService } from '../../services';
import {
  Activity,
  Database,
  HardDrive,
  Users,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
} from 'lucide-react';

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
 * Status Badge Component
 */
const StatusBadge = ({ status }) => {
  const config = {
    healthy: {
      icon: CheckCircle,
      color: 'text-green-500 bg-green-50 dark:bg-green-900/20',
      label: 'Healthy',
    },
    degraded: {
      icon: AlertTriangle,
      color: 'text-yellow-500 bg-yellow-50 dark:bg-yellow-900/20',
      label: 'Degraded',
    },
    error: {
      icon: XCircle,
      color: 'text-red-500 bg-red-50 dark:bg-red-900/20',
      label: 'Error',
    },
  };

  const { icon: Icon, color, label } = config[status] || config.error;

  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1 rounded-full ${color}`}
    >
      <Icon size={16} />
      <span className="font-medium">{label}</span>
    </div>
  );
};

/**
 * Progress Ring Component
 */
const ProgressRing = ({ value, size = 120, strokeWidth = 12, color }) => {
  // Responsive size adjustments
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640;
  const actualSize = isMobile ? Math.min(size, 100) : size;
  const actualStrokeWidth = isMobile ? Math.max(strokeWidth - 2, 8) : strokeWidth;
  const radius = (actualSize - actualStrokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (value / 100) * circumference;

  const getColor = () => {
    if (value >= 90) return '#ef4444'; // red
    if (value >= 80) return '#f97316'; // orange
    if (value >= 60) return '#eab308'; // yellow
    return '#22c55e'; // green
  };

  return (
    <div className="relative" style={{ width: actualSize, height: actualSize }}>
      <svg width={actualSize} height={actualSize} className="transform -rotate-90">
        {/* Background circle */}
        <circle
          cx={actualSize / 2}
          cy={actualSize / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={actualStrokeWidth}
          className="text-gray-200 dark:text-gray-700"
        />
        {/* Progress circle */}
        <circle
          cx={actualSize / 2}
          cy={actualSize / 2}
          r={radius}
          fill="none"
          stroke={color || getColor()}
          strokeWidth={actualStrokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xl lg:text-2xl font-bold text-gray-900 dark:text-white">
          {value.toFixed(0)}%
        </span>
      </div>
    </div>
  );
};

/**
 * Alert Card Component
 */
const AlertCard = ({ alert }) => {
  const config = {
    error: {
      icon: XCircle,
      bg: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
      text: 'text-red-700 dark:text-red-400',
    },
    warning: {
      icon: AlertTriangle,
      bg: 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800',
      text: 'text-orange-700 dark:text-orange-400',
    },
    info: {
      icon: Activity,
      bg: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
      text: 'text-blue-700 dark:text-blue-400',
    },
  };

  const { icon: Icon, bg, text } = config[alert.type] || config.info;

  return (
    <div className={`p-3 lg:p-4 border ${bg} rounded`}>
      <div className={`flex items-start gap-2 lg:gap-3 ${text}`}>
        <Icon size={18} className="flex-shrink-0 mt-0.5 lg:w-5 lg:h-5" />
        <div>
          <p className="text-sm lg:text-base font-medium">{alert.message}</p>
          <p className="text-xs lg:text-sm opacity-70 mt-1">
            {new Date(alert.timestamp).toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
};

const SystemHealth = () => {
  const [health, setHealth] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    try {
      const [healthData, alertsData] = await Promise.all([
        adminService.getSystemHealth(),
        adminService.getAlerts(),
      ]);
      setHealth(healthData);
      setAlerts(alertsData);
      setError(null);
    } catch (err) {
      setError('Failed to load system health');
      console.error(err);
    }
  };

  useEffect(() => {
    const loadInitial = async () => {
      setLoading(true);
      await fetchData();
      setLoading(false);
    };
    loadInitial();

    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h2 className="text-xl lg:text-2xl font-bold text-gray-900 dark:text-white">
          System Health
        </h2>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded transition-colors disabled:opacity-50 text-sm lg:text-base"
        >
          <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6">
        {/* Storage */}
        <div className="bg-white dark:bg-gray-800 p-4 lg:p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 lg:gap-3">
              <div className="p-2 lg:p-3 bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400">
                <HardDrive size={20} className="lg:w-6 lg:h-6" />
              </div>
              <div>
                <h3 className="text-sm lg:text-base font-semibold text-gray-900 dark:text-white">
                  Storage
                </h3>
                <p className="text-xs lg:text-sm text-gray-500 dark:text-gray-400">
                  {formatBytes(health?.storageUsed || 0)} /{' '}
                  {formatBytes(health?.storageLimit || 0)}
                </p>
              </div>
            </div>
          </div>
          <div className="flex justify-center">
            <ProgressRing value={health?.storageUsagePercent || 0} size={100} strokeWidth={10} />
          </div>
          {health?.storageWarning && (
            <div className="mt-4 p-2 bg-orange-50 dark:bg-orange-900/20 text-center rounded">
              <span className="text-orange-600 dark:text-orange-400 text-xs lg:text-sm font-medium">
                ⚠️ Storage above 80%
              </span>
            </div>
          )}
        </div>

        {/* Database */}
        <div className="bg-white dark:bg-gray-800 p-4 lg:p-6 shadow-sm">
          <div className="flex items-center gap-2 lg:gap-3 mb-6">
            <div className="p-2 lg:p-3 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">
              <Database size={20} className="lg:w-6 lg:h-6" />
            </div>
            <div>
              <h3 className="text-sm lg:text-base font-semibold text-gray-900 dark:text-white">
                Database
              </h3>
              <p className="text-xs lg:text-sm text-gray-500 dark:text-gray-400">
                PostgreSQL
              </p>
            </div>
          </div>
          <div className="flex justify-center">
            <StatusBadge status={health?.databaseStatus || 'error'} />
          </div>
        </div>

        {/* Active Users */}
        <div className="bg-white dark:bg-gray-800 p-4 lg:p-6 shadow-sm">
          <div className="flex items-center gap-2 lg:gap-3 mb-6">
            <div className="p-2 lg:p-3 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400">
              <Users size={20} className="lg:w-6 lg:h-6" />
            </div>
            <div>
              <h3 className="text-sm lg:text-base font-semibold text-gray-900 dark:text-white">
                Active Users
              </h3>
              <p className="text-xs lg:text-sm text-gray-500 dark:text-gray-400">
                Last 24 hours
              </p>
            </div>
          </div>
          <div className="text-center">
            <span className="text-3xl lg:text-4xl font-bold text-gray-900 dark:text-white">
              {health?.activeUsersLast24h || 0}
            </span>
          </div>
        </div>
      </div>

      {/* Alerts Section */}
      <div className="bg-white dark:bg-gray-800 p-4 lg:p-6 shadow-sm">
        <h3 className="text-base lg:text-lg font-semibold text-gray-900 dark:text-white mb-4">
          System Alerts
        </h3>
        {alerts.length === 0 ? (
          <div className="flex items-center gap-2 lg:gap-3 text-green-600 dark:text-green-400 p-3 lg:p-4 bg-green-50 dark:bg-green-900/20 rounded">
            <CheckCircle size={18} className="flex-shrink-0 lg:w-5 lg:h-5" />
            <span className="text-sm lg:text-base">All systems operational - no active alerts</span>
          </div>
        ) : (
          <div className="space-y-3">
            {alerts.map((alert, index) => (
              <AlertCard key={index} alert={alert} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SystemHealth;
