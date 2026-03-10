import { useTranslation } from 'react-i18next';

const GalleryTabs = ({ activeTab, onTabChange }) => {
  const { t } = useTranslation('photos');
  
  const tabs = [
    { id: 'folders', label: t('tabs.folders', 'Folders') },
    { id: 'files', label: t('tabs.files', 'Files') },
    { id: 'photos', label: t('tabs.photos', 'Photos') },
    { id: 'favorites', label: t('tabs.favorites', 'Favorites') },
    { id: 'contacts', label: t('tabs.contacts', 'Contacts') },
    { id: 'trash', label: t('tabs.trash', 'Trash') },
  ];

  return (
    <div >
      {/* Mobile: Dropdown */}
      <div className="md:hidden">
        <select
          value={activeTab}
          onChange={(e) => onTabChange(e.target.value)}
          className=" px-4 border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#1e3a5f] focus:border-transparent"
        >
          {tabs.map((tab) => (
            <option key={tab.id} value={tab.id}>
              {tab.label}
            </option>
          ))}
        </select>
      </div>

      {/* Desktop: Normal Tabs */}
      <div className="hidden md:flex items-center gap-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`
              inline-flex items-center px-4 py-2 rounded-full text-sm font-medium
              transition-all duration-200 whitespace-nowrap
              ${
                activeTab === tab.id
                  ? 'bg-[#1e3a5f] text-white'
                  : 'bg-white dark:bg-zinc-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-zinc-700 hover:border-gray-300 dark:hover:border-zinc-600'
              }
            `}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
};

export default GalleryTabs;
