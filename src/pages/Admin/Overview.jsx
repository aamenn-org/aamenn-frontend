import { useState, useEffect } from 'react';
import { adminService } from '../../services';
import {
  Users,
  Image,
  HardDrive,
  TrendingUp,
  UserPlus,
  Clock,
  Download,
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
    cyan: 'bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600 dark:text-cyan-400',
  };

  return (
    <div className="bg-white dark:bg-gray-800 p-3 lg:p-6 shadow-sm">
      <div className="flex items-center justify-between mb-2 lg:mb-4">
        <div className={`p-1.5 lg:p-3 ${colorClasses[color]}`}>
          <Icon size={16} className="lg:w-6 lg:h-6" />
        </div>
      </div>
      <div className="text-xl lg:text-3xl font-bold text-gray-900 dark:text-white mb-1">
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
 * Top Users Table
 */
const TopUsersTable = ({ users }) => {
  return (
    <div className="bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
      <div className="px-4 lg:px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <h3 className="text-base lg:text-lg font-semibold text-gray-900 dark:text-white">
          Top Users by Storage
        </h3>
      </div>
      
      {/* Desktop Table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-700/50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                User
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Files
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Storage
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {users.map((user) => (
              <tr
                key={user.id}
                className="hover:bg-gray-50 dark:hover:bg-gray-700/30"
              >
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="text-sm font-medium text-gray-900 dark:text-white">
                    {user.displayName || user.email}
                  </div>
                  {user.displayName && (
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      {user.email}
                    </div>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                  {user.fileCount.toLocaleString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                  {formatBytes(user.storageBytes)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={`px-2 py-1 text-xs rounded-full ${
                      user.isActive
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                    }`}
                  >
                    {user.isActive ? 'Active' : 'Disabled'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {/* Mobile Card Layout */}
      <div className="md:hidden divide-y divide-gray-200 dark:divide-gray-700">
        {users.map((user, index) => (
          <div key={user.id} className="p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-gray-400 dark:text-gray-500">#{index + 1}</span>
                  <div className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                    {user.displayName || user.email}
                  </div>
                </div>
                {user.displayName && (
                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate ml-6">
                    {user.email}
                  </div>
                )}
              </div>
              <span
                className={`ml-2 px-2 py-1 text-xs rounded-full whitespace-nowrap ${
                  user.isActive
                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                }`}
              >
                {user.isActive ? 'Active' : 'Disabled'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded p-2">
                <div className="text-xs text-gray-500 dark:text-gray-400">Files</div>
                <div className="text-sm font-semibold text-gray-900 dark:text-white">
                  {user.fileCount.toLocaleString()}
                </div>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded p-2">
                <div className="text-xs text-gray-500 dark:text-gray-400">Storage</div>
                <div className="text-sm font-semibold text-gray-900 dark:text-white">
                  {formatBytes(user.storageBytes)}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const Overview = () => {
  const [stats, setStats] = useState(null);
  const [topUsers, setTopUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [dashboardStats, usersData] = await Promise.all([
          adminService.getDashboardStats(),
          adminService.getTopUsersByStorage(5),
        ]);
        setStats(dashboardStats);
        // Defensive: ensure we always set an array to avoid `map` errors in the table
        setTopUsers(Array.isArray(usersData) ? usersData : usersData?.users || []);
      } catch (err) {
        setError('Failed to load dashboard data');
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

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 lg:gap-6">
        <StatCard
          title="Total Users"
          value={stats?.totalUsers?.toLocaleString() || 0}
          subtitle={`+${stats?.newUsersToday || 0} today`}
          icon={Users}
          color="blue"
        />
        <StatCard
          title="Active Users (24h)"
          value={stats?.activeUsers24h?.toLocaleString() || 0}
          subtitle={`${stats?.activeUsers7d || 0} in last 7 days`}
          icon={Clock}
          color="green"
        />
        <StatCard
          title="Total Photos"
          value={stats?.totalFiles?.toLocaleString() || 0}
          subtitle={`+${stats?.uploadsToday || 0} today`}
          icon={Image}
          color="purple"
        />
        <StatCard
          title="Storage Used"
          value={formatBytes(stats?.totalStorageBytes || 0)}
          subtitle={`Avg file: ${formatBytes(stats?.avgFileSize || 0)}`}
          icon={HardDrive}
          color="orange"
        />
        <StatCard
          title="New Users (Week)"
          value={stats?.newUsersWeek?.toLocaleString() || 0}
          subtitle={`${stats?.uploadsWeek || 0} uploads this week`}
          icon={UserPlus}
          color="cyan"
        />
      </div>

      {/* Bandwidth Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 lg:gap-6">
        <div className="bg-white dark:bg-gray-800 p-3 lg:p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-3 lg:mb-4">
            <div className="p-1.5 lg:p-3 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400">
              <Download size={16} className="lg:w-6 lg:h-6" />
            </div>
            <div>
              <h3 className="text-sm lg:text-lg font-semibold text-gray-900 dark:text-white">
                File Views Today
              </h3>
              <p className="text-xs lg:text-sm text-gray-500 dark:text-gray-400">
                {stats?.downloadsToday?.toLocaleString() || 0} file requests
              </p>
            </div>
          </div>
          <div className="text-xl lg:text-3xl font-bold text-gray-900 dark:text-white">
            {formatBytes(stats?.bandwidthToday || 0)}
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 p-3 lg:p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-3 lg:mb-4">
            <div className="p-1.5 lg:p-3 bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400">
              <Download size={16} className="lg:w-6 lg:h-6" />
            </div>
            <div>
              <h3 className="text-sm lg:text-lg font-semibold text-gray-900 dark:text-white">
                File Views This Month
              </h3>
              <p className="text-xs lg:text-sm text-gray-500 dark:text-gray-400">
                {stats?.downloadsMonth?.toLocaleString() || 0} file requests
              </p>
            </div>
          </div>
          <div className="text-xl lg:text-3xl font-bold text-gray-900 dark:text-white">
            {formatBytes(stats?.bandwidthMonth || 0)}
          </div>
        </div>
      </div>

      {/* Top Users */}
      <TopUsersTable users={topUsers} />
    </div>
  );
};

export default Overview;
