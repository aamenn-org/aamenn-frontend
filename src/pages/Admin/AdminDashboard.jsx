import { useState, useEffect } from 'react';
import { Routes, Route, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context';
import { adminService } from '../../services';
import {
  LayoutDashboard,
  Users,
  HardDrive,
  Activity,
  AlertTriangle,
  LogOut,
  Menu,
  X,
  Bell,
} from 'lucide-react';

// Sub-pages
import Overview from './Overview';
import UsersPage from './Users';
import Storage from './Storage';
import SystemHealth from './SystemHealth';

const AdminDashboard = () => {
  const { logout, user } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(true);
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
      icon: LayoutDashboard,
      exact: true,
    },
    { path: '/dashboard/users', label: 'Users', icon: Users },
    { path: '/dashboard/storage', label: 'Storage', icon: HardDrive },
    { path: '/dashboard/health', label: 'System Health', icon: Activity },
  ];

  const criticalAlerts = alerts.filter(
    (a) => a.type === 'error' || a.type === 'warning'
  );

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? 'w-64' : 'w-20'
        } bg-white dark:bg-gray-800 shadow-lg transition-all duration-300 flex flex-col`}
      >
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-gray-200 dark:border-gray-700">
          {sidebarOpen && (
            <span className="text-xl font-bold text-blue-600 dark:text-blue-400">
              Aamenn Admin
            </span>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
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
              <item.icon size={20} />
              {sidebarOpen && <span className="ml-3">{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* User & Logout */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-4">
          {sidebarOpen && (
            <div className="text-sm text-gray-500 dark:text-gray-400 mb-2 truncate">
              {user?.email}
            </div>
          )}
          <button
            onClick={handleLogout}
            className="flex items-center w-full px-4 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
          >
            <LogOut size={20} />
            {sidebarOpen && <span className="ml-3">Logout</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col">
        {/* Top Bar */}
        <header className="h-16 bg-white dark:bg-gray-800 shadow-sm flex items-center justify-between px-6">
          <h1 className="text-xl font-semibold text-gray-800 dark:text-white">
            Admin Dashboard
          </h1>
          <div className="flex items-center gap-4">
            {/* Alerts indicator */}
            {criticalAlerts.length > 0 && (
              <div className="relative">
                <Bell className="text-orange-500" size={24} />
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                  {criticalAlerts.length}
                </span>
              </div>
            )}
          </div>
        </header>

        {/* Alert Banner */}
        {criticalAlerts.length > 0 && (
          <div className="bg-orange-50 dark:bg-orange-900/20 border-b border-orange-200 dark:border-orange-800 px-6 py-3">
            <div className="flex items-center gap-2 text-orange-700 dark:text-orange-400">
              <AlertTriangle size={18} />
              <span className="font-medium">
                {criticalAlerts.length} active alert
                {criticalAlerts.length > 1 ? 's' : ''}
              </span>
              <span className="text-sm">- {criticalAlerts[0]?.message}</span>
            </div>
          </div>
        )}

        {/* Page Content */}
        <div className="flex-1 p-6 overflow-auto">
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
