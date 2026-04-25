import { useState, useEffect, useCallback } from 'react';
import { adminService } from '../../services';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faChevronLeft,
  faChevronRight,
  faCheckCircle,
  faExclamationTriangle,
  faFingerprint,
  faNetworkWired,
  faUserSlash,
  faCheck,
} from '@fortawesome/free-solid-svg-icons';

/**
 * Format date
 */
const formatDate = (date) => {
  if (!date) return 'N/A';
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

/**
 * Truncate a fingerprint hash for display
 */
const truncateHash = (hash) => {
  if (!hash) return '—';
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
};

const FlaggedSignups = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });
  const [includeResolved, setIncludeResolved] = useState(false);
  const [resolving, setResolving] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [disabling, setDisabling] = useState(null);

  const fetchFlagged = useCallback(async () => {
    try {
      setLoading(true);
      const data = await adminService.getFlaggedSignups({
        page: pagination.page,
        limit: pagination.limit,
        includeResolved,
        sortOrder: 'DESC',
      });
      setUsers(data.users || []);
      setPagination((prev) => ({
        ...prev,
        total: data.total,
        totalPages: data.totalPages,
      }));
      setError(null);
    } catch (err) {
      setError('Failed to load flagged signups');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [pagination.page, pagination.limit, includeResolved]);

  useEffect(() => {
    fetchFlagged();
  }, [fetchFlagged]);

  const handleResolve = async (userId) => {
    try {
      setResolving(userId);
      await adminService.resolveFlaggedSignup(userId);
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId ? { ...u, signupFlagged: false } : u,
        ),
      );
      setSuccessMessage('Signup resolved successfully');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      console.error('Failed to resolve signup:', err);
    } finally {
      setResolving(null);
    }
  };

  const handleDisableAccount = async (userId) => {
    try {
      setDisabling(userId);
      await adminService.updateUserStatus(userId, { isActive: false });
      setUsers((prev) =>
        prev.map((u) =>
          u.id === userId ? { ...u, isActive: false } : u,
        ),
      );
      setSuccessMessage('Account disabled');
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      console.error('Failed to disable account:', err);
    } finally {
      setDisabling(null);
    }
  };

  if (loading && users.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (error && users.length === 0) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-lg">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl lg:text-2xl font-bold text-gray-900 dark:text-white">
            Flagged Signups
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {pagination.total} flagged signup{pagination.total !== 1 ? 's' : ''} detected
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 cursor-pointer">
          <input
            type="checkbox"
            checked={includeResolved}
            onChange={(e) => {
              setIncludeResolved(e.target.checked);
              setPagination((prev) => ({ ...prev, page: 1 }));
            }}
            className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
          />
          Include resolved
        </label>
      </div>

      {/* Success message */}
      {successMessage && (
        <div className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 p-3 rounded-lg text-sm flex items-center gap-2">
          <FontAwesomeIcon icon={faCheckCircle} />
          {successMessage}
        </div>
      )}

      {/* Empty state */}
      {users.length === 0 && !loading && (
        <div className="text-center py-16">
          <FontAwesomeIcon
            icon={faCheckCircle}
            className="text-green-500 text-4xl mb-3"
          />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            No flagged signups
          </h3>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
            All signups look clean. The abuse detection system hasn't flagged anyone.
          </p>
        </div>
      )}

      {/* Table */}
      {users.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700/50">
                <tr>
                  <th className="text-left px-4 py-3 text-gray-600 dark:text-gray-300 font-medium">
                    User
                  </th>
                  <th className="text-left px-4 py-3 text-gray-600 dark:text-gray-300 font-medium">
                    Signup IP
                  </th>
                  <th className="text-left px-4 py-3 text-gray-600 dark:text-gray-300 font-medium">
                    Fingerprint
                  </th>
                  <th className="text-left px-4 py-3 text-gray-600 dark:text-gray-300 font-medium">
                    Status
                  </th>
                  <th className="text-left px-4 py-3 text-gray-600 dark:text-gray-300 font-medium">
                    Signed up
                  </th>
                  <th className="text-right px-4 py-3 text-gray-600 dark:text-gray-300 font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {users.map((user) => (
                  <tr
                    key={user.id}
                    className={`hover:bg-gray-50 dark:hover:bg-gray-700/30 ${
                      !user.signupFlagged ? 'opacity-60' : ''
                    }`}
                  >
                    {/* User */}
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 dark:text-white">
                        {user.email}
                      </div>
                      {user.displayName && (
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {user.displayName}
                        </div>
                      )}
                    </td>

                    {/* Signup IP */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5 text-gray-700 dark:text-gray-300">
                        <FontAwesomeIcon
                          icon={faNetworkWired}
                          className="text-gray-400 text-xs"
                        />
                        <span className="font-mono text-xs">
                          {user.signupIp || '—'}
                        </span>
                      </div>
                    </td>

                    {/* Fingerprint */}
                    <td className="px-4 py-3">
                      <div
                        className="flex items-center gap-1.5 text-gray-700 dark:text-gray-300"
                        title={user.signupFingerprint || ''}
                      >
                        <FontAwesomeIcon
                          icon={faFingerprint}
                          className="text-gray-400 text-xs"
                        />
                        <span className="font-mono text-xs">
                          {truncateHash(user.signupFingerprint)}
                        </span>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-1">
                        {user.signupFlagged ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 w-fit">
                            <FontAwesomeIcon icon={faExclamationTriangle} className="text-[10px]" />
                            Flagged
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 w-fit">
                            <FontAwesomeIcon icon={faCheck} className="text-[10px]" />
                            Resolved
                          </span>
                        )}
                        {!user.isActive && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 w-fit">
                            Disabled
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Date */}
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs whitespace-nowrap">
                      {formatDate(user.createdAt)}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {user.signupFlagged && (
                          <button
                            onClick={() => handleResolve(user.id)}
                            disabled={resolving === user.id}
                            className="px-3 py-1.5 text-xs font-medium rounded-md bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/40 disabled:opacity-50 transition-colors"
                            title="Mark as reviewed"
                          >
                            {resolving === user.id ? (
                              <span className="animate-spin inline-block w-3 h-3 border-2 border-green-500 border-t-transparent rounded-full" />
                            ) : (
                              'Resolve'
                            )}
                          </button>
                        )}
                        {user.isActive && (
                          <button
                            onClick={() => handleDisableAccount(user.id)}
                            disabled={disabling === user.id}
                            className="px-3 py-1.5 text-xs font-medium rounded-md bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 disabled:opacity-50 transition-colors"
                            title="Disable this account"
                          >
                            {disabling === user.id ? (
                              <span className="animate-spin inline-block w-3 h-3 border-2 border-red-500 border-t-transparent rounded-full" />
                            ) : (
                              <>
                                <FontAwesomeIcon icon={faUserSlash} className="mr-1" />
                                Disable
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 dark:border-gray-700">
              <span className="text-sm text-gray-500 dark:text-gray-400">
                Page {pagination.page} of {pagination.totalPages} ({pagination.total} total)
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() =>
                    setPagination((prev) => ({ ...prev, page: prev.page - 1 }))
                  }
                  disabled={pagination.page <= 1}
                  className="px-3 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-600 disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <FontAwesomeIcon icon={faChevronLeft} />
                </button>
                <button
                  onClick={() =>
                    setPagination((prev) => ({ ...prev, page: prev.page + 1 }))
                  }
                  disabled={pagination.page >= pagination.totalPages}
                  className="px-3 py-1.5 text-sm rounded-md border border-gray-300 dark:border-gray-600 disabled:opacity-50 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <FontAwesomeIcon icon={faChevronRight} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FlaggedSignups;
