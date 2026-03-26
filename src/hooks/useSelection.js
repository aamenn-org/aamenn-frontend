import { useState, useCallback, useRef, useMemo } from 'react';

/**
 * Manages drag-lasso + click selection state for files and folders.
 *
 * IDs must be prefixed strings:
 *   - Files:   "file:<fileId>"
 *   - Folders: "folder:<folderId>"
 *
 * @param {Array<{id: string}>} items - All currently visible selectable items (in display order)
 */
export function useSelection(items) {
  const [selectedIds, setSelectedIds] = useState(new Set());
  const lastSelectedRef = useRef(null);

  // Memoised ordered ID list used for shift-range calculation
  const orderedIds = useMemo(() => items.map((i) => i.id), [items]);

  /**
   * Toggle or range-select a single item (for click interactions).
   * @param {string} id - Prefixed ID of the clicked item
   * @param {{ shift?: boolean, ctrl?: boolean }} modifiers
   */
  const toggle = useCallback(
    (id, { shift = false, ctrl = false } = {}) => {
      setSelectedIds((prev) => {
        if (ctrl) {
          const next = new Set(prev);
          if (next.has(id)) {
            next.delete(id);
          } else {
            next.add(id);
          }
          lastSelectedRef.current = id;
          return next;
        }

        if (shift && lastSelectedRef.current) {
          const startIdx = orderedIds.indexOf(lastSelectedRef.current);
          const endIdx = orderedIds.indexOf(id);
          if (startIdx !== -1 && endIdx !== -1) {
            const lo = Math.min(startIdx, endIdx);
            const hi = Math.max(startIdx, endIdx);
            return new Set([...prev, ...orderedIds.slice(lo, hi + 1)]);
          }
        }

        lastSelectedRef.current = id;
        return new Set([id]);
      });
    },
    [orderedIds],
  );

  /**
   * Apply incremental changes produced by the viselect lasso drag.
   * @param {{ added: string[], removed: string[] }} change
   */
  const applyLassoChange = useCallback(({ added, removed }) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      removed.forEach((id) => next.delete(id));
      added.forEach((id) => next.add(id));
      return next;
    });
  }, []);

  /** Select every visible item. */
  const selectAll = useCallback(() => {
    setSelectedIds(new Set(orderedIds));
  }, [orderedIds]);

  /** Clear the entire selection. */
  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    lastSelectedRef.current = null;
  }, []);

  /** Derived: file IDs only (strips the "file:" prefix). */
  const selectedFileIds = useMemo(
    () =>
      [...selectedIds]
        .filter((id) => id.startsWith('file:'))
        .map((id) => id.slice(5)),
    [selectedIds],
  );

  /** Derived: folder IDs only (strips the "folder:" prefix). */
  const selectedFolderIds = useMemo(
    () =>
      [...selectedIds]
        .filter((id) => id.startsWith('folder:'))
        .map((id) => id.slice(7)),
    [selectedIds],
  );

  return {
    selectedIds,
    selectedFileIds,
    selectedFolderIds,
    selectedCount: selectedIds.size,
    toggle,
    applyLassoChange,
    selectAll,
    clearSelection,
  };
}
