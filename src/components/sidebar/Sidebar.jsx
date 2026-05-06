import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth, useTheme } from '../../context';
import { userService } from '../../services';
import { useTranslation } from 'react-i18next';
import FolderTree from './FolderTree';
import SidebarNavItem from './SidebarNavItem';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCloud,
  faHeart,
  faTrash,
  faUsers,
  faCog,
  faChevronDown,
  faChevronUp,
  faSignOutAlt,
  faSun,
  faMoon,
  faXmark,
  faCommentDots,
} from '@fortawesome/free-solid-svg-icons';

// ─── Storage bar inside sidebar ───────────────────────────────────────────────
const SidebarStorageBar = ({ refreshTrigger }) => {
  const [storageData, setStorageData] = useState(null);
  const lastFetchRef = useRef(0);

  useEffect(() => {
    const fetch = async () => {
      try {
        const data = await userService.getStorageUsage();
        setStorageData(data);
        lastFetchRef.current = Date.now();
      } catch { /* ignore */ }
    };
    fetch();
  }, [refreshTrigger]);

  if (!storageData) return null;

  const { usedGb, limitGb, percentUsed, exceeded } = storageData;
  const barColor = exceeded || percentUsed >= 90 ? '#ef4444' : percentUsed >= 70 ? '#f59e0b' : '#60a5fa';

  return (
    <div className="px-3 py-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] text-white/50">
          {(usedGb * 1024).toFixed(0)} MB of {limitGb} GB
        </span>
      </div>
      <div className="w-full bg-white/15 rounded-full h-1 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${Math.min(percentUsed, 100)}%`, background: barColor }}
        />
      </div>
    </div>
  );
};

// ─── Sidebar ─────────────────────────────────────────────────────────────────
const Sidebar = ({
  activeSection,
  currentFolderId,
  onNavigateFolder,
  onSectionChange,
  isOpen,
  onClose,
  storageRefreshTrigger = 0,
  onFeedback,
}) => {
  const navigate = useNavigate();
  const { user, logout, avatarUrl } = useAuth();
  const { isDarkMode, toggleTheme } = useTheme();
  const { t } = useTranslation('common');
  const [cloudDriveExpanded, setCloudDriveExpanded] = useState(true);

  const handleFolderNavigate = (folderId) => {
    onNavigateFolder?.(folderId);
    onClose?.();
  };

  const handleSection = (section) => {
    onSectionChange?.(section);
    onClose?.();
  };

  const handleCloudDriveClick = () => {
    handleSection('folders');
    navigate('/folders');
  };

  return (
    <>
      {/* Mobile backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-30 md:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={`
          fixed md:relative top-0 left-0 z-40 md:z-auto
          h-full
          w-60 flex-shrink-0
          bg-[#1a2e4a] dark:bg-[#141f30]
          flex flex-col
          transition-transform duration-200 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}
      >
        {/* ── Top: Logo + mobile close ── */}
        <div className="flex items-center justify-between px-3 h-14 flex-shrink-0 border-b border-white/10">
          <Link to="/folders" className="flex items-center gap-2" onClick={() => { handleSection('folders'); }}>
            <div className="w-7 h-7 flex items-center justify-center flex-shrink-0">
              <img src="/newlogo.png" alt="Aamenn" />
            </div>
            <span className="text-white text-base font-bold tracking-wide">Aamenn</span>
          </Link>
          {/* Mobile close button */}
          <button
            onClick={onClose}
            className="md:hidden p-1 rounded hover:bg-white/10 text-white/60 hover:text-white transition-colors"
            aria-label="Close sidebar"
          >
            <FontAwesomeIcon icon={faXmark} className="w-4 h-4" />
          </button>
        </div>

        {/* ── Scrollable nav content ── */}
        <div className="flex-1 overflow-y-auto py-2 space-y-1 min-h-0">

          {/* Cloud Drive section */}
          <div>
            <div
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-colors cursor-pointer ${
                activeSection === 'folders' && !currentFolderId
                  ? 'bg-white/20 text-white'
                  : 'text-white/80 hover:bg-white/10 hover:text-white'
              }`}
              onClick={handleCloudDriveClick}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && handleCloudDriveClick()}
            >
              <FontAwesomeIcon icon={faCloud} className="w-4 h-4 flex-shrink-0" />
              <span className="flex-1 text-left truncate">Cloud Drive</span>
              <button
                onClick={(e) => { e.stopPropagation(); setCloudDriveExpanded((v) => !v); }}
                className="w-5 h-5 flex items-center justify-center rounded hover:bg-white/20 transition-colors"
                aria-label={cloudDriveExpanded ? 'Collapse' : 'Expand'}
              >
                <FontAwesomeIcon
                  icon={cloudDriveExpanded ? faChevronUp : faChevronDown}
                  className="text-[10px]"
                />
              </button>
            </div>

            {cloudDriveExpanded && (
              <div className="mt-0.5 ml-2">
                <FolderTree
                  activeFolderId={activeSection === 'folders' ? currentFolderId : null}
                  onNavigate={handleFolderNavigate}
                />
              </div>
            )}
          </div>

          <div className="border-t border-white/10 my-1" />

          <div className="px-1 space-y-0.5">
            <SidebarNavItem
              icon={<FontAwesomeIcon icon={faHeart} className="w-4 h-4" />}
              label="Favorites"
              isActive={activeSection === 'favorites'}
              onClick={() => { handleSection('favorites'); navigate('/favorites'); }}
            />
            <SidebarNavItem
              icon={<FontAwesomeIcon icon={faTrash} className="w-4 h-4" />}
              label="Trash"
              isActive={activeSection === 'trash'}
              onClick={() => { handleSection('trash'); navigate('/trash'); }}
            />
            <SidebarNavItem
              icon={<FontAwesomeIcon icon={faUsers} className="w-4 h-4" />}
              label="Contacts"
              isActive={activeSection === 'contacts'}
              onClick={() => { handleSection('contacts'); navigate('/contacts'); }}
            />
          </div>
        </div>

        {/* ── Fixed bottom: Storage + Settings + User ── */}
        <div className="border-t border-white/10 flex-shrink-0">
          <SidebarStorageBar refreshTrigger={storageRefreshTrigger} />

          <div className="px-1 pb-1 space-y-0.5">
            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-white/60 hover:bg-white/10 hover:text-white/90"
            >
              <span className="w-4 flex-shrink-0 flex items-center justify-center">
                <FontAwesomeIcon icon={isDarkMode ? faSun : faMoon} className="w-4 h-4" />
              </span>
              <span className="truncate">{isDarkMode ? t('lightMode', 'Light Mode') : t('darkMode', 'Dark Mode')}</span>
            </button>

            {/* Feedback */}
            <button
              onClick={() => { onFeedback?.(); onClose?.(); }}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-white/60 hover:bg-white/10 hover:text-white/90"
            >
              <span className="w-4 flex-shrink-0 flex items-center justify-center">
                <FontAwesomeIcon icon={faCommentDots} className="w-4 h-4" />
              </span>
              <span className="truncate">Feedback</span>
            </button>

            {/* Settings — with avatar */}
            <button
              onClick={() => navigate('/settings')}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-white/60 hover:bg-white/10 hover:text-white/90"
            >
              {/* Avatar circle */}
              <div className="w-5 h-5 flex-shrink-0 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center overflow-hidden">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[9px] font-bold text-white">
                    {user?.email?.charAt(0).toUpperCase() || 'U'}
                  </span>
                )}
              </div>
              <span className="truncate flex-1 text-left">
                {user?.email ? user.email.split('@')[0] : 'Settings'}
              </span>
              <FontAwesomeIcon icon={faCog} className="w-3 h-3 opacity-50 flex-shrink-0" />
            </button>

            {/* Logout */}
            <button
              onClick={logout}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-white/60 hover:bg-white/10 hover:text-red-400"
            >
              <span className="w-4 flex-shrink-0 flex items-center justify-center">
                <FontAwesomeIcon icon={faSignOutAlt} className="w-4 h-4" />
              </span>
              <span className="truncate">{t('logout', 'Logout')}</span>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
