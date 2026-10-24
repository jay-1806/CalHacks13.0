import { useCallback, useEffect, useRef, useState } from 'react';
import './RegionSelectOverlay.css';

interface DipRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function normalizeRect(a: { x: number; y: number }, b: { x: number; y: number }): DipRect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const width = Math.abs(b.x - a.x);
  const height = Math.abs(b.y - a.y);
  return { x, y, width, height };
}

export default function RegionSelectOverlay() {
  const [active, setActive] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragCurrent, setDragCurrent] = useState<{ x: number; y: number } | null>(null);
  const activeRef = useRef(false);

  const cancel = useCallback(() => {
    setActive(false);
    setDragStart(null);
    setDragCurrent(null);
    activeRef.current = false;
    window.electronAPI.cancelRegionSelect();
  }, []);

  const confirm = useCallback(
    async (rect: DipRect) => {
      if (rect.width < 20 || rect.height < 20) {
        cancel();
        return;
      }
      setActive(false);
      setDragStart(null);
      setDragCurrent(null);
      activeRef.current = false;
      await window.electronAPI.confirmRegionSelect(rect);
    },
    [cancel]
  );

  useEffect(() => {
    window.electronAPI.onRegionSelectStart(() => {
      setActive(true);
      activeRef.current = true;
      setDragStart(null);
      setDragCurrent(null);
      window.electronAPI.setIgnoreMouseEvents(false);
    });

    window.electronAPI.onRegionSelectCancel(() => {
      setActive(false);
      activeRef.current = false;
      setDragStart(null);
      setDragCurrent(null);
    });
  }, []);

  useEffect(() => {
    if (!active) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active, cancel]);

  if (!active) return null;

  const selection =
    dragStart && dragCurrent ? normalizeRect(dragStart, dragCurrent) : null;

  return (
    <div
      className="region-select-layer"
      onMouseDown={(e) => {
        if (e.button !== 0) return;
        setDragStart({ x: e.clientX, y: e.clientY });
        setDragCurrent({ x: e.clientX, y: e.clientY });
      }}
      onMouseMove={(e) => {
        if (!dragStart) return;
        setDragCurrent({ x: e.clientX, y: e.clientY });
      }}
      onMouseUp={(e) => {
        if (!dragStart) return;
        const rect = normalizeRect(dragStart, { x: e.clientX, y: e.clientY });
        setDragStart(null);
        setDragCurrent(null);
        void confirm(rect);
      }}
    >
      <div className="region-select-hint">
        Drag to select an area · Esc to cancel
      </div>
      {selection && selection.width > 0 && selection.height > 0 && (
        <div
          className="region-select-box"
          style={{
            left: selection.x,
            top: selection.y,
            width: selection.width,
            height: selection.height,
          }}
        />
      )}
    </div>
  );
}
