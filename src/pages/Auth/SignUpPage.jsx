import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context';
import GoogleSignInButton from '../../components/GoogleSignInButton';
import RecoveryKeyDownloadPrompt from '../../components/RecoveryKeyDownloadPrompt';
import { useImageRotation } from '../../hooks';
import AuthBackground from '../../components/auth/AuthBackground';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons';
import {
  faGoogle as faGoogleBrand,
  faApple,
} from '@fortawesome/free-brands-svg-icons';

const SignUpPage = () => {
  const { register } = useAuth();
  const { t } = useTranslation('common');

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
  const [recoveryPhrase, setRecoveryPhrase] = useState(null);

  const { currentImage } = useImageRotation(4000);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!agreeToTerms) {
      setError('Please agree to the Terms & Conditions');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      const displayName = `${firstName.trim()} ${lastName.trim()}`.trim();
      const result = await register(email.trim(), password.trim(), displayName);
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
      setError(
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
            <div className="flex justify-center mb-6">
              <img src="/logo3.png" alt="Aamenn Logo" className="w-20 h-20" />
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

            <form onSubmit={handleSubmit} className="space-y-4">
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

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading
                  ? t('auth.registering', 'Creating account...')
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
          </div>
        </div>
      </div>
    </>
  );
};

export default SignUpPage;
