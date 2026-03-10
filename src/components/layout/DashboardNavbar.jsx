import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth, useTheme } from '../../context';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faChevronDown, 
  faSun, 
  faMoon, 
  faCog,
  faSignOutAlt,
  faUser
} from '@fortawesome/free-solid-svg-icons';

const DashboardNavbar = () => {
  const { user, logout, avatarUrl } = useAuth();
  const { isDarkMode, toggleTheme } = useTheme();
  const { t } = useTranslation('common');
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
              <img src="/logo3.png" alt="" />
            </div>
            <span className="text-lg font-bold">AAMENN</span>
          </Link>

          {/* Right Section - User Menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center space-x-2 hover:bg-white/10 rounded-lg p-1.5 transition-colors"
            >
              <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center overflow-hidden">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt=""
                    className="w-full h-full object-cover"
                    onError={() => {
                      // Silently fallback if URL is invalid
                    }}
                  />
                ) : (
                  <span className="text-sm font-medium">
                    {user?.email?.charAt(0).toUpperCase() || 'U'}
                  </span>
                )}
              </div>
              <FontAwesomeIcon icon={faChevronDown} className={`w-4 h-4 transition-transform ${
                  showUserMenu ? 'rotate-180' : ''
                }`} />
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
                      <FontAwesomeIcon icon={faSun} className="w-4 h-4 mr-2 text-yellow-500" />
                    ) : (
                      <FontAwesomeIcon icon={faMoon} className="w-4 h-4 mr-2 text-gray-500" />
                    )}
                    <span>{isDarkMode ? t('lightMode', 'Light Mode') : t('darkMode', 'Dark Mode')}</span>
                  </div>
                  {/* Toggle Switch */}
                  <div
                    className={`relative w-10 h-5 rounded-full transition-colors ${
                      isDarkMode ? 'bg-blue-500' : 'bg-gray-300'
                    }`}
                  >
                    <div
                      className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-all ${
                        isDarkMode ? 'ltr:left-5 rtl:right-5' : 'ltr:left-0.5 rtl:right-0.5'
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
                  <FontAwesomeIcon icon={faCog} className="w-4 h-4 mr-2 text-gray-500 dark:text-gray-400" />
                  {t('settings', 'Settings')}
                </button>

                <div className="border-t border-gray-100 dark:border-zinc-700" />

                <button
                  onClick={handleLogout}
                  className="w-full px-4 py-2 text-left text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-700 flex items-center"
                >
                  <FontAwesomeIcon icon={faSignOutAlt} className="w-4 h-4 mr-2 text-gray-500 dark:text-gray-400" />
                  {t('logout', 'Logout')}
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
