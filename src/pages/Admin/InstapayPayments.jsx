import { useEffect, useState, useCallback } from 'react';
import { adminService } from '../../services';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCheck,
  faXmark,
  faSpinner,
  faMoneyBillTransfer,
  faClock,
  faCircleCheck,
  faCircleXmark,
  faRotateRight,
} from '@fortawesome/free-solid-svg-icons';

const STATUS_BADGE = {
  pending_verification:
    'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300',
  approved:
    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
  rejected: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  expired: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
};

const STATUS_LABEL = {
  pending_verification: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  expired: 'Expired',
};

const formatDateTime = (value) =>
  value ? new Date(value).toLocaleString() : '—';

const InstapayPayments = () => {
  const [tab, setTab] = useState('pending');
  const [pending, setPending] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [adminNote, setAdminNote] = useState('');

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [pendingList, historyList] = await Promise.all([
        adminService.getInstapayPending(),
        adminService.getInstapayHistory(),
      ]);
      setPending(pendingList || []);
      setHistory(historyList || []);
    } catch (err) {
      console.error('Failed to load InstaPay submissions:', err);
      setError(
        err?.response?.data?.message ||
          err?.message ||
          'Failed to load submissions',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const openDetail = async (submission) => {
    setSelected(submission);
    setAdminNote('');
    // Fetch full submission with screenshot
    setDetailLoading(true);
    try {
      const full = await adminService.getInstapaySubmission(submission.id);
      setSelected(full);
    } catch (err) {
      console.error('Failed to load submission detail:', err);
      setError(
        err?.response?.data?.message ||
          err?.message ||
          'Failed to load submission detail',
      );
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setSelected(null);
    setAdminNote('');
  };

  const submitReview = async (action) => {
    if (!selected) return;
    if (action === 'reject' && adminNote.trim().length < 3) {
      setError('Please provide a rejection reason (≥ 3 chars).');
      return;
    }
    setReviewing(true);
    setError('');
    try {
      await adminService.reviewInstapay(
        selected.id,
        action,
        adminNote.trim() || undefined,
      );
      closeDetail();
      await fetchAll();
    } catch (err) {
      console.error('Failed to review submission:', err);
      setError(
        err?.response?.data?.message ||
          err?.message ||
          'Failed to submit review',
      );
    } finally {
      setReviewing(false);
    }
  };

  const list = tab === 'pending' ? pending : history;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <FontAwesomeIcon
              icon={faMoneyBillTransfer}
              className="w-6 h-6 text-amber-500"
            />
            InstaPay Payments
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Review and verify manual InstaPay transfer submissions.
          </p>
        </div>
        <button
          onClick={fetchAll}
          className="px-3 py-2 text-sm bg-gray-100 dark:bg-zinc-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-zinc-600 flex items-center gap-2"
        >
          <FontAwesomeIcon icon={faRotateRight} className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-400 text-sm rounded-lg">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200 dark:border-zinc-700">
        <button
          onClick={() => setTab('pending')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'pending'
              ? 'border-primary-500 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          Pending ({pending.length})
        </button>
        <button
          onClick={() => setTab('history')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === 'history'
              ? 'border-primary-500 text-primary-600 dark:text-primary-400'
              : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          History ({history.length})
        </button>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-zinc-800 rounded-xl border border-gray-200 dark:border-zinc-700 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500 dark:text-gray-400">
            <FontAwesomeIcon
              icon={faSpinner}
              className="w-6 h-6 animate-spin"
            />
          </div>
        ) : list.length === 0 ? (
          <div className="p-12 text-center text-gray-500 dark:text-gray-400 text-sm">
            No submissions in this view.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-zinc-900 text-left text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                <tr>
                  <th className="px-4 py-3">User</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Submitted</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-zinc-700">
                {list.map((row) => (
                  <tr
                    key={row.id}
                    className="hover:bg-gray-50 dark:hover:bg-zinc-700/50"
                  >
                    <td className="px-4 py-3 text-gray-900 dark:text-white">
                      {row.user?.email || row.userId}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                      {row.plan?.displayName || '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">
                      EGP {(row.amountPiasters / 100).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300 font-mono text-xs">
                      {row.instapayReference}
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">
                      {formatDateTime(row.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          STATUS_BADGE[row.status] || ''
                        }`}
                      >
                        {STATUS_LABEL[row.status] || row.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => openDetail(row)}
                        className="px-3 py-1.5 text-xs font-medium bg-primary-500 text-white rounded-md hover:bg-primary-600 transition-colors"
                      >
                        Review
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={reviewing ? undefined : closeDetail}
          />
          <div className="relative bg-white dark:bg-zinc-800 rounded-2xl shadow-xl border border-gray-200 dark:border-zinc-700 max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-zinc-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">
                Review Submission
              </h2>
              <button
                onClick={closeDetail}
                disabled={reviewing}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors disabled:opacity-50"
                aria-label="Close"
              >
                <FontAwesomeIcon icon={faXmark} className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    User
                  </p>
                  <p className="text-gray-900 dark:text-white font-medium">
                    {selected.user?.email || selected.userId}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Plan
                  </p>
                  <p className="text-gray-900 dark:text-white font-medium">
                    {selected.plan?.displayName || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Amount
                  </p>
                  <p className="text-gray-900 dark:text-white font-medium">
                    EGP {(selected.amountPiasters / 100).toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Reference
                  </p>
                  <p className="text-gray-900 dark:text-white font-mono text-xs">
                    {selected.instapayReference}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Sender Name
                  </p>
                  <p className="text-gray-900 dark:text-white">
                    {selected.senderName || '—'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Submitted
                  </p>
                  <p className="text-gray-900 dark:text-white">
                    {formatDateTime(selected.createdAt)}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  Screenshot
                </p>
                {detailLoading ? (
                  <div className="p-12 flex justify-center bg-gray-50 dark:bg-zinc-900 rounded-lg">
                    <FontAwesomeIcon
                      icon={faSpinner}
                      className="w-6 h-6 animate-spin text-gray-400"
                    />
                  </div>
                ) : selected.screenshotUrl ? (
                  <a
                    href={selected.screenshotUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="block bg-gray-50 dark:bg-zinc-900 rounded-lg border border-gray-200 dark:border-zinc-700 p-2"
                  >
                    <img
                      src={selected.screenshotUrl}
                      alt="InstaPay screenshot"
                      className="max-h-96 mx-auto rounded"
                    />
                  </a>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Screenshot is no longer available (deleted after rejection
                    or expiry).
                  </p>
                )}
              </div>

              {selected.status === 'pending_verification' ? (
                <>
                  <div>
                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                      Admin note (required when rejecting)
                    </label>
                    <textarea
                      value={adminNote}
                      onChange={(e) => setAdminNote(e.target.value)}
                      rows={3}
                      maxLength={1000}
                      placeholder="e.g. Reference number does not match any incoming transfer."
                      className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>

                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => submitReview('reject')}
                      disabled={reviewing}
                      className="px-4 py-2 text-sm font-medium bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 flex items-center gap-2"
                    >
                      <FontAwesomeIcon
                        icon={faCircleXmark}
                        className="w-4 h-4"
                      />
                      Reject
                    </button>
                    <button
                      onClick={() => submitReview('approve')}
                      disabled={reviewing}
                      className="px-4 py-2 text-sm font-medium bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 flex items-center gap-2"
                    >
                      <FontAwesomeIcon
                        icon={faCircleCheck}
                        className="w-4 h-4"
                      />
                      Approve & Activate
                    </button>
                  </div>
                </>
              ) : (
                <div className="p-3 bg-gray-50 dark:bg-zinc-900 rounded-lg text-sm space-y-1">
                  <p className="text-gray-700 dark:text-gray-300">
                    <strong>Status:</strong>{' '}
                    {STATUS_LABEL[selected.status] || selected.status}
                  </p>
                  <p className="text-gray-700 dark:text-gray-300">
                    <strong>Reviewed at:</strong>{' '}
                    {formatDateTime(selected.reviewedAt)}
                  </p>
                  {selected.adminNote && (
                    <p className="text-gray-700 dark:text-gray-300">
                      <strong>Note:</strong> {selected.adminNote}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InstapayPayments;
