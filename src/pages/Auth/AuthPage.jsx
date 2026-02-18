import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Navbar } from '../../components/layout';
import { Input, Button } from '../../components/ui';
import { useAuth } from '../../context';

// Icons
const MailIcon = () => (
  <svg
    className="w-5 h-5"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
    />
  </svg>
);

const LockIcon = () => (
  <svg
    className="w-5 h-5"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
    />
  </svg>
);

const EyeIcon = () => (
  <svg
    className="w-5 h-5"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
    />
  </svg>
);

const CheckIcon = () => (
  <svg
    className="w-4 h-4"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M5 13l4 4L19 7"
    />
  </svg>
);

const AuthPage = () => {
  const navigate = useNavigate();
  const { login, register } = useAuth();

  const [isLogin, setIsLogin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Form fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (isLogin) {
        // Login
        const result = await login(email.trim(), password.trim());
        if (result.success) {
          // Redirect based on role
          if (result.role === 'admin') {
            navigate('/dashboard');
          } else {
            navigate('/photos');
          }
        } else {
          setError(result.error);
        }
      } else {
        // Register
        if (password !== confirmPassword) {
          setError('Passwords do not match');
          setLoading(false);
          return;
        }

        if (password.length < 8) {
          setError('Password must be at least 8 characters');
          setLoading(false);
          return;
        }

        // Register with zero-knowledge encryption
        // The register function handles key generation internally
        const result = await register(email.trim(), password.trim());
        if (result.success) {
          // Regular users always go to photos after registration
          navigate('/photos');
        } else {
          setError(result.error);
        }
      }
    } catch (err) {
      console.error('AuthPage: Unexpected error:', err);
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-900">
      <Navbar />

      <main className="pt-16 min-h-screen flex">
        {/* Left Section - Form */}
        <div className="w-full lg:w-1/2 flex items-center justify-center px-4 sm:px-6 lg:px-8 py-12">
          <div className="w-full max-w-md">
            {/* Toggle Buttons */}
            <div className="flex mb-8 bg-gray-100 dark:bg-zinc-800 rounded-lg p-1">
              <button
                type="button"
                onClick={() => {
                  setIsLogin(false);
                  setError('');
                }}
                className={`flex-1 py-3 px-4 text-sm font-medium rounded-md transition-all duration-200 ${
                  !isLogin
                    ? 'bg-white dark:bg-zinc-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                Sign Up
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsLogin(true);
                  setError('');
                }}
                className={`flex-1 py-3 px-4 text-sm font-medium rounded-md transition-all duration-200 ${
                  isLogin
                    ? 'bg-white dark:bg-zinc-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                Log In
              </button>
            </div>

            <div className="mb-8">
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
                {isLogin ? 'Welcome back' : 'Create your private photo vault'}
              </h1>
              <p className="text-gray-500 dark:text-gray-400">
                {isLogin
                  ? 'Sign in to access your encrypted photos.'
                  : 'Join thousands protecting their memories securely.'}
              </p>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm rounded-lg">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <Input
                label="Email address"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                icon={<MailIcon />}
                required
              />

              <Input
                label="Password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                icon={<LockIcon />}
                required
              />

              {!isLogin && (
                <>
                  <Input
                    label="Confirm Password"
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    icon={<EyeIcon />}
                    required
                  />

                  {/* Security Notice */}
                  <div className="flex items-start space-x-3 p-3 bg-primary-50 dark:bg-primary-900/20 rounded-lg">
                    <div className="flex-shrink-0 w-5 h-5 bg-primary-500 rounded-full flex items-center justify-center mt-0.5">
                      <CheckIcon />
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      Your password is the key used to encrypt your photos
                      locally. We cannot recover it if lost.
                    </p>
                  </div>
                </>
              )}

              <Button
                type="submit"
                variant="primary"
                fullWidth
                loading={loading}
                className="mt-6"
              >
                {isLogin ? 'Log In' : 'Create Account'}
              </Button>

              {isLogin && (
                <button
                  type="button"
                  className="w-full mt-3 text-sm text-primary-600 hover:text-primary-700 font-medium"
                >
                  Forgot your password?
                </button>
              )}
            </form>

            <p className="mt-6 text-center text-sm text-gray-500 dark:text-gray-400">
              {isLogin
                ? "Don't have an account? "
                : 'Already have an account? '}
              <button
                type="button"
                onClick={() => {
                  setIsLogin(!isLogin);
                  setError('');
                }}
                className="text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium"
              >
                {isLogin ? 'Sign up' : 'Log in'}
              </button>
            </p>
          </div>
        </div>

        {/* Right Section - Illustration */}
        <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-gray-50 to-primary-50 dark:from-zinc-800 dark:to-zinc-800 items-center justify-center p-12">
          <div className="max-w-lg text-center">
            {/* Encrypted Card Illustration */}
            <div className="relative mb-12">
              {/* Background cards */}
              <div className="absolute top-4 left-1/2 -translate-x-1/2 w-48 h-56 bg-primary-100 dark:bg-primary-900/50 rounded-2xl transform rotate-6 opacity-60"></div>
              <div className="absolute top-2 left-1/2 -translate-x-1/2 w-48 h-56 bg-primary-50 dark:bg-primary-900/30 rounded-2xl transform -rotate-3 opacity-80"></div>

              {/* Main card */}
              <div className="relative w-52 h-60 bg-white dark:bg-zinc-700 rounded-2xl shadow-xl mx-auto flex flex-col items-center justify-center border border-gray-100 dark:border-zinc-600">
                {/* Status indicator */}
                <div className="absolute top-4 right-4 w-3 h-3 bg-primary-400 rounded-full"></div>

                {/* Lock icon */}
                <div className="w-16 h-16 bg-primary-50 dark:bg-primary-900/50 rounded-2xl flex items-center justify-center mb-4">
                  <svg
                    className="w-8 h-8 text-primary-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                    />
                  </svg>
                </div>

                {/* Encrypted text */}
                <span className="text-sm font-medium text-gray-400 tracking-widest">
                  ENCRYPTED
                </span>
              </div>
            </div>

            {/* Text content */}
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
              Privacy First. Always.
            </h2>
            <p className="text-gray-500 dark:text-gray-400 mb-8">
              Your memories belong to you. We use end-to-end encryption to
              ensure that even we can't see your photos.
            </p>

            {/* Feature badges */}
            <div className="flex items-center justify-center space-x-6">
              <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400">
                <div className="w-5 h-5 bg-primary-100 dark:bg-primary-900/50 rounded-full flex items-center justify-center">
                  <svg
                    className="w-3 h-3 text-primary-600 dark:text-primary-400"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <span className="text-sm">No ads</span>
              </div>
              <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400">
                <div className="w-5 h-5 bg-primary-100 dark:bg-primary-900/50 rounded-full flex items-center justify-center">
                  <svg
                    className="w-3 h-3 text-primary-600 dark:text-primary-400"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <span className="text-sm">No tracking</span>
              </div>
              <div className="flex items-center space-x-2 text-gray-500 dark:text-gray-400">
                <div className="w-5 h-5 bg-primary-100 dark:bg-primary-900/50 rounded-full flex items-center justify-center">
                  <svg
                    className="w-3 h-3 text-primary-600 dark:text-primary-400"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <span className="text-sm">Open source</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 bg-white dark:bg-zinc-900 border-t border-gray-100 dark:border-zinc-800 py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <p className="text-sm text-gray-400 dark:text-gray-500">
            © 2023 AAMENN. All rights reserved.
          </p>
          <div className="flex space-x-6">
            <Link
              to="/terms"
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            >
              Terms of Service
            </Link>
            <Link
              to="/privacy"
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            >
              Privacy Policy
            </Link>
            <Link
              to="/help"
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            >
              Help Center
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default AuthPage;
