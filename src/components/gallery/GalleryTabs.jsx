const GalleryTabs = ({ activeTab, onTabChange }) => {
  const tabs = [
    { id: 'photos', label: 'Photos' },
    { id: 'albums', label: 'Albums' },
    { id: 'favorites', label: 'Favorites' },
  ];

  return (
    <div className="flex items-center space-x-2 mb-6">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`
            inline-flex items-center px-4 py-2 rounded-full text-sm font-medium
            transition-all duration-200
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
