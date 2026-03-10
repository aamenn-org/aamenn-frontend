import { useState, useEffect } from 'react';
import { Routes, Route, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context';
import { adminService } from '../../services';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faChartLine,
  faUsers,
  faHardDrive,
  faChartArea,
  faTriangleExclamation,
  faRightFromBracket,
  faBars,
  faXmark,
  faBell,
} from '@fortawesome/free-solid-svg-icons';

// Sub-pages
import Overview from './Overview';
import UsersPage from './Users';
import Storage from './Storage';
import SystemHealth from './SystemHealth';

const AdminDashboard = () => {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [alerts, setAlerts] = useState([]);

  // Fetch alerts on mount
  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        const data = await adminService.getAlerts();
        setAlerts(data);
      } catch (error) {
        console.error('Failed to fetch alerts:', error);
      }
    };
    fetchAlerts();
    // Refresh alerts every 5 minutes
    const interval = setInterval(fetchAlerts, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const navItems = [
    {
      path: '/dashboard',
      label: 'Overview',
      icon: faChartLine,
      exact: true,
    },
    { path: '/dashboard/users', label: 'Users', icon: faUsers },
    { path: '/dashboard/storage', label: 'Storage', icon: faHardDrive },
    { path: '/dashboard/health', label: 'System Health', icon: faChartArea },
  ];

  const criticalAlerts = alerts.filter(
    (a) => a.type === 'error' || a.type === 'warning'
  );

  return (
    <div className="min-h-screen h-full bg-gray-100 dark:bg-gray-900 flex">
      {/* Mobile Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0 fixed lg:static inset-y-0 left-0 z-50 w-64 bg-white dark:bg-gray-800 shadow-lg transition-transform duration-300 flex flex-col`}
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-gray-200 dark:border-gray-700">
          <span className="text-xl font-bold text-blue-600 dark:text-blue-400">
            Aamenn Admin
          </span>
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 lg:hidden"
          >
            <FontAwesomeIcon icon={faXmark} className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.exact}
              className={({ isActive }) =>
                `flex items-center px-4 py-3 mx-2 transition-colors ${
                  isActive
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                }`
              }
            >
              <FontAwesomeIcon icon={item.icon} className="w-5 h-5" />
              <span className="ml-3">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        {/* User & Logout */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-4">
          <div className="text-sm text-gray-500 dark:text-gray-400 mb-2 truncate">
            {user?.email}
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center w-full px-4 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors rounded"
          >
            <FontAwesomeIcon icon={faRightFromBracket} className="w-5 h-5" />
            <span className="ml-3">Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col lg:ml-0">
        {/* Top Bar */}
        <header className="h-16 bg-white dark:bg-gray-800 shadow-sm flex items-center justify-between px-4 lg:px-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded lg:hidden"
            >
              <FontAwesomeIcon icon={faBars} className="w-5 h-5" />
            </button>
            <h1 className="text-lg lg:text-xl font-semibold text-gray-800 dark:text-white">
              Admin Dashboard
            </h1>
          </div>
          <div className="flex items-center gap-4">
            {/* Alerts indicator */}
            {criticalAlerts.length > 0 && (
              <div className="relative">
                <FontAwesomeIcon icon={faBell} className="text-orange-500 w-6 h-6" />
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                  {criticalAlerts.length}
                </span>
              </div>
            )}
          </div>
        </header>

        {/* Alert Banner */}
        {criticalAlerts.length > 0 && (
          <div className="bg-orange-50 dark:bg-orange-900/20 border-b border-orange-200 dark:border-orange-800 px-4 lg:px-6 py-3">
            <div className="flex items-center gap-2 text-orange-700 dark:text-orange-400">
              <FontAwesomeIcon icon={faTriangleExclamation} className="w-[18px] h-[18px] flex-shrink-0" />
              <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
                <span className="font-medium">
                  {criticalAlerts.length} active alert
                  {criticalAlerts.length > 1 ? 's' : ''}
                </span>
                <span className="text-sm truncate">- {criticalAlerts[0]?.message}</span>
              </div>
            </div>
          </div>
        )}

        {/* Page Content */}
        <div className="flex-1 p-4 lg:p-6 overflow-auto">
          <Routes>
            <Route index element={<Overview />} />
            <Route path="users" element={<UsersPage />} />
            <Route path="storage" element={<Storage />} />
            <Route path="health" element={<SystemHealth />} />
          </Routes>
        </div>
      </main>
    </div>
  );
};

export default AdminDashboard;
