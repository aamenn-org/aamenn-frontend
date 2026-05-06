import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context';
import { folderService } from '../../services';
import { decryptFilename } from '../../utils/crypto';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronRight, faSpinner } from '@fortawesome/free-solid-svg-icons';

// ─── Folder colour icon ───────────────────────────────────────────────────────
const FolderIconSvg = ({ color = '#EF9F27', size = 16 }) => (
  <svg viewBox="0 0 44 36" fill="none" xmlns="http://www.w3.org/2000/svg"
    style={{ width: size, height: size * 0.82, flexShrink: 0 }}>
    <rect x="2" y="0" width="14" height="7" rx="3" fill={color} opacity="0.85" />
    <rect x="2" y="5" width="40" height="29" rx="4" fill={color} />
    <rect x="2" y="10" width="40" height="1.5" fill="white" opacity="0.12" />
  </svg>
);

// ─── Single tree node ─────────────────────────────────────────────────────────
const FolderTreeNode = ({ folderId, nameEncrypted, depth = 0, activeFolderId, onNavigate }) => {
  const { getMasterKey, hasMasterKey } = useAuth();
  const [decryptedName, setDecryptedName] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState([]);
  const [loadingChildren, setLoadingChildren] = useState(false);
  const [childrenLoaded, setChildrenLoaded] = useState(false);

  const isActive = activeFolderId === folderId;

  // Decrypt name
  useEffect(() => {
    let cancelled = false;
    const decrypt = async () => {
      if (!nameEncrypted || !hasMasterKey()) { setDecryptedName(null); return; }
      try {
        const name = await decryptFilename(nameEncrypted, getMasterKey());
        if (!cancelled) setDecryptedName(name);
      } catch {
        if (!cancelled) setDecryptedName('Folder');
      }
    };
    decrypt();
    return () => { cancelled = true; };
  }, [nameEncrypted, getMasterKey, hasMasterKey]);

  // Load children when expanded for the first time
  const handleToggle = useCallback(async (e) => {
    e.stopPropagation();
    if (!expanded && !childrenLoaded) {
      setLoadingChildren(true);
      try {
        const data = await folderService.listFolders(folderId);
        const folders = data?.folders || data || [];
        setChildren(Array.isArray(folders) ? folders : []);
        setChildrenLoaded(true);
      } catch (err) {
        console.error('[FolderTree] Failed to load children:', err);
        setChildren([]);
        setChildrenLoaded(true);
      } finally {
        setLoadingChildren(false);
      }
    }
    setExpanded((v) => !v);
  }, [expanded, childrenLoaded, folderId]);

  const handleClick = useCallback((e) => {
    e.stopPropagation();
    onNavigate?.(folderId);
  }, [folderId, onNavigate]);

  const paddingLeft = 8 + depth * 16;

  return (
    <div>
      <div
        className={`flex items-center gap-1 py-1 pr-2 rounded-lg cursor-pointer transition-colors group ${
          isActive
            ? 'bg-white/20 text-white'
            : 'text-white/70 hover:bg-white/10 hover:text-white'
        }`}
        style={{ paddingLeft }}
        onClick={handleClick}
      >
        {/* Expand / collapse toggle */}
        <button
          onClick={handleToggle}
          className="w-4 h-4 flex items-center justify-center flex-shrink-0 rounded hover:bg-white/20 transition-colors"
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          {loadingChildren ? (
            <FontAwesomeIcon icon={faSpinner} className="animate-spin text-[10px]" />
          ) : (
            <FontAwesomeIcon
              icon={faChevronRight}
              className={`text-[9px] transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
            />
          )}
        </button>

        {/* Folder icon */}
        <FolderIconSvg color={isActive ? '#60a5fa' : '#EF9F27'} size={16} />

        {/* Name */}
        <span className="text-xs font-medium truncate flex-1 min-w-0">
          {decryptedName ?? '…'}
        </span>
      </div>

      {/* Children */}
      {expanded && childrenLoaded && children.length > 0 && (
        <div>
          {children.map((child) => (
            <FolderTreeNode
              key={child.folderId}
              folderId={child.folderId}
              nameEncrypted={child.nameEncrypted}
              depth={depth + 1}
              activeFolderId={activeFolderId}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Root tree: loads top-level folders ──────────────────────────────────────
const FolderTree = ({ activeFolderId, onNavigate }) => {
  const [rootFolders, setRootFolders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await folderService.listFolders(null);
        const folders = data?.folders || data || [];
        if (!cancelled) setRootFolders(Array.isArray(folders) ? folders : []);
      } catch (err) {
        console.error('[FolderTree] Failed to load root folders:', err);
        if (!cancelled) setRootFolders([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-white/50 text-xs">
        <FontAwesomeIcon icon={faSpinner} className="animate-spin" />
        <span>Loading…</span>
      </div>
    );
  }

  if (rootFolders.length === 0) {
    return (
      <div className="px-3 py-2 text-white/40 text-xs">No folders yet</div>
    );
  }

  return (
    <div className="px-1">
      {rootFolders.map((folder) => (
        <FolderTreeNode
          key={folder.folderId}
          folderId={folder.folderId}
          nameEncrypted={folder.nameEncrypted}
          depth={0}
          activeFolderId={activeFolderId}
          onNavigate={onNavigate}
        />
      ))}
    </div>
  );
};

export default FolderTree;
