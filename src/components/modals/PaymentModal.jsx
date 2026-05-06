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
 * Unified Payment Modal - handles InstaPay, Wallet, and Bank Transfer payments
 * 
 * Flow:
 * 1. Show payment info and QR/link (InstaPay), numbers (Wallet), or IBAN (Bank Transfer)
 * 2. Upload screenshot + reference + submit
 * 3. Success confirmation
 * 
 * Props:
 * - plan: selected plan object
 * - paymentType: 'instapay' | 'wallet' | 'instapay-link' | 'bank-transfer'
 * - info: { enabled, username, qrImageUrl } (from /payments/instapay/info)
 * - startAtStep: which step to start from (1, 2, or 3)
 * - onClose(): close modal
 * - onSubmitted(): called after successful submission
 */
const PaymentModal = ({ 
  plan, 
  paymentType = 'instapay', 
  info, 
  startAtStep = 1, 
  onClose, 
  onSubmitted 
}) => {
  const [step, setStep] = useState(startAtStep);
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

  if (!plan) return null;

  const amountEgp = Number(plan.priceEgp).toFixed(0);
  const isInstaPay = paymentType === 'instapay' || paymentType === 'instapay-link';
  const isWallet = paymentType === 'wallet';
  const isBankTransfer = paymentType === 'bank-transfer';
  const showInstaPayInfo = isInstaPay && step === 1;
  const showWalletNumbers = isWallet && step === 1;
  const showBankTransferInfo = isBankTransfer && step === 1;
  const showUploadForm = step === 2;
  const showSuccess = step === 3;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText('https://ipn.eg/S/aamenn/instapay/0LfmmD');
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Handle error silently
    }
  };

  const handleCopyNumber = async (number) => {
    try {
      await navigator.clipboard.writeText(number);
      setCopied(number);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError('Failed to copy. Please copy manually.');
    }
  };

  const handleCopyIban = async () => {
    try {
      await navigator.clipboard.writeText('EG510010013000000100062287114');
      setCopied('iban');
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
      setError('Please attach a screenshot of your payment.');
      return;
    }
    if (reference.trim().length < 3) {
      setError('Please enter the transaction reference.');
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

  const getTitle = () => {
    if (showSuccess) return 'Submission Received';
    if (isInstaPay) return 'Pay with InstaPay';
    if (isWallet) return 'Pay with Wallet';
    if (isBankTransfer) return 'Pay with Bank Transfer';
    return 'Complete Payment';
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={showSuccess ? onClose : undefined}
      />
      <div className="relative bg-white dark:bg-zinc-800 rounded-2xl shadow-xl border border-gray-200 dark:border-zinc-700 max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-zinc-700">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              {getTitle()}
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
          {/* Error Banner */}
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900/50 rounded-lg text-sm text-red-700 dark:text-red-400">
              <FontAwesomeIcon
                icon={faTriangleExclamation}
                className="w-4 h-4 mt-0.5 flex-shrink-0"
              />
              <span>{error}</span>
            </div>
          )}

          {/* Step 1: Payment Info */}
          {(showInstaPayInfo || showWalletNumbers || showBankTransferInfo) && (
            <div className="space-y-4">
              {showInstaPayInfo && (
                <>
                  <div className="flex justify-center p-4 bg-gray-50 dark:bg-zinc-900 rounded-xl border border-gray-200 dark:border-zinc-700">
                    <img
                      src={'https://res.cloudinary.com/dcwbbjmf0/image/upload/v1777762146/instapay_link_crzz1e.jpg'}
                      alt="InstaPay QR code"
                      className="w-48 h-48 object-contain"
                    />
                  </div>

                  <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-zinc-900 rounded-lg border border-gray-200 dark:border-zinc-700">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        InstaPay payment link
                      </p>
                      <p className="text-sm font-mono text-black dark:text-white truncate">
                        https://ipn.eg/S/aamenn/instapay/0LfmmD
                      </p>
                      <p className="text-xs text-black dark:text-gray-400 mt-1">
                        Click the link to send money to: aamenn@instapay
                      </p>
                    </div>
                    <button
                      onClick={handleCopyLink}
                      className="px-3 py-1.5 text-xs font-medium bg-black text-white rounded-md hover:bg-gray-800 transition-colors flex items-center gap-1.5"
                    >
                      <FontAwesomeIcon
                        icon={copied ? faCheck : faCopy}
                        className="w-3 h-3"
                      />
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </>
              )}

              {showWalletNumbers && (
                <>
                  <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-zinc-900 rounded-lg border border-gray-200 dark:border-zinc-700">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Vodafone Cash
                      </p>
                      <p className="text-sm font-mono text-gray-900 dark:text-white">
                        01226209802
                      </p>
                    </div>
                    <button
                      onClick={() => handleCopyNumber('01226209802')}
                      className="px-3 py-1.5 text-xs font-medium bg-black text-white rounded-md hover:bg-gray-800 transition-colors flex items-center gap-1.5"
                    >
                      <FontAwesomeIcon
                        icon={copied === '01226209802' ? faCheck : faCopy}
                        className="w-3 h-3"
                      />
                      {copied === '01226209802' ? 'Copied' : 'Copy'}
                    </button>
                  </div>

                  <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-zinc-900 rounded-lg border border-gray-200 dark:border-zinc-700">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Etisalat Cash
                      </p>
                      <p className="text-sm font-mono text-gray-900 dark:text-white">
                        01124840870
                      </p>
                    </div>
                    <button
                      onClick={() => handleCopyNumber('01124840870')}
                      className="px-3 py-1.5 text-xs font-medium bg-black text-white rounded-md hover:bg-gray-800 transition-colors flex items-center gap-1.5"
                    >
                      <FontAwesomeIcon
                        icon={copied === '01124840870' ? faCheck : faCopy}
                        className="w-3 h-3"
                      />
                      {copied === '01124840870' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </>
              )}

              {isBankTransfer && (
                <>
                  <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-zinc-900 rounded-lg border border-gray-200 dark:border-zinc-700">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Egyptian Pound (EGP) IBAN
                      </p>
                      <h2 className="text-base font-mono text-gray-900 dark:text-white break-all m-0">
                        EG670010013000000100074092696
                      </h2>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        For Egyptian Pound transfers from EGP account to EGP account
                      </p>
                    </div>
                    <button
                      onClick={() => handleCopyNumber('EG670010013000000100074092696')}
                      className="px-3 py-1.5 text-xs font-medium bg-black text-white rounded-md hover:bg-gray-800 transition-colors flex items-center gap-1.5"
                    >
                      <FontAwesomeIcon
                        icon={copied === 'EG670010013000000100074092696' ? faCheck : faCopy}
                        className="w-3 h-3"
                      />
                      {copied === 'EG670010013000000100074092696' ? 'Copied' : 'Copy'}
                    </button>
                  </div>

                  <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-zinc-900 rounded-lg border border-gray-200 dark:border-zinc-700">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        USD IBAN (International)
                      </p>
                      <h2 className="text-base font-mono text-gray-900 dark:text-white break-all m-0">
                        EG510010013000000100062287114
                      </h2>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        For USD transfers from USD account to USD account
                      </p>
                    </div>
                    <button
                      onClick={() => handleCopyNumber('EG510010013000000100062287114')}
                      className="px-3 py-1.5 text-xs font-medium bg-black text-white rounded-md hover:bg-gray-800 transition-colors flex items-center gap-1.5"
                    >
                      <FontAwesomeIcon
                        icon={copied === 'EG510010013000000100062287114' ? faCheck : faCopy}
                        className="w-3 h-3"
                      />
                      {copied === 'EG510010013000000100062287114' ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                </>
              )}

              <div className="p-3 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/30 rounded-lg text-sm text-amber-800 dark:text-amber-300">
                Send <strong>exactly EGP {amountEgp}</strong> for the{' '}
                <strong>{plan.displayName}</strong> plan. {isInstaPay ? 'After payment, submit your proof below.' : 'Make sure to keep the transaction reference number — you\'ll need it on the next step.'}
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
                  className="px-4 py-2 bg-black text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
                >
                  {isInstaPay ? 'Submit for Review' : "I've completed the payment"}
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Upload Form */}
          {showUploadForm && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {isInstaPay ? 'InstaPay' : isWallet ? 'Wallet' : 'Bank Transfer'} payment screenshot <span className="text-red-500">*</span>
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
                  {isInstaPay ? 'InstaPay' : isWallet ? 'Wallet' : 'Bank Transfer'} transaction reference <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder={isInstaPay ? 'e.g. IPN-2026-04-30-XYZ123' : isWallet ? 'e.g. Transaction reference number' : 'e.g. Bank transaction reference'}
                  maxLength={100}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Sender name on {isInstaPay ? 'InstaPay' : isWallet ? 'Wallet' : 'Bank Account'} (optional)
                </label>
                <input
                  type="text"
                  value={senderName}
                  onChange={(e) => setSenderName(e.target.value)}
                  placeholder={`${isInstaPay ? 'InstaPay' : isWallet ? 'Wallet' : 'Bank account'} sender name`}
                  maxLength={100}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-zinc-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div className="flex justify-end gap-2">
                {startAtStep === 1 && (
                  <button
                    onClick={() => setStep(1)}
                    disabled={submitting}
                    className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-zinc-700 rounded-lg transition-colors disabled:opacity-50"
                  >
                    Back
                  </button>
                )}
                <button
                  onClick={handleSubmit}
                  disabled={submitting || !file || reference.trim().length < 3}
                  className="px-4 py-2 bg-black text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
            </div>
          )}

          {/* Step 3: Success */}
          {showSuccess && (
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
                We'll confirm and send you an email when your
                subscription is activated.
              </p>

              <div className="flex justify-end mt-6">
                <button
                  onClick={onClose}
                  className="px-6 py-2 bg-black text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PaymentModal;
