import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth, useTheme } from '../../context';

const DashboardNavbar = () => {
  const { user, logout } = useAuth();
  const { isDarkMode, toggleTheme } = useTheme();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef(null);
  const navigate = useNavigate();

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowUserMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    setShowUserMenu(false);
    logout();
  };

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-[#1e3a5f] text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-14">
          {/* Logo */}
          <Link to="/photos" className="flex items-center space-x-2">
            <div className="w-7 h-7 flex items-center justify-center">
              <img src="/logo.png" alt="" />
            </div>
            <span className="text-lg font-bold">AAMENN</span>
          </Link>

          {/* Right Section - User Menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center space-x-2 hover:bg-white/10 rounded-lg p-1.5 transition-colors"
            >
              <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center">
                <span className="text-sm font-medium">
                  {user?.email?.charAt(0).toUpperCase() || 'U'}
                </span>
              </div>
              <svg
                className={`w-4 h-4 transition-transform ${
                  showUserMenu ? 'rotate-180' : ''
                }`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </button>

            {/* Dropdown Menu */}
            {showUserMenu && (
              <div className="absolute end-0 mt-2 w-56 bg-white dark:bg-zinc-800 rounded-lg shadow-lg py-1 z-50 border border-gray-100 dark:border-zinc-700">
                <div className="px-4 py-2 border-b border-gray-100 dark:border-zinc-700">
                  <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                    {user?.email}
                  </p>
                </div>

                {/* Dark Mode Toggle */}
                <button
                  onClick={toggleTheme}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-700 flex items-center justify-between"
                >
                  <div className="flex items-center">
                    {isDarkMode ? (
                      <svg
                        className="w-4 h-4 mr-2 text-yellow-500"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                      </svg>
                    ) : (
                      <svg
                        className="w-4 h-4 mr-2 text-gray-500"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                      </svg>
                    )}
                    <span>{isDarkMode ? 'Light Mode' : 'Dark Mode'}</span>
                  </div>
                  {/* Toggle Switch */}
                  <div
                    className={`relative w-10 h-5 rounded-full transition-colors ${
                      isDarkMode ? 'bg-blue-500' : 'bg-gray-300'
                    }`}
                  >
                    <div
                      className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform ${
                        isDarkMode ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </div>
                </button>

                <div className="border-t border-gray-100 dark:border-zinc-700" />

                {/* Settings Link */}
                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    navigate('/settings');
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-700 flex items-center"
                >
                  <svg
                    className="w-4 h-4 mr-2 text-gray-500 dark:text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                  Settings
                </button>

                <div className="border-t border-gray-100 dark:border-zinc-700" />

                <button
                  onClick={handleLogout}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-700 flex items-center"
                >
                  <svg
                    className="w-4 h-4 mr-2 text-gray-500 dark:text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                    />
                  </svg>
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default DashboardNavbar;
