import { useCallback, useRef } from 'react';
import { SelectionArea as ViSelectArea } from '@viselect/react';

/**
 * Wraps a grid of selectable items with viselect drag-lasso support.
 *
 * Selectable children must have `data-select-id="<prefixed-id>"`.
 * Interactive children that must NOT trigger a lasso start should
 * have `data-no-select` on themselves or a parent.
 *
 * @param {{ children: React.ReactNode, onSelect: (change: {added: string[], removed: string[]}) => void, onClear: () => void }} props
 */
const SelectionArea = ({ children, onSelect, onClear }) => {
  const wasDraggingRef = useRef(false);

  const handleBeforeStart = useCallback(({ event }) => {
    const target = event.target;
    // Prevent lasso when mousedown is on a no-select element or on a card itself
    if (target.closest('[data-no-select]')) return false;
    if (target.closest('[data-select-id]')) return false;
    return true;
  }, []);

  const handleStart = useCallback(
    ({ event, selection }) => {
      // Without ctrl/meta, reset the viselect internal state and clear external state
      if (!event.ctrlKey && !event.metaKey) {
        selection.clearSelection();
        onClear();
      }
    },
    [onClear],
  );

  const handleMove = useCallback(
    ({ store }) => {
      wasDraggingRef.current = true;
      const added = store.changed.added
        .map((el) => el.dataset.selectId)
        .filter(Boolean);
      const removed = store.changed.removed
        .map((el) => el.dataset.selectId)
        .filter(Boolean);

      if (added.length > 0 || removed.length > 0) {
        onSelect({ added, removed });
      }
    },
    [onSelect],
  );

  const handleStop = useCallback(() => {
    // Reset after a short delay so the click event that follows mouseup can check it
    setTimeout(() => { wasDraggingRef.current = false; }, 100);
  }, []);

  const handleClick = useCallback((e) => {
    if (wasDraggingRef.current) return;
    if (e.target.closest('[data-select-id]')) return;
    if (e.target.closest('[data-no-select]')) return;
    onClear();
  }, [onClear]);

  return (
    <div onClick={handleClick}>
      <ViSelectArea
        onBeforeStart={handleBeforeStart}
        onStart={handleStart}
        onMove={handleMove}
        onStop={handleStop}
        selectables="[data-select-id]"
        behaviour={{ overlap: 'keep', scrolling: { speedDivider: 10 } }}
        features={{ deselectOnBlur: false, touch: false }}
        className="viselect-container"
      >
        {children}
      </ViSelectArea>
    </div>
  );
};

export default SelectionArea;
