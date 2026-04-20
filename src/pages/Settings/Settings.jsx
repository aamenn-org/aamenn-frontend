import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DashboardNavbar } from '../../components/layout';
import {
  ProfileSection,
  SecuritySection,
  AppearanceSection,
  StorageSection,
  SubscriptionSection,
} from './sections';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faUser,
  faLock,
  faDatabase,
  faPalette,
  faCreditCard,
} from '@fortawesome/free-solid-svg-icons';

const SECTIONS = {
  profile: 'profile',
  security: 'security',
  storage: 'storage',
  subscription: 'subscription',
  appearance: 'appearance',
};

const Settings = () => {
  const { t } = useTranslation('settings');
  const [activeSection, setActiveSection] = useState(SECTIONS.profile);

  const sidebarItems = [
    { id: SECTIONS.profile, icon: faUser, label: t('sections.account') },
    {
      id: SECTIONS.security,
      icon: faLock,
      label: t('sections.security'),
    },
    { id: SECTIONS.storage, icon: faDatabase, label: t('sections.storage') },
    {
      id: SECTIONS.subscription,
      icon: faCreditCard,
      label: t('sections.subscription', 'Subscription'),
    },
    {
      id: SECTIONS.appearance,
      icon: faPalette,
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
      case SECTIONS.subscription:
        return <SubscriptionSection />;
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
                  const isActive = activeSection === item.id;
                  return (
                    <li key={item.id}>
                      <button
                        onClick={() => setActiveSection(item.id)}
                        className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                          isActive
                            ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-r-2 border-blue-600'
                            : 'text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-zinc-700'
                        }`}
                      >
                        <FontAwesomeIcon icon={item.icon} className="w-5 h-5" />
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
