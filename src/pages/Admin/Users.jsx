import { useState, useEffect, useCallback } from 'react';
import { adminService } from '../../services';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faSearch,
  faChevronLeft,
  faChevronRight,
  faUserSlash,
  faCheck,
  faUpDown,
  faTrash,
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
    limit: 10,
    total: 0,
    totalPages: 0,
  });
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState('DESC');
  const [actionLoading, setActionLoading] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { id, email, fileCount, storageBytes }
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

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

  const handleDeleteUser = async () => {
    if (!deleteConfirm) return;
    try {
      setDeleteLoading(true);
      await adminService.deleteUser(deleteConfirm.id);
      setSuccessMessage(`User ${deleteConfirm.email} and all their data have been permanently deleted.`);
      setDeleteConfirm(null);
      fetchUsers();
      setTimeout(() => setSuccessMessage(''), 4000);
    } catch (err) {
      console.error('Failed to delete user:', err);
    } finally {
      setDeleteLoading(false);
    }
  };

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

  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3">
        <h2 className="text-xl lg:text-2xl font-bold text-gray-900 dark:text-white">
          Users
        </h2>

        {/* Search */}
        <div className="relative">
          <FontAwesomeIcon
            icon={faSearch}
            className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            placeholder="Search by email or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 pr-3 py-2 w-full sm:w-64 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      {/* Success */}
      {successMessage && (
        <div className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 p-2.5 lg:p-4 rounded text-xs lg:text-sm">
          {successMessage}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-2.5 lg:p-4 rounded text-xs lg:text-sm">
          {error}
        </div>
      )}

      {/* Desktop Table - Hidden on Mobile */}
      <div className="hidden lg:block bg-white dark:bg-gray-800 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => handleSort('files')}>
                  <div className="flex items-center gap-1">
                    Files
                    <FontAwesomeIcon icon={faUpDown} className={`w-3 h-3 ${sortBy === 'files' ? 'text-blue-500' : ''}`} />
                  </div>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => handleSort('storage')}>
                  <div className="flex items-center gap-1">
                    Storage
                    <FontAwesomeIcon icon={faUpDown} className={`w-3 h-3 ${sortBy === 'storage' ? 'text-blue-500' : ''}`} />
                  </div>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => handleSort('createdAt')}>
                  <div className="flex items-center gap-1">
                    Joined
                    <FontAwesomeIcon icon={faUpDown} className={`w-3 h-3 ${sortBy === 'createdAt' ? 'text-blue-500' : ''}`} />
                  </div>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700" onClick={() => handleSort('lastLoginAt')}>
                  <div className="flex items-center gap-1">
                    Last Login
                    <FontAwesomeIcon icon={faUpDown} className={`w-3 h-3 ${sortBy === 'lastLoginAt' ? 'text-blue-500' : ''}`} />
                  </div>
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Delete
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
                        onClick={() => handleToggleStatus(user.id, user.isActive)}
                        disabled={actionLoading === user.id}
                        className={`p-2 transition-colors rounded ${
                          user.isActive
                            ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20'
                            : 'text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20'
                        } disabled:opacity-50`}
                        title={user.isActive ? 'Disable user' : 'Enable user'}
                      >
                        {actionLoading === user.id ? (
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-current"></div>
                        ) : user.isActive ? (
                          <FontAwesomeIcon icon={faUserSlash} className="w-[18px] h-[18px]" />
                        ) : (
                          <FontAwesomeIcon icon={faCheck} className="w-[18px] h-[18px]" />
                        )}
                      </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <button
                        onClick={() => setDeleteConfirm({
                          id: user.id,
                          email: user.email,
                          fileCount: user.fileCount,
                          storageBytes: user.storageBytes,
                        })}
                        className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors rounded"
                        title="Delete user permanently"
                      >
                        <FontAwesomeIcon icon={faTrash} className="w-[18px] h-[18px]" />
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
                onClick={() => setPagination((prev) => ({ ...prev, page: prev.page - 1 }))}
                disabled={pagination.page === 1}
                className="p-2 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FontAwesomeIcon icon={faChevronLeft} className="w-[18px] h-[18px]" />
              </button>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                onClick={() => setPagination((prev) => ({ ...prev, page: prev.page + 1 }))}
                disabled={pagination.page === pagination.totalPages}
                className="p-2 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FontAwesomeIcon icon={faChevronRight} className="w-[18px] h-[18px]" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Mobile Card Layout */}
      <div className="lg:hidden space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
          </div>
        ) : users.length === 0 ? (
          <div className="bg-white dark:bg-gray-800 p-8 text-center text-gray-500 dark:text-gray-400 rounded-lg">
            No users found
          </div>
        ) : (
          users.map((user) => (
            <div
              key={user.id}
              className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm"
            >
              {/* User Info */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                    {user.displayName || user.email}
                  </div>
                  {user.displayName && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
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

              {/* Stats Grid */}
              <div className="grid grid-cols-2 gap-3 mb-3">
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
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded p-2">
                  <div className="text-xs text-gray-500 dark:text-gray-400">Joined</div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-white">
                    {formatDate(user.createdAt)}
                  </div>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded p-2">
                  <div className="text-xs text-gray-500 dark:text-gray-400">Last Login</div>
                  <div className="text-sm font-semibold text-gray-900 dark:text-white">
                    {formatDate(user.lastLoginAt)}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-3 border-t border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => handleToggleStatus(user.id, user.isActive)}
                  disabled={actionLoading === user.id}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded transition-colors ${
                    user.isActive
                      ? 'bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30'
                      : 'bg-green-50 text-green-600 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/30'
                  } disabled:opacity-50`}
                >
                  {actionLoading === user.id ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
                  ) : user.isActive ? (
                    <>
                      <FontAwesomeIcon icon={faUserSlash} className="w-4 h-4" />
                      <span>Disable</span>
                    </>
                  ) : (
                    <>
                      <FontAwesomeIcon icon={faCheck} className="w-4 h-4" />
                      <span>Enable</span>
                    </>
                  )}
                </button>
                <button
                  onClick={() => setDeleteConfirm({
                    id: user.id,
                    email: user.email,
                    fileCount: user.fileCount,
                    storageBytes: user.storageBytes,
                  })}
                  className="flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium bg-red-50 text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30 rounded transition-colors"
                >
                  <FontAwesomeIcon icon={faTrash} className="w-4 h-4" />
                  <span>Delete</span>
                </button>
              </div>
            </div>
          ))
        )}

        {/* Mobile Pagination */}
        {pagination.totalPages > 1 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm">
            <div className="text-xs text-center text-gray-500 dark:text-gray-400 mb-3">
              Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
              {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} users
            </div>
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => setPagination((prev) => ({ ...prev, page: prev.page - 1 }))}
                disabled={pagination.page === 1}
                className="p-2 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FontAwesomeIcon icon={faChevronLeft} className="w-[18px] h-[18px]" />
              </button>
              <span className="text-sm text-gray-600 dark:text-gray-400 min-w-[100px] text-center">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                onClick={() => setPagination((prev) => ({ ...prev, page: prev.page + 1 }))}
                disabled={pagination.page === pagination.totalPages}
                className="p-2 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <FontAwesomeIcon icon={faChevronRight} className="w-[18px] h-[18px]" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-4 lg:p-6 max-w-md w-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                <FontAwesomeIcon icon={faTrash} className="w-5 h-5 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="text-base lg:text-lg font-semibold text-gray-900 dark:text-white">Delete User</h3>
            </div>
            <p className="text-xs lg:text-sm text-gray-600 dark:text-gray-400 mb-2">
              Are you sure you want to permanently delete:
            </p>
            <div className="bg-gray-50 dark:bg-gray-700 rounded p-3 mb-4 text-sm">
              <p className="font-medium text-gray-900 dark:text-white">{deleteConfirm.email}</p>
              <p className="text-gray-500 dark:text-gray-400 mt-1">
                {deleteConfirm.fileCount.toLocaleString()} files &bull; {formatBytes(deleteConfirm.storageBytes)}
              </p>
            </div>
            <p className="text-xs text-red-600 dark:text-red-400 mb-5">
              ⚠️ This will permanently delete the user account, all files from storage, and all associated data. This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteConfirm(null)}
                disabled={deleteLoading}
                className="px-4 py-2 text-sm border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteUser}
                disabled={deleteLoading}
                className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded disabled:opacity-50 flex items-center gap-2"
              >
                {deleteLoading ? (
                  <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div> Deleting...</>
                ) : (
                  <><FontAwesomeIcon icon={faTrash} size="sm" /> Delete Permanently</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UsersPage;
