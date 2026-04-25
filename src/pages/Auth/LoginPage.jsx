import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context';
import GoogleSignInButton from '../../components/GoogleSignInButton';
import { useImageRotation } from '../../hooks';
import AuthBackground from '../../components/auth/AuthBackground';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEye, faEyeSlash } from '@fortawesome/free-solid-svg-icons';
import { faGoogle, faApple } from '@fortawesome/free-brands-svg-icons';

const LoginPage = () => {
  const { login } = useAuth();
  const { t } = useTranslation('common');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);

  const { currentImage } = useImageRotation(4000);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await login(email.trim(), password.trim(), rememberMe);
      if (result.success) {
        // Redirect based on role
        if (result.role === 'admin') {
          window.location.href = '/dashboard';
        } else {
          window.location.href = '/folders';
        }
      } else {
        setError(result.error);
      }
    } catch (err) {
      console.error('Login error:', err);
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
              {t('auth.welcomeBack', 'Welcome back')}
            </h1>
            <p className="text-gray-400">
              {t('auth.dontHaveAccount', "Don't have an account?")}{' '}
              <Link
                to="/register"
                className="text-blue-400 hover:text-blue-300 font-medium"
              >
                {t('auth.signUp', 'Sign up')}
              </Link>
            </p>
          </div>

          {error && (
            <div className="mb-6 p-3 bg-red-500/10 border border-red-500/20 text-red-400 text-sm rounded-lg">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
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

            {/* Remember Me & Forgot Password */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="remember"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-800 bg-[#0a0a0a] text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
                />
                <label htmlFor="remember" className="text-sm text-gray-400">
                  {t('auth.rememberMe', 'Remember me')}
                </label>
              </div>
              <Link
                to="/forgot-password"
                className="text-sm text-blue-400 hover:text-blue-300"
              >
                {t('auth.forgotPassword', 'Forgot password?')}
              </Link>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading
                ? t('auth.loggingIn', 'Logging in...')
                : t('auth.login', 'Log in')}
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
            onSuccess={(result) => {
              if (result.role === 'admin') {
                window.location.href = '/dashboard';
              } else {
                window.location.href = '/folders';
              }
            }}
            onError={(error) => setError(error)}
          />
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
