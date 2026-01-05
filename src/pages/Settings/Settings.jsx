import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DashboardNavbar } from '../../components/layout';
import {
  ProfileSection,
  SecuritySection,
  AppearanceSection,
  StorageSection,
} from './sections';

// Icons for sidebar
const UserIcon = () => (
  <svg
    className="w-5 h-5"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
    />
  </svg>
);

const SecurityIcon = () => (
  <svg
    className="w-5 h-5"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
    />
  </svg>
);

const StorageIcon = () => (
  <svg
    className="w-5 h-5"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"
    />
  </svg>
);

const AppearanceIcon = () => (
  <svg
    className="w-5 h-5"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
    />
  </svg>
);

const SECTIONS = {
  profile: 'profile',
  security: 'security',
  storage: 'storage',
  appearance: 'appearance',
};

const Settings = () => {
  const { t } = useTranslation('settings');
  const [activeSection, setActiveSection] = useState(SECTIONS.profile);

  const sidebarItems = [
    { id: SECTIONS.profile, icon: UserIcon, label: t('sections.account') },
    {
      id: SECTIONS.security,
      icon: SecurityIcon,
      label: t('sections.security'),
    },
    { id: SECTIONS.storage, icon: StorageIcon, label: t('sections.storage') },
    {
      id: SECTIONS.appearance,
      icon: AppearanceIcon,
      label: t('sections.appearance'),
    },
  ];

  const renderSection = () => {
    switch (activeSection) {
      case SECTIONS.profile:
        return <ProfileSection />;
      case SECTIONS.security:
        return <SecuritySection />;
      case SECTIONS.storage:
        return <StorageSection />;
      case SECTIONS.appearance:
        return <AppearanceSection />;
      default:
        return <ProfileSection />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-900 pt-14">
      <DashboardNavbar />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar Navigation */}
          <nav className="w-full lg:w-64 flex-shrink-0">
            <div className="bg-white dark:bg-zinc-800 rounded-xl shadow-sm border border-gray-200 dark:border-zinc-700 overflow-hidden">
              <ul className="divide-y divide-gray-200 dark:divide-zinc-700">
                {sidebarItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeSection === item.id;
                  return (
                    <li key={item.id}>
                      <button
                        onClick={() => setActiveSection(item.id)}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors
                          ${
                            isActive
                              ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 border-l-3 border-primary-500'
                              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-700/50'
                          }
                        `}
                      >
                        <Icon />
                        <span>{item.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </nav>

          {/* Main Content Area */}
          <main className="flex-1 min-w-0">{renderSection()}</main>
        </div>
      </div>
    </div>
  );
};

export default Settings;
