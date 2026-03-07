import { useTranslation } from 'react-i18next';

const GalleryTabs = ({ activeTab, onTabChange }) => {
  const { t } = useTranslation('photos');
  
  const tabs = [
    { id: 'photos', label: t('tabs.photos', 'Photos') },
    { id: 'files', label: t('tabs.files', 'Files') },
    { id: 'albums', label: t('tabs.albums', 'Albums') },
    { id: 'favorites', label: t('tabs.favorites', 'Favorites') },
    { id: 'trash', label: t('tabs.trash', 'Trash') },
  ];

  return (
    <div className="flex items-center gap-2 mb-4 md:mb-6 overflow-x-auto scrollbar-hide pb-2">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`
            inline-flex items-center px-3 py-1.5 md:px-4 md:py-2 rounded-full text-xs md:text-sm font-medium
            transition-all duration-200 whitespace-nowrap flex-shrink-0
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
  );
};

export default GalleryTabs;
