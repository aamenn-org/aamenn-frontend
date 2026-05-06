import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { authService } from '../../services';
import {
  unlockMasterKeyWithRecovery,
  encryptMasterKey,
  deriveKEK,
  generateRandomBytes,
  arrayBufferToBase64,
} from '../../utils/crypto';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faCheck } from '@fortawesome/free-solid-svg-icons';

const ForgotPasswordPage = () => {
  const { t } = useTranslation('common');
  const [step, setStep] = useState('email'); // email | otp | recovery | success
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [recoveryPhrase, setRecoveryPhrase] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Step 1: Request OTP
  const handleRequestOtp = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await authService.vaultResetRequest(email.trim());
      setStep('otp');
    } catch (err) {
      setError(
        err.response?.data?.message ||
          t('errors.generic', 'Failed to send reset code.'),
      );
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Verify OTP
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await authService.vaultResetVerify(
        email.trim(),
        otp.trim(),
      );
      setResetToken(result.resetToken);
      setStep('recovery');
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid or expired code.');
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Recovery key + new password → complete
  const handleResetComplete = async (e) => {
    e.preventDefault();
    setError('');
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    try {
      const params = await authService.vaultResetGetParams(resetToken);
      const masterKey = await unlockMasterKeyWithRecovery(
        recoveryPhrase.trim(),
        params.recoveryEncryptedMasterKey,
        params.recoverySalt,
        params.recoveryKdfParams,
      );
      const newSaltBytes = generateRandomBytes(16);
      const newKekSalt = arrayBufferToBase64(newSaltBytes);
      const newKek = await deriveKEK(newPassword, newKekSalt);
      const newEncryptedMasterKey = await encryptMasterKey(masterKey, newKek);
      await authService.vaultResetComplete({
        resetToken,
        newPassword,
        newEncryptedMasterKey,
        newKekSalt,
      });
      setStep('success');
    } catch (err) {
      console.error('Vault reset failed:', err);
      if (err.name === 'OperationError') {
        setError(
          t(
            'errors.invalidRecoveryKey',
            'Invalid recovery key. Please check and try again.',
          ),
        );
      } else {
        setError(
          err.response?.data?.message ||
            t('errors.generic', 'Reset failed. Please try again.'),
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'w-full px-4 py-3 bg-[#0a0a0a] border border-gray-800 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors';
  const btnClass =
    'w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <div className="min-h-screen flex items-center justify-center bg-black p-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-6">
          <img src="/logo3.png" alt="Aamenn Logo" className="w-16 h-16" />
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg">
            {error}
          </div>
        )}

        {/* Step 1: Email */}
        {step === 'email' && (
          <>
            <div className="mb-6">
              <h1 className="text-3xl font-bold text-white mb-2">
                {t('auth.forgotYourPassword', 'Forgot password?')}
              </h1>
              <p className="text-gray-400 text-sm">
                {t(
                  'auth.weSendVerificationCode',
                  "Enter your email and we'll send a verification code.",
                )}
              </p>
            </div>
            <form onSubmit={handleRequestOtp} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5">
                  {t('auth.email', 'Email')}
                </label>
                <input
                  type="email"
                  placeholder={t('auth.enterYourEmail', 'Enter your email')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                  required
                  autoFocus
                />
              </div>
              <button type="submit" disabled={loading} className={btnClass}>
                {loading
                  ? t('auth.sending', 'Sending...')
                  : t('auth.sendVerificationCode', 'Send verification code')}
              </button>
              <Link
                to="/login"
                className="flex items-center justify-center gap-2 text-sm text-gray-400 hover:text-gray-300 mt-2"
              >
                <FontAwesomeIcon icon={faArrowLeft} className="w-4 h-4" />
                {t('auth.backToLogin', 'Back to login')}
              </Link>
            </form>
          </>
        )}

        {/* Step 2: OTP */}
        {step === 'otp' && (
          <>
            <div className="mb-6">
              <h1 className="text-3xl font-bold text-white mb-2">
                {t('auth.enterVerificationCode', 'Enter verification code')}
              </h1>
              <p className="text-gray-400 text-sm">
                We sent a 6-digit code to{' '}
                <span className="text-white font-medium">{email}</span>
              </p>
            </div>
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5">
                  Verification Code
                </label>
                <input
                  type="text"
                  placeholder="Enter 6-digit code"
                  value={otp}
                  maxLength={6}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  className={`${inputClass} text-center text-2xl  font-mono`}
                  required
                  autoFocus
                />
              </div>
              <button
                type="submit"
                disabled={loading || otp.length !== 6}
                className={btnClass}
              >
                {loading
                  ? t('auth.verifying', 'Verifying...')
                  : t('auth.verifyCode', 'Verify code')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep('email');
                  setError('');
                }}
                className="w-full text-sm text-gray-400 hover:text-gray-300"
              >
                Use a different email
              </button>
            </form>
          </>
        )}

        {/* Step 3: Recovery key + new password */}
        {step === 'recovery' && (
          <>
            <div className="mb-6">
              <h1 className="text-3xl font-bold text-white mb-2">
                {t('auth.resetPassword', 'Reset your password')}
              </h1>
              <p className="text-gray-400 text-sm">
                Enter your recovery key and choose a new password.
              </p>
            </div>
            <form onSubmit={handleResetComplete} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5">
                  Recovery Key
                </label>
                <input
                  type="text"
                  placeholder="xxxx-xxxx-xxxx-xxxx-..."
                  value={recoveryPhrase}
                  onChange={(e) => setRecoveryPhrase(e.target.value)}
                  className={`${inputClass} font-mono text-sm`}
                  required
                  autoFocus
                />
                <p className="text-xs text-gray-500 mt-1">
                  The key you saved when you created your account
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5">
                  New Password
                </label>
                <input
                  type="password"
                  placeholder="At least 8 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className={inputClass}
                  required
                  minLength={8}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5">
                  Confirm Password
                </label>
                <input
                  type="password"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={inputClass}
                  required
                />
              </div>
              <button type="submit" disabled={loading} className={btnClass}>
                {loading
                  ? t('auth.resetting', 'Resetting...')
                  : t('auth.resetPassword', 'Reset password')}
              </button>
            </form>
          </>
        )}

        {/* Step 4: Success */}
        {step === 'success' && (
          <div className="text-center">
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center">
                <FontAwesomeIcon
                  icon={faCheck}
                  className="w-8 h-8 text-green-400"
                />
              </div>
            </div>
            <h1 className="text-3xl font-bold text-white mb-2">
              Password reset!
            </h1>
            <p className="text-gray-400 mb-6">
              Your vault password has been updated. You can now log in with your
              new password.
            </p>
            <Link
              to="/login"
              className={btnClass + ' inline-block text-center'}
            >
              {t('auth.goToLogin', 'Go to login')}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};

export default ForgotPasswordPage;
