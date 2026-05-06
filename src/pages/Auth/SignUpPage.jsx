import { useState, useEffect, useRef, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import zxcvbn from 'zxcvbn';
import { useAuth } from '../../context';
import { authService } from '../../services/auth.service';
import { getDeviceFingerprint } from '../../utils/fingerprint';
import GoogleSignInButton from '../../components/GoogleSignInButton';
import RecoveryKeyDownloadPrompt from '../../components/RecoveryKeyDownloadPrompt';
import { useImageRotation } from '../../hooks';
import AuthBackground from '../../components/auth/AuthBackground';
import { Turnstile } from '@marsidev/react-turnstile';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons';
import {
  faGoogle as faGoogleBrand,
  faApple,
} from '@fortawesome/free-brands-svg-icons';

const OTP_RESEND_DELAY = 60; // seconds

const SignUpPage = () => {
  const { register } = useAuth();
  const { t } = useTranslation('common');

  // Form state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreeToTerms, setAgreeToTerms] = useState(false);

  // Password strength
  const passwordStrength = useMemo(() => {
    if (!password) return null;
    return zxcvbn(password, [email, firstName, lastName]);
  }, [password, email, firstName, lastName]);

  const passwordChecks = useMemo(() => {
    if (!password) return { minLength: false, uppercase: false, lowercase: false, number: false, special: false };
    return {
      minLength: password.length >= 8,
      uppercase: /[A-Z]/.test(password),
      lowercase: /[a-z]/.test(password),
      number: /[0-9]/.test(password),
      special: /[^A-Za-z0-9]/.test(password),
    };
  }, [password]);

  const allChecksPassed = Object.values(passwordChecks).every(Boolean);
  const [recoveryPhrase, setRecoveryPhrase] = useState(null);

  // Turnstile CAPTCHA
  const [turnstileToken, setTurnstileToken] = useState(null);

  // OTP step state
  const [step, setStep] = useState('form'); // 'form' | 'otp'
  const [otpCode, setOtpCode] = useState('');
  const [resendCountdown, setResendCountdown] = useState(0);

  // Device fingerprint (collected silently on mount)
  const fingerprintRef = useRef(null);

  const { currentImage } = useImageRotation(4000);

  // Collect device fingerprint on mount (non-blocking)
  useEffect(() => {
    getDeviceFingerprint().then((fp) => {
      fingerprintRef.current = fp;
    });
  }, []);

  // Resend countdown timer
  useEffect(() => {
    if (resendCountdown <= 0) return;
    const timer = setTimeout(() => setResendCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendCountdown]);

  // Step 1: Validate form and send OTP
  const handleSendOtp = async (e) => {
    e.preventDefault();
    setError('');

    if (!agreeToTerms) {
      setError('Please agree to the Terms & Conditions');
      return;
    }

    if (!allChecksPassed) {
      setError('Password must be at least 8 characters with uppercase, lowercase, number, and special character');
      return;
    }

    if (passwordStrength && passwordStrength.score < 2) {
      setError('Password is too weak. Avoid common words and patterns.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      await authService.sendSignupOtp(email.trim(), turnstileToken);
      setStep('otp');
      setResendCountdown(OTP_RESEND_DELAY);
    } catch (err) {
      console.error('Send OTP error:', err);
      setError(
        err.response?.data?.message ||
          err.message ||
          'Failed to send verification code. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  // Resend OTP
  const handleResendOtp = async () => {
    if (resendCountdown > 0) return;
    setError('');
    setLoading(true);

    try {
      await authService.sendSignupOtp(email.trim(), turnstileToken);
      setResendCountdown(OTP_RESEND_DELAY);
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.message ||
          'Failed to resend code.',
      );
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Verify OTP and complete registration
  const handleVerifyAndRegister = async (e) => {
    e.preventDefault();
    setError('');

    if (otpCode.length !== 6) {
      setError('Please enter the 6-digit verification code');
      return;
    }

    setLoading(true);

    try {
      const displayName = `${firstName.trim()} ${lastName.trim()}`.trim();
      const result = await register(
        email.trim(),
        password.trim(),
        displayName,
        otpCode.trim(),
        fingerprintRef.current,
      );
      if (result.success) {
        // Mark that onboarding should be shown after landing on dashboard
        console.log('📝 Setting onboarding flag during registration...');
        localStorage.setItem('aamenn_pending_onboarding', 'true');
        console.log(
          '📝 Onboarding flag set:',
          localStorage.getItem('aamenn_pending_onboarding'),
        );
        if (result.recoveryPhrase) {
          setRecoveryPhrase(result.recoveryPhrase);
        } else {
          window.location.href = '/folders';
        }
      } else {
        setError(result.error);
      }
    } catch (err) {
      console.error('Register error:', err);
      let message;
      if (err.isApiError) {
        message = err.details
          ? Object.values(err.details).join('. ')
          : err.message;
      } else {
        const respMsg = err.response?.data?.message;
        message = Array.isArray(respMsg) ? respMsg.join('. ') : respMsg;
      }
      setError(
        message ||
        t(
          'errors.unexpectedError',
          'An unexpected error occurred. Please try again.',
        ),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {recoveryPhrase && (
        <RecoveryKeyDownloadPrompt
          recoveryPhrase={recoveryPhrase}
          onDismiss={() => {
            setRecoveryPhrase(null);
            window.location.href = '/folders';
          }}
        />
      )}
      <div className="min-h-screen flex bg-black">
        <AuthBackground currentImage={currentImage} />

        {/* Right Section - Form */}
        <div className="w-full lg:w-1/2 flex items-center justify-center p-8">
          <div className="w-full max-w-md">
            {/* Logo */}
            <div className="flex justify-center mb-12">
              <img src="/loginbanner.png" alt="Aamenn Logo" className="w-75 h-25" />
            </div>

            <div className="mb-8">
              <h1 className="text-4xl font-bold text-white mb-3">
                {t('auth.createAccount', 'Create an account')}
              </h1>
              <p className="text-gray-400">
                {t('auth.alreadyHaveAccount', 'Already have an account?')}{' '}
                <Link
                  to="/login"
                  className="text-blue-400 hover:text-blue-300 font-medium"
                >
                  {t('auth.login', 'Log in')}
                </Link>
              </p>
            </div>

            {error && (
              <div className="mb-6 p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg">
                {error}
              </div>
            )}

            {step === 'form' ? (
              <>
                <form onSubmit={handleSendOtp} className="space-y-4">
                  {/* First Name & Last Name */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <input
                        type="text"
                        placeholder={t('auth.firstName', 'First name')}
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="w-full px-4 py-3 bg-[#0a0a0a] border border-gray-800 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
                        required
                      />
                    </div>
                    <div>
                      <input
                        type="text"
                        placeholder={t('auth.lastName', 'Last name')}
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className="w-full px-4 py-3 bg-[#0a0a0a] border border-gray-800 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
                        required
                      />
                    </div>
                  </div>

                  {/* Email */}
                  <div>
                    <input
                      type="email"
                      placeholder={t('auth.email', 'Email')}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-4 py-3 bg-[#0a0a0a] border border-gray-800 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors"
                      required
                    />
                  </div>

                  {/* Password */}
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder={t('auth.enterPassword', 'Enter your password')}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-4 py-3 bg-[#0a0a0a] border border-gray-800 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors pr-12"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300"
                    >
                      {showPassword ? (
                        <FontAwesomeIcon icon={faEyeSlash} className="w-5 h-5" />
                      ) : (
                        <FontAwesomeIcon icon={faEye} className="w-5 h-5" />
                      )}
                    </button>
                  </div>

                  {/* Password strength meter */}
                  {password && (
                    <div className="space-y-1.5">
                      <div className="flex gap-1">
                        {[0, 1, 2, 3, 4].map((i) => {
                          const checksPassed = Object.values(passwordChecks).filter(Boolean).length;
                          const score = allChecksPassed && passwordStrength
                            ? Math.max(checksPassed - 1, passwordStrength.score)
                            : checksPassed - 1;
                          const colors = ['bg-red-500', 'bg-orange-500', 'bg-yellow-500', 'bg-green-400', 'bg-green-500'];
                          const color = score >= 0 ? colors[Math.min(score, 4)] : 'bg-gray-800';
                          return (
                            <div
                              key={i}
                              className={`h-1 flex-1 rounded-full transition-all duration-300 ${
                                i <= score ? color : 'bg-gray-800'
                              }`}
                            />
                          );
                        })}
                      </div>
                      <p className={`text-xs ${
                        !allChecksPassed
                          ? 'text-gray-500'
                          : passwordStrength
                            ? ['text-red-400', 'text-orange-400', 'text-yellow-400', 'text-green-400', 'text-green-500'][passwordStrength.score]
                            : 'text-gray-500'
                      }`}>
                        {!allChecksPassed
                          ? 'Use 8+ chars, uppercase, lowercase, number & special character'
                          : passwordStrength && ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'][passwordStrength.score]}
                      </p>
                    </div>
                  )}

                  {/* Confirm Password */}
                  <div className="relative">
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      placeholder={t('auth.confirmPassword', 'Confirm password')}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full px-4 py-3 bg-[#0a0a0a] border border-gray-800 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 transition-colors pr-12"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-300"
                    >
                      {showConfirmPassword ? (
                        <FontAwesomeIcon icon={faEyeSlash} className="w-5 h-5" />
                      ) : (
                        <FontAwesomeIcon icon={faEye} className="w-5 h-5" />
                      )}
                    </button>
                  </div>

                  {/* Terms & Conditions */}
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      id="terms"
                      checked={agreeToTerms}
                      onChange={(e) => setAgreeToTerms(e.target.checked)}
                      className="mt-1 w-4 h-4 rounded border-gray-800 bg-[#0a0a0a] text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
                    />
                    <label htmlFor="terms" className="text-sm text-gray-400">
                      {t('auth.agreeTerms', 'I agree to the')}{' '}
                      <Link
                        to="/terms"
                        className="text-blue-400 hover:text-blue-300"
                      >
                        Terms & Conditions
                      </Link>
                    </label>
                  </div>

                  {/* Turnstile CAPTCHA */}
                  {import.meta.env.VITE_TURNSTILE_SITE_KEY && (
                    <div className="flex justify-center">
                      <Turnstile
                        siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY}
                        onSuccess={(token) => setTurnstileToken(token)}
                        onExpire={() => setTurnstileToken(null)}
                        onError={() => setTurnstileToken(null)}
                        options={{ theme: 'dark', size: 'flexible' }}
                      />
                    </div>
                  )}

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={loading || (import.meta.env.VITE_TURNSTILE_SITE_KEY && !turnstileToken)}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading
                      ? t('auth.sendingCode', 'Sending verification code...')
                      : t('auth.createAccount', 'Create account')}
                  </button>
                </form>

                {/* Divider */}
                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-gray-800"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-black text-gray-400">
                      {t('auth.orContinueWith', 'Or continue with')}
                    </span>
                  </div>
                </div>

                {/* Google Sign-In */}
                <GoogleSignInButton
                  onSuccess={() => {
                    window.location.href = '/folders';
                  }}
                  onError={(error) => setError(error)}
                />
              </>
            ) : (
              /* Step 2: OTP Verification */
              <form onSubmit={handleVerifyAndRegister} className="space-y-6">
                <div className="text-center mb-4">
                  <div className="w-16 h-16 bg-blue-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-3xl">✉️</span>
                  </div>
                  <h2 className="text-xl font-semibold text-white mb-2">
                    {t('auth.verifyEmail', 'Verify your email')}
                  </h2>
                  <p className="text-gray-400 text-sm">
                    {t(
                      'auth.otpSentTo',
                      'We sent a 6-digit code to',
                    )}{' '}
                    <span className="text-white font-medium">{email}</span>
                  </p>
                </div>

                {/* OTP Input */}
                <div>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder="000000"
                    value={otpCode}
                    onChange={(e) =>
                      setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))
                    }
                    className="w-full px-4 py-4 bg-[#0a0a0a] border border-gray-800 rounded-lg text-white text-center text-2xl tracking-[0.5em] font-mono placeholder-gray-700 focus:outline-none focus:border-blue-500 transition-colors"
                    autoFocus
                  />
                </div>

                {/* Verify Button */}
                <button
                  type="submit"
                  disabled={loading || otpCode.length !== 6}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading
                    ? t('auth.registering', 'Creating account...')
                    : t('auth.verifyAndCreate', 'Verify & Create account')}
                </button>

                {/* Resend / Back */}
                <div className="flex items-center justify-between text-sm">
                  <button
                    type="button"
                    onClick={() => {
                      setStep('form');
                      setOtpCode('');
                      setError('');
                    }}
                    className="text-gray-400 hover:text-gray-300 transition-colors"
                  >
                    ← {t('auth.backToForm', 'Back')}
                  </button>

                  <button
                    type="button"
                    onClick={handleResendOtp}
                    disabled={resendCountdown > 0 || loading}
                    className="text-blue-400 hover:text-blue-300 disabled:text-gray-600 disabled:cursor-not-allowed transition-colors"
                  >
                    {resendCountdown > 0
                      ? `${t('auth.resendIn', 'Resend in')} ${resendCountdown}s`
                      : t('auth.resendCode', 'Resend code')}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default SignUpPage;
