/**
 * Module-level drag state for drag-and-drop operations.
 *
 * React synthetic events do NOT reliably preserve dataTransfer.getData()
 * at drop time — it returns empty string in many cases. This module
 * stores drag info in plain JS memory so it's 100% reliable across
 * FolderCard, PhotoCard, and Dashboard.
 */
const dragState = {
  current: null, // { type: 'folder', folderId } | { type: 'files', fileIds: [] }
};

export function setDragState(data) {
  dragState.current = data;
}

export function getDragState() {
  return dragState.current;
}

export function clearDragState() {
  dragState.current = null;
}
