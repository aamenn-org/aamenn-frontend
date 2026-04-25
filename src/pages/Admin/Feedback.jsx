import { useState, useEffect } from 'react';
import { adminService } from '../../services';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCommentDots,
  faFilter,
  faChevronLeft,
  faChevronRight,
  faSpinner,
} from '@fortawesome/free-solid-svg-icons';

const CATEGORY_LABELS = {
  upload_issue: 'Upload Issue',
  preview_issue: 'Preview Issue',
  subscription_issue: 'Subscription Issue',
  performance_issue: 'Performance Issue',
  ui_ux_issue: 'UI/UX Issue',
  feature_request: 'Feature Request',
  other: 'Other',
};

const CATEGORY_COLORS = {
  upload_issue: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  preview_issue: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  subscription_issue: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  performance_issue: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  ui_ux_issue: 'bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400',
  feature_request: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  other: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
};

const Feedback = () => {
  const [feedbacks, setFeedbacks] = useState([]);
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [expandedId, setExpandedId] = useState(null);

  const fetchFeedbacks = async (p = 1, category = '') => {
    try {
      setLoading(true);
      const params = { page: p, limit: 20 };
      if (category) params.category = category;
      const data = await adminService.getFeedbacks(params);
      setFeedbacks(data.feedbacks || []);
      setTotalPages(data.totalPages || 1);
      setTotal(data.total || 0);
      setPage(data.page || 1);
    } catch (error) {
      console.error('Failed to fetch feedbacks:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const data = await adminService.getFeedbackStats();
      setStats(data || []);
    } catch (error) {
      console.error('Failed to fetch feedback stats:', error);
    }
  };

  useEffect(() => {
    fetchFeedbacks(1, categoryFilter);
    fetchStats();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCategoryFilter = (cat) => {
    const newFilter = cat === categoryFilter ? '' : cat;
    setCategoryFilter(newFilter);
    fetchFeedbacks(1, newFilter);
  };

  const handlePageChange = (newPage) => {
    if (newPage < 1 || newPage > totalPages) return;
    fetchFeedbacks(newPage, categoryFilter);
  };

  const totalFeedbacks = stats.reduce((sum, s) => sum + s.count, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            User Feedback
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {total} total feedback{total !== 1 ? 's' : ''} received
          </p>
        </div>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        {Object.entries(CATEGORY_LABELS).map(([key, label]) => {
          const stat = stats.find((s) => s.category === key);
          const count = stat?.count || 0;
          const isActive = categoryFilter === key;
          return (
            <button
              key={key}
              onClick={() => handleCategoryFilter(key)}
              className={`p-3 rounded-lg border text-left transition-all ${
                isActive
                  ? 'border-blue-500 ring-2 ring-blue-200 dark:ring-blue-800 bg-blue-50 dark:bg-blue-900/20'
                  : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600'
              }`}
            >
              <p className="text-lg font-bold text-gray-900 dark:text-white">{count}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{label}</p>
              {totalFeedbacks > 0 && count > 0 && (
                <div className="mt-1.5 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1">
                  <div
                    className="bg-blue-500 h-1 rounded-full transition-all"
                    style={{ width: `${(count / totalFeedbacks) * 100}%` }}
                  />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Active filter indicator */}
      {categoryFilter && (
        <div className="flex items-center gap-2">
          <FontAwesomeIcon icon={faFilter} className="w-3.5 h-3.5 text-blue-500" />
          <span className="text-sm text-gray-600 dark:text-gray-400">
            Filtering by:{' '}
            <span className="font-medium text-gray-900 dark:text-white">
              {CATEGORY_LABELS[categoryFilter]}
            </span>
          </span>
          <button
            onClick={() => handleCategoryFilter('')}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline ml-1"
          >
            Clear
          </button>
        </div>
      )}

      {/* Feedback list */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <FontAwesomeIcon icon={faSpinner} className="w-6 h-6 text-blue-500 animate-spin" />
            <span className="ml-3 text-gray-500 dark:text-gray-400">Loading feedbacks...</span>
          </div>
        ) : feedbacks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400 dark:text-gray-500">
            <FontAwesomeIcon icon={faCommentDots} className="w-10 h-10 mb-3" />
            <p className="text-lg font-medium">No feedbacks yet</p>
            <p className="text-sm mt-1">User feedbacks will appear here</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-700">
            {feedbacks.map((fb) => (
              <div
                key={fb.id}
                className="p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer"
                onClick={() => setExpandedId(expandedId === fb.id ? null : fb.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          CATEGORY_COLORS[fb.category] || CATEGORY_COLORS.other
                        }`}
                      >
                        {CATEGORY_LABELS[fb.category] || fb.category}
                      </span>
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {new Date(fb.createdAt).toLocaleDateString('en-US', {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p
                      className={`text-sm text-gray-700 dark:text-gray-300 ${
                        expandedId === fb.id ? '' : 'line-clamp-2'
                      }`}
                    >
                      {fb.message}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs font-medium text-gray-600 dark:text-gray-400 truncate max-w-[180px]">
                      {fb.userDisplayName || fb.userEmail || fb.user?.email || 'Unknown'}
                    </p>
                    {fb.userEmail && fb.userDisplayName && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 truncate max-w-[180px]">
                        {fb.userEmail || fb.user?.email}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Page {page} of {totalPages}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handlePageChange(page - 1)}
                disabled={page <= 1}
                className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <FontAwesomeIcon icon={faChevronLeft} className="w-3.5 h-3.5 text-gray-600 dark:text-gray-400" />
              </button>
              <button
                onClick={() => handlePageChange(page + 1)}
                disabled={page >= totalPages}
                className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <FontAwesomeIcon icon={faChevronRight} className="w-3.5 h-3.5 text-gray-600 dark:text-gray-400" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Feedback;
