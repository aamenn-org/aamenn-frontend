import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faXmark,
  faCopy,
  faCheck,
  faCloudArrowUp,
  faSpinner,
  faCircleCheck,
  faTriangleExclamation,
} from '@fortawesome/free-solid-svg-icons';
import { paymentService } from '../../services';

const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/jpg'];

/**
 * InstaPay manual payment flow.
 *
 * Three steps:
 *   1. Show QR / username / amount → user pays externally → "I've completed the payment"
 *   2. Upload screenshot + reference + (optional) sender name → submit
 *   3. Success confirmation
 *
 * Props:
 * - plan: selected plan object
 * - info: { enabled, username, qrDataUrl } (from /payments/instapay/info)
 * - onClose(): close modal
 * - onSubmitted(): called after successful submission (for parent to refresh status)
 */
const InstapayPaymentModal = ({ plan, info, onClose, onSubmitted }) => {
  const [step, setStep] = useState(1);
  const [copied, setCopied] = useState(false);
  const [file, setFile] = useState(null);
  const [filePreview, setFilePreview] = useState(null);
  const [reference, setReference] = useState('');
  const [senderName, setSenderName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!file) {
      setFilePreview(null);
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setFilePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  if (!plan || !info) return null;

  const handleCopyUsername = async () => {
    if (!info.username) return;
    try {
      await navigator.clipboard.writeText(info.username);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('Failed to copy. Please copy manually.');
    }
  };

  const handleFileChange = (event) => {
    setError('');
    const selected = event.target.files?.[0];
    if (!selected) return;

    if (!ACCEPTED_TYPES.includes(selected.type)) {
      setError('Only PNG or JPEG images are allowed.');
      return;
    }
    if (selected.size > MAX_SCREENSHOT_BYTES) {
      setError('Screenshot must be 5 MB or smaller.');
      return;
    }
    setFile(selected);
  };

  const handleSubmit = async () => {
    setError('');
    if (!file) {
      setError('Please attach a screenshot of your InstaPay transfer.');
      return;
    }
    if (reference.trim().length < 3) {
      setError('Please enter the InstaPay transaction reference.');
      return;
    }

    setSubmitting(true);
    try {
      await paymentService.submitInstapay({
        planId: plan.id,
        screenshot: file,
        instapayReference: reference.trim(),
        senderName: senderName.trim() || undefined,
      });
      setStep(3);
      if (typeof onSubmitted === 'function') {
        onSubmitted();
      }
    } catch (err) {
      const message =
        err?.response?.data?.message || err?.message || 'Submission failed';
      setError(Array.isArray(message) ? message.join(', ') : message);
    } finally {
      setSubmitting(false);
    }
  };

  const amountEgp = (plan.pricePiasters / 100).toFixed(2);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={step === 3 ? onClose : undefined}
      />
      <div className="relative bg-white dark:bg-zinc-800 rounded-2xl shadow-xl border border-gray-200 dark:border-zinc-700 max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-zinc-700">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              {step === 3 ? 'Submission Received' : 'Pay with InstaPay'}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {plan.displayName} — EGP {amountEgp}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
            aria-label="Close"
          >
            <FontAwesomeIcon icon={faXmark} className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 rounded-lg text-sm text-red-700 dark:text-red-400">
              <FontAwesomeIcon
                icon={faTriangleExclamation}
                className="w-4 h-4 mt-0.5 flex-shrink-0"
              />
              <span>{error}</span>
            </div>
          )}

          {step === 1 && (
            <>
              <div className="space-y-3">
                {info.qrDataUrl && (
                  <div className="flex justify-center p-4 bg-gray-50 dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-700">
                    <img
                      src={info.qrDataUrl}
                      alt="InstaPay QR code"
                      className="w-48 h-48 object-contain"
                    />
                  </div>
                )}

                {info.username && (
                  <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-zinc-900 rounded-lg border border-gray-200 dark:border-zinc-700">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        InstaPay username
                      </p>
                      <p className="text-sm font-mono text-gray-900 dark:text-white truncate">
                        {info.username}
                      </p>
                    </div>
                    <button
                      onClick={handleCopyUsername}
                      className="px-3 py-1.5 text-xs font-medium bg-primary-500 text-white rounded-md hover:bg-primary-600 transition-colors flex items-center gap-1.5"
                    >
                      <FontAwesomeIcon
                        icon={copied ? faCheck : faCopy}
                        className="w-3 h-3"
                      />
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                )}

                <div className="p-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/30 rounded-lg text-sm text-amber-800 dark:text-amber-300">
                  Send <strong>exactly EGP {amountEgp}</strong> for the{' '}
                  <strong>{plan.displayName}</strong> plan. Make sure to keep
                  the transaction reference number — you'll need it on the next
                  step.
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => setStep(2)}
                  className="px-6 py-2 bg-primary-500 text-white text-sm font-medium rounded-lg hover:bg-primary-600 transition-colors"
                >
                  I've completed the payment
                </button>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Payment screenshot <span className="text-red-500">*</span>
                  </label>
                  <label className="flex flex-col items-center justify-center w-full p-6 border-2 border-dashed border-gray-300 dark:border-zinc-600 rounded-lg cursor-pointer hover:border-primary-400 transition-colors bg-gray-50 dark:bg-zinc-900">
                    {filePreview ? (
                      <img
                        src={filePreview}
                        alt="Screenshot preview"
                        className="max-h-48 rounded-md"
                      />
                    ) : (
                      <>
                        <FontAwesomeIcon
                          icon={faCloudArrowUp}
                          className="w-8 h-8 text-gray-400 mb-2"
                        />
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Click to upload (PNG or JPEG, max 5 MB)
                        </p>
                      </>
                    )}
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/jpg"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                  </label>
                  {file && (
                    <button
                      onClick={() => setFile(null)}
                      className="mt-2 text-xs text-red-600 dark:text-red-400 hover:underline"
                    >
                      Remove screenshot
                    </button>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    InstaPay transaction reference{' '}
                    <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    placeholder="e.g. IPN-2026-04-30-XYZ123"
                    maxLength={100}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Sender name on InstaPay (optional)
                  </label>
                  <input
                    type="text"
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                    placeholder="The name on the account that sent the money"
                    maxLength={100}
                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setStep(1)}
                  disabled={submitting}
                  className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded-lg transition-colors disabled:opacity-50"
                >
                  Back
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting || !file || reference.trim().length < 3}
                  className="px-6 py-2 bg-primary-500 text-white text-sm font-medium rounded-lg hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  {submitting && (
                    <FontAwesomeIcon
                      icon={faSpinner}
                      className="w-4 h-4 animate-spin"
                    />
                  )}
                  {submitting ? 'Submitting...' : 'Submit for Review'}
                </button>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="text-center py-4">
                <div className="w-16 h-16 mx-auto bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-4">
                  <FontAwesomeIcon
                    icon={faCircleCheck}
                    className="w-8 h-8 text-green-600 dark:text-green-400"
                  />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  Your payment is being verified
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  We'll confirm within 12 hours and send you an email when your
                  subscription is activated.
                </p>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={onClose}
                  className="px-6 py-2 bg-primary-500 text-white text-sm font-medium rounded-lg hover:bg-primary-600 transition-colors"
                >
                  Close
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default InstapayPaymentModal;
