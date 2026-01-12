import { useState, useEffect, useCallback } from 'react';
import { adminService } from '../../services';
import {
  Search,
  ChevronLeft,
  ChevronRight,
  UserX,
  UserCheck,
  ArrowUpDown,
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
 * Format date
 */
const formatDate = (date) => {
  if (!date) return 'Never';
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const UsersPage = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('DESC');
  const [actionLoading, setActionLoading] = useState(null);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const data = await adminService.getUsers({
        page: pagination.page,
        limit: pagination.limit,
        search: search || undefined,
        sortBy,
        sortOrder,
      });
      setUsers(data.users);
      setPagination((prev) => ({
        ...prev,
        total: data.total,
        totalPages: data.totalPages,
      }));
    } catch (err) {
      setError('Failed to load users');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, search, sortBy, sortOrder]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      setPagination((prev) => ({ ...prev, page: 1 }));
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const handleToggleStatus = async (userId, currentStatus) => {
    try {
      setActionLoading(userId);
      await adminService.updateUserStatus(userId, { isActive: !currentStatus });
      // Refresh users
      fetchUsers();
    } catch (err) {
      console.error('Failed to update user status:', err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder((prev) => (prev === 'ASC' ? 'DESC' : 'ASC'));
    } else {
      setSortBy(field);
      setSortOrder('DESC');
    }
  };

  const SortableHeader = ({ field, children }) => (
    <th
      className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        <ArrowUpDown
          size={14}
          className={sortBy === field ? 'text-blue-500' : ''}
        />
      </div>
    </th>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          Users
        </h2>

        {/* Search */}
        <div className="relative">
          <Search
            size={18}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            placeholder="Search by email or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 pr-4 py-2 w-full sm:w-64 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4">
          {error}
        </div>
      )}

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  User
                </th>
                <SortableHeader field="files">Files</SortableHeader>
                <SortableHeader field="storage">Storage</SortableHeader>
                <SortableHeader field="createdAt">Joined</SortableHeader>
                <SortableHeader field="lastLoginAt">Last Login</SortableHeader>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-6 py-12 text-center text-gray-500 dark:text-gray-400"
                  >
                    No users found
                  </td>
                </tr>
              ) : (
                users.map((user) => (
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
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {formatDate(user.createdAt)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {formatDate(user.lastLoginAt)}
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
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <button
                        onClick={() =>
                          handleToggleStatus(user.id, user.isActive)
                        }
                        disabled={actionLoading === user.id}
                        className={`p-2 transition-colors ${
                          user.isActive
                            ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20'
                            : 'text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20'
                        } disabled:opacity-50`}
                        title={user.isActive ? 'Disable user' : 'Enable user'}
                      >
                        {actionLoading === user.id ? (
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-current"></div>
                        ) : user.isActive ? (
                          <UserX size={18} />
                        ) : (
                          <UserCheck size={18} />
                        )}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
              {Math.min(pagination.page * pagination.limit, pagination.total)}{' '}
              of {pagination.total} users
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  setPagination((prev) => ({ ...prev, page: prev.page - 1 }))
                }
                disabled={pagination.page === 1}
                className="p-2 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                onClick={() =>
                  setPagination((prev) => ({ ...prev, page: prev.page + 1 }))
                }
                disabled={pagination.page === pagination.totalPages}
                className="p-2 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UsersPage;
