import { useState } from 'react';
import { feedbackService } from '../../services';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCommentDots,
  faCheck,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';

const FEEDBACK_CATEGORIES = [
  { value: 'upload_issue', label: 'Issue in uploading' },
  { value: 'preview_issue', label: 'Issue in file preview' },
  { value: 'subscription_issue', label: 'Subscription issue' },
  { value: 'performance_issue', label: 'Performance / speed issue' },
  { value: 'ui_ux_issue', label: 'UI / design issue' },
  { value: 'feature_request', label: 'Feature request' },
  { value: 'other', label: 'Other' },
];

const FeedbackModal = ({ isOpen, onClose }) => {
  const [category, setCategory] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async () => {
    if (!category || !message.trim()) return;

    try {
      setLoading(true);
      await feedbackService.submitFeedback({ category, message: message.trim() });
      setSubmitted(true);
    } catch (error) {
      console.error('Failed to submit feedback:', error);
      alert('Failed to submit feedback. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setCategory('');
    setMessage('');
    setSubmitted(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]">
      <div className="bg-white dark:bg-zinc-800 rounded-xl p-6 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
        {submitted ? (
          /* ── Success view ── */
          <div className="text-center py-4">
            <div className="w-14 h-14 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <FontAwesomeIcon icon={faCheck} className="w-7 h-7 text-green-600" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              Thank you!
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              Your feedback has been submitted. We appreciate you helping us improve Aamenn.
            </p>
            <button
              onClick={handleClose}
              className="w-full px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Done
            </button>
          </div>
        ) : (
          /* ── Form view ── */
          <div>
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
                  <FontAwesomeIcon icon={faCommentDots} className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                    Send Feedback
                  </h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Help us improve your experience
                  </p>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <FontAwesomeIcon icon={faXmark} className="w-4 h-4" />
              </button>
            </div>

            {/* Category radio buttons */}
            <div className="space-y-3 mb-5">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                What is this about?
              </label>
              <div className="space-y-2">
                {FEEDBACK_CATEGORIES.map((cat) => (
                  <label
                    key={cat.value}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      category === cat.value
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 dark:border-blue-400'
                        : 'border-gray-200 dark:border-zinc-600 hover:bg-gray-50 dark:hover:bg-zinc-700/50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="feedback-category"
                      value={cat.value}
                      checked={category === cat.value}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-4 h-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                    />
                    <span className={`text-sm ${
                      category === cat.value
                        ? 'text-blue-700 dark:text-blue-300 font-medium'
                        : 'text-gray-700 dark:text-gray-300'
                    }`}>
                      {cat.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Message textarea */}
            <div className="mb-5">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Tell us more
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Describe your issue or suggestion in detail..."
                rows={4}
                maxLength={5000}
                className="w-full px-3 py-2.5 border border-gray-300 dark:border-zinc-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-zinc-700 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 resize-none text-sm"
              />
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 text-right">
                {message.length}/5000
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={handleClose}
                className="flex-1 px-4 py-2.5 border border-gray-300 dark:border-zinc-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-700 transition-colors text-sm font-medium"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={loading || !category || !message.trim()}
                className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
              >
                {loading ? 'Submitting...' : 'Submit Feedback'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FeedbackModal;
