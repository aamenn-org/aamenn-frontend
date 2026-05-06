import { useState, useRef, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faPlus,
  faFolderPlus,
  faCloudUpload,
  faFolderOpen,
  faTableCells,
  faList,
  faSearch,
  faHome,
  faChevronRight,
  faBars,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import { useAuth } from '../../context';
import { decryptFilename } from '../../utils/crypto';

// ─── Breadcrumb display ───────────────────────────────────────────────────────
const BreadcrumbPath = ({ breadcrumbs, activeSection, onNavigate }) => {
  const { getMasterKey, hasMasterKey } = useAuth();
  const [decryptedCrumbs, setDecryptedCrumbs] = useState([]);

  useEffect(() => {
    const decrypt = async () => {
      if (!hasMasterKey() || !breadcrumbs?.length) { setDecryptedCrumbs([]); return; }
      const masterKey = getMasterKey();
      const results = await Promise.all(
        breadcrumbs.map(async (crumb) => {
          try {
            const name = await decryptFilename(crumb.nameEncrypted, masterKey);
            return { ...crumb, name };
          } catch {
            return { ...crumb, name: 'Folder' };
          }
        })
      );
      setDecryptedCrumbs(results);
    };
    decrypt();
  }, [breadcrumbs, getMasterKey, hasMasterKey]);

  const sectionLabel = {
    folders: 'Cloud Drive',
    favorites: 'Favorites',
    trash: 'Trash',
    contacts: 'Contacts',
    photos: 'Photos',
    files: 'Files',
  }[activeSection] || 'Cloud Drive';

  return (
    <nav className="flex items-center gap-1 text-sm min-w-0 overflow-hidden">
      <button
        onClick={() => onNavigate?.(null)}
        className="flex items-center gap-1.5 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors whitespace-nowrap font-semibold flex-shrink-0"
      >
        <FontAwesomeIcon icon={faHome} className="w-3.5 h-3.5" />
        <span>{sectionLabel}</span>
      </button>

      {decryptedCrumbs.map((crumb, i) => {
        const isLast = i === decryptedCrumbs.length - 1;
        return (
          <div key={crumb.folderId} className="flex items-center gap-1 flex-shrink-0 min-w-0">
            <FontAwesomeIcon icon={faChevronRight} className="w-2.5 h-2.5 text-gray-400 flex-shrink-0" />
            <button
              onClick={() => !isLast && onNavigate?.(crumb.folderId)}
              disabled={isLast}
              className={`truncate max-w-[140px] transition-colors ${
                isLast
                  ? 'text-gray-900 dark:text-white font-medium cursor-default'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white'
              }`}
            >
              {crumb.name}
            </button>
          </div>
        );
      })}
    </nav>
  );
};

// ─── ContentTopBar ────────────────────────────────────────────────────────────
const ContentTopBar = ({
  activeSection,
  breadcrumbs = [],
  onNavigate,
  onSearch,
  searchValue = '',
  onNewFolder,
  onUpload,
  onUploadFolder,
  viewMode = 'list',
  onViewModeChange,
  hasMasterKey,
  onSidebarToggle,
}) => {
  const [showNewMenu, setShowNewMenu] = useState(false);
  const newMenuRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (newMenuRef.current && !newMenuRef.current.contains(e.target)) {
        setShowNewMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const showActions = ['folders', 'photos', 'files'].includes(activeSection);

  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 flex-shrink-0">
      {/* Mobile hamburger */}
      <button
        onClick={onSidebarToggle}
        className="md:hidden p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-500 dark:text-gray-400 transition-colors flex-shrink-0"
        aria-label="Toggle sidebar"
      >
        <FontAwesomeIcon icon={faBars} className="w-4 h-4" />
      </button>

      {/* Breadcrumbs */}
      <div className="flex-1 min-w-0">
        <BreadcrumbPath
          breadcrumbs={breadcrumbs}
          activeSection={activeSection}
          onNavigate={onNavigate}
        />
      </div>

      {/* Search input */}
      <div className="relative flex-shrink-0">
        <FontAwesomeIcon
          icon={faSearch}
          className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none"
        />
        <input
          type="text"
          value={searchValue}
          onChange={(e) => onSearch?.(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && onSearch?.('')}
          placeholder="Search…"
          className="pl-9 pr-7 py-1.5 text-sm bg-gray-100 dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent w-36 sm:w-52 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
        />
        {searchValue && (
          <button
            onClick={() => onSearch?.('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
            aria-label="Clear search"
          >
            <FontAwesomeIcon icon={faXmark} className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* New button dropdown */}
      {showActions && (
        <div className="relative flex-shrink-0" ref={newMenuRef}>
          <button
            onClick={() => setShowNewMenu((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-[#1e3a5f] hover:bg-[#254b7a] text-white text-sm font-medium rounded-lg transition-colors"
          >
            <FontAwesomeIcon icon={faPlus} className="w-3.5 h-3.5" />
            New
          </button>

          {showNewMenu && (
            <div className="absolute right-0 mt-1.5 w-44 bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 rounded-lg shadow-lg py-1 z-50">
              {activeSection === 'folders' && (
                <button
                  onClick={() => { setShowNewMenu(false); onNewFolder?.(); }}
                  disabled={!hasMasterKey}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors disabled:opacity-50"
                >
                  <FontAwesomeIcon icon={faFolderPlus} className="w-4 h-4 text-amber-500" />
                  New Folder
                </button>
              )}
              <button
                onClick={() => { setShowNewMenu(false); onUpload?.(); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors"
              >
                <FontAwesomeIcon icon={faCloudUpload} className="w-4 h-4 text-blue-500" />
                Upload Files
              </button>
              <button
                onClick={() => { setShowNewMenu(false); onUploadFolder?.(); }}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-zinc-700 transition-colors"
              >
                <FontAwesomeIcon icon={faCloudUpload} className="w-4 h-4 text-blue-500" />
                Upload Folder
              </button>
            </div>
          )}
        </div>
      )}

      {/* View mode toggle */}
      <div className="flex items-center bg-gray-100 dark:bg-zinc-800 rounded-lg p-0.5 flex-shrink-0">
        <button
          onClick={() => onViewModeChange?.('list')}
          className={`p-1.5 rounded-md transition-colors ${
            viewMode === 'list'
              ? 'bg-white dark:bg-zinc-700 shadow-sm text-gray-900 dark:text-white'
              : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
          }`}
          title="List view"
        >
          <FontAwesomeIcon icon={faList} className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onViewModeChange?.('grid')}
          className={`p-1.5 rounded-md transition-colors ${
            viewMode === 'grid'
              ? 'bg-white dark:bg-zinc-700 shadow-sm text-gray-900 dark:text-white'
              : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
          }`}
          title="Grid view"
        >
          <FontAwesomeIcon icon={faTableCells} className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

export default ContentTopBar;
