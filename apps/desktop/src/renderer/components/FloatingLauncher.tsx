import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import LiquidMetalButton from './ui/LiquidMetalButton';
import CircularCommandMenu, { type CommandItem } from './ui/CircularCommandMenu';
import { CaptureIcon, CanvasIcon, MicIcon, TextIcon } from './ui/commandIcons';
import './FloatingLauncher.css';
import {
  DRAG_THRESHOLD_PX,
  computeArcLayout,
  exceedsDragThreshold,
  getCenter,
  isPrimaryButtonDown,
  measurePlusAlignment,
  type ArcLayoutResult,
  type PointerInteraction,
} from '../launcherGeometry';
import {
  resolveAfterExit,
  resolveAfterOpen,
  resolveTriggerIntent,
  shouldFillBuddyWindow,
  shouldHoldArcStage,
  shouldShowMenuItems,
  type MenuIntent,
  type MenuPhase,
} from '../menuLifecycle';
import {
  PRODUCT_DISPLAY_NAME,
  closeMenuProductLabel,
  minimizeProductLabel,
} from '@screentutor/shared';

interface Props {
  state: 'idle' | 'listening' | 'thinking' | 'responding' | 'pointing' | 'error' | 'privacy';
  isExpanded: boolean;
  isRecordingVoice: boolean;
  isSpeaking: boolean;
  menuOpen: boolean;
  onMenuOpenChange: (open: boolean) => void;
  onMenuExitComplete?: () => void;
  onCollapsePanel: () => void;
  onVoice: () => void;
  onCapture: () => void;
  onText: () => void;
  onCanvas: () => void;
  canvasControlsOpen: boolean;
  onCanvasControlsClose: () => void;
  onClearAnnotations: () => void;
}

/**
 * Quicky.AI floating launcher.
 * Menu open/close uses an explicit phase machine so Electron bounds and
 * Framer Motion exit never race (stage offset held through closing).
 */
export default function FloatingLauncher({
  state,
  isExpanded,
  isRecordingVoice,
  isSpeaking,
  menuOpen: _menuOpen,
  onMenuOpenChange,
  onMenuExitComplete,
  onCollapsePanel,
  onVoice,
  onCapture,
  onText,
  onCanvas,
  canvasControlsOpen,
  onCanvasControlsClose,
  onClearAnnotations,
}: Props) {
  const triggerId = useId();
  const stageRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [arcLayout, setArcLayout] = useState<ArcLayoutResult | null>(null);
  const [phase, setPhase] = useState<MenuPhase>('closed');
  const phaseRef = useRef<MenuPhase>('closed');
  const pendingIntentRef = useRef<MenuIntent>(null);
  const pendingActionRef = useRef<(() => void) | null>(null);
  const generationRef = useRef(0);
  const suppressClickRef = useRef(false);
  const interactionRef = useRef<PointerInteraction>('idle');
  const dragSessionRef = useRef<{
    pointerId: number;
    startScreenX: number;
    startScreenY: number;
    originX: number;
    originY: number;
    ready: boolean;
  } | null>(null);
  const listenersRef = useRef<{
    move: (e: PointerEvent) => void;
    up: (e: PointerEvent) => void;
  } | null>(null);

  const setPhaseBoth = useCallback((next: MenuPhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  const items: CommandItem[] = useMemo(
    () => [
      { id: 'voice', label: 'Voice', icon: <MicIcon />, onClick: onVoice },
      { id: 'capture', label: 'Capture screen', icon: <CaptureIcon />, onClick: onCapture },
      { id: 'text', label: 'Ask with text', icon: <TextIcon />, onClick: onText },
      { id: 'canvas', label: 'Canvas controls', icon: <CanvasIcon />, onClick: onCanvas },
    ],
    [onVoice, onCapture, onText, onCanvas]
  );

  const clearWindowListeners = useCallback(() => {
    const listeners = listenersRef.current;
    if (!listeners) return;
    window.removeEventListener('pointermove', listeners.move);
    window.removeEventListener('pointerup', listeners.up);
    window.removeEventListener('pointercancel', listeners.up);
    listenersRef.current = null;
  }, []);

  const endPointerInteraction = useCallback(
    (wasDragging: boolean) => {
      clearWindowListeners();
      interactionRef.current = 'idle';
      dragSessionRef.current = null;
      if (wasDragging) {
        suppressClickRef.current = true;
      }
    },
    [clearWindowListeners]
  );

  useEffect(() => () => clearWindowListeners(), [clearWindowListeners]);

  const finishClose = useCallback(() => {
    const pending = pendingIntentRef.current;
    pendingIntentRef.current = null;
    const result = resolveAfterExit(pending);
    setPhaseBoth('closed');
    setArcLayout(null);

    const runPendingAction = () => {
      const action = pendingActionRef.current;
      pendingActionRef.current = null;
      action?.();
    };

    if (result.shouldReopen) {
      // User requested reopen during close — drop any queued action.
      pendingActionRef.current = null;
      void beginOpenRef.current();
      return;
    }

    onMenuExitComplete?.();
    runPendingAction();
  }, [onMenuExitComplete, setPhaseBoth]);

  const beginClose = useCallback(() => {
    const current = phaseRef.current;
    if (current === 'closed' || current === 'closing') return;

    generationRef.current += 1;
    const hadVisibleItems = current === 'open';
    setPhaseBoth('closing');
    onMenuOpenChange(false);

    if (!hadVisibleItems) {
      // Opening aborted before items mounted — AnimatePresence has nothing to exit.
      queueMicrotask(() => finishClose());
    }
  }, [finishClose, onMenuOpenChange, setPhaseBoth]);

  const beginOpenRef = useRef<() => Promise<void>>(async () => undefined);

  const beginOpen = useCallback(async () => {
    if (phaseRef.current === 'opening' || phaseRef.current === 'open') return;

    const gen = ++generationRef.current;
    setPhaseBoth('opening');
    pendingActionRef.current = null;

    try {
      window.electronAPI.setIgnoreMouseEvents(false);
      const bounds = await window.electronAPI.getMainBounds?.();
      if (gen !== generationRef.current) return;

      if (!bounds?.anchor || !bounds.workArea) {
        setPhaseBoth('closed');
        onMenuOpenChange(true);
        return;
      }

      const layout = computeArcLayout({
        anchor: { x: bounds.anchor.cx, y: bounds.anchor.cy },
        workArea: bounds.workArea,
        itemCount: items.length,
      });

      // Expand once, confirm applied bounds, then mount items in the same turn.
      // No extra rAF wait — that added perceived lag before the first motion frame.
      if (typeof window.electronAPI.setMainBounds === 'function') {
        const applied = await window.electronAPI.setMainBounds(layout.window);
        if (
          applied &&
          (Math.abs(applied.width - layout.window.width) > 2 ||
            Math.abs(applied.height - layout.window.height) > 2)
        ) {
          console.warn('[Quicke] menu bounds mismatch', applied, layout.window);
        }
      } else {
        window.electronAPI.setMainSizeAtAnchor?.(layout.window.width, layout.window.height);
      }
      if (gen !== generationRef.current) return;

      setArcLayout(layout);
      setPhaseBoth('open');
      onMenuOpenChange(true);

      const after = resolveAfterOpen(pendingIntentRef.current);
      pendingIntentRef.current = after.pending;
      if (after.shouldClose) {
        beginClose();
      }
    } catch {
      if (gen !== generationRef.current) return;
      setPhaseBoth('closed');
      setArcLayout(null);
    }
  }, [beginClose, items.length, onMenuOpenChange, setPhaseBoth]);

  beginOpenRef.current = beginOpen;

  /** Silent post-settle measurement for DevTools: window.__quickeLastAlign */
  useEffect(() => {
    if (phase !== 'open' || !arcLayout || isExpanded) return;

    const timer = window.setTimeout(() => {
      const stage = stageRef.current;
      const trigger = triggerRef.current;
      if (!stage || !trigger) return;

      const actionNodes = stage.querySelectorAll<HTMLElement>('.quicke-cmd-item');
      if (actionNodes.length < 4) return;

      const report = measurePlusAlignment(
        getCenter(trigger.getBoundingClientRect()),
        getCenter(actionNodes[0].getBoundingClientRect()),
        getCenter(actionNodes[1].getBoundingClientRect()),
        getCenter(actionNodes[2].getBoundingClientRect()),
        getCenter(actionNodes[3].getBoundingClientRect())
      );

      (
        window as Window & {
          __quickeLastAlign?: ReturnType<typeof measurePlusAlignment>;
        }
      ).__quickeLastAlign = report;
    }, 450);

    return () => window.clearTimeout(timer);
  }, [phase, arcLayout, isExpanded]);

  const accessibleName = (() => {
    if (isExpanded) return minimizeProductLabel();
    if (phase === 'open' || phase === 'opening') return closeMenuProductLabel();
    switch (state) {
      case 'listening':
        return `${PRODUCT_DISPLAY_NAME} listening`;
      case 'thinking':
        return `${PRODUCT_DISPLAY_NAME} thinking`;
      case 'pointing':
        return `${PRODUCT_DISPLAY_NAME} pointing`;
      case 'responding':
        return `${PRODUCT_DISPLAY_NAME} speaking`;
      case 'error':
        return `${PRODUCT_DISPLAY_NAME} error`;
      case 'privacy':
        return `${PRODUCT_DISPLAY_NAME} privacy mode`;
      default:
        return PRODUCT_DISPLAY_NAME;
    }
  })();

  const showActivity =
    state === 'thinking' || state === 'listening' || isSpeaking || isRecordingVoice;

  const menuBusy = phase !== 'closed';

  const handleTriggerClick = () => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    if (interactionRef.current === 'dragging') return;

    window.electronAPI.setIgnoreMouseEvents(false);
    if (isExpanded) {
      beginClose();
      onCollapsePanel();
      return;
    }
    if (canvasControlsOpen) {
      onCanvasControlsClose();
    }

    const resolved = resolveTriggerIntent(phaseRef.current, pendingIntentRef.current);
    pendingIntentRef.current = resolved.pending;
    if (resolved.action === 'open') {
      void beginOpen();
    } else if (resolved.action === 'close') {
      beginClose();
    }
  };

  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (isExpanded || menuBusy || canvasControlsOpen) return;
    if (event.button !== 0) return;
    if (interactionRef.current !== 'idle') return;

    event.preventDefault();
    suppressClickRef.current = false;
    interactionRef.current = 'pressed';

    const session = {
      pointerId: event.pointerId,
      startScreenX: event.screenX,
      startScreenY: event.screenY,
      originX: 0,
      originY: 0,
      ready: false,
    };
    dragSessionRef.current = session;

    void window.electronAPI.getMainBounds?.().then((bounds) => {
      if (!bounds || !dragSessionRef.current || dragSessionRef.current.pointerId !== session.pointerId) {
        return;
      }
      dragSessionRef.current.originX = bounds.x;
      dragSessionRef.current.originY = bounds.y;
      dragSessionRef.current.ready = true;
    });

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }

    const onMove = (e: PointerEvent) => {
      const sess = dragSessionRef.current;
      if (!sess || e.pointerId !== sess.pointerId) return;

      if (!isPrimaryButtonDown(e.buttons)) {
        const wasDragging = interactionRef.current === 'dragging';
        endPointerInteraction(wasDragging);
        return;
      }

      if (!sess.ready) return;

      const dx = e.screenX - sess.startScreenX;
      const dy = e.screenY - sess.startScreenY;

      if (interactionRef.current === 'pressed') {
        if (!exceedsDragThreshold(dx, dy, DRAG_THRESHOLD_PX)) return;
        interactionRef.current = 'dragging';
        suppressClickRef.current = true;
      }

      if (interactionRef.current !== 'dragging') return;

      window.electronAPI.moveMainWindow?.(sess.originX + dx, sess.originY + dy);
    };

    const onUp = (e: PointerEvent) => {
      const sess = dragSessionRef.current;
      if (!sess || e.pointerId !== sess.pointerId) return;
      const wasDragging = interactionRef.current === 'dragging';
      endPointerInteraction(wasDragging);
    };

    clearWindowListeners();
    listenersRef.current = { move: onMove, up: onUp };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const holdStage = shouldHoldArcStage(phase, Boolean(arcLayout));
  const fillWindow = shouldFillBuddyWindow(phase, Boolean(arcLayout));
  const showItems = shouldShowMenuItems(phase) && !isExpanded;

  const stageStyle =
    holdStage && arcLayout && !isExpanded
      ? {
          left: arcLayout.launcherOffset.x,
          top: arcLayout.launcherOffset.y,
        }
      : undefined;

  return (
    <div
      className={`floating-launcher no-drag ${fillWindow ? 'is-menu-open' : ''} ${canvasControlsOpen ? 'is-canvas-open' : ''} ${holdStage ? 'has-arc-layout' : ''}`}
    >
      <div className="quicke-launcher-stage" ref={stageRef} style={stageStyle}>
        <CircularCommandMenu
          open={showItems}
          items={items}
          positions={arcLayout?.positions}
          radius={arcLayout?.radius}
          labelledBy={triggerId}
          onRequestClose={beginClose}
          onSelect={(item) => {
            pendingActionRef.current = () => item.onClick?.();
            beginClose();
          }}
          onExitComplete={finishClose}
        />

        <button
          ref={triggerRef}
          id={triggerId}
          type="button"
          className={`launcher-btn state-${state} ${isExpanded ? 'expanded' : ''} ${isRecordingVoice ? 'recording' : ''} ${isSpeaking ? 'speaking' : ''}`}
          onClick={handleTriggerClick}
          onPointerDown={onPointerDown}
          aria-label={accessibleName}
          aria-expanded={phase === 'open'}
          aria-haspopup="menu"
        >
          <LiquidMetalButton compact={isExpanded} showActivity={showActivity} />
        </button>

        {canvasControlsOpen && !isExpanded && (
          <div className="quicke-canvas-sheet" role="dialog" aria-label="Canvas controls">
            <p className="quicke-canvas-sheet__title">Canvas</p>
            <button
              type="button"
              className="quicke-canvas-sheet__btn"
              onClick={() => {
                onClearAnnotations();
                onCanvasControlsClose();
              }}
            >
              Clear annotations
            </button>
            <button type="button" className="quicke-canvas-sheet__btn" onClick={onCanvasControlsClose}>
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
