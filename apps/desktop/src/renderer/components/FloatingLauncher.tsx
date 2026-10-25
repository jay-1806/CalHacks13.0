import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import LiquidMetalButton from './ui/LiquidMetalButton';
import CircularCommandMenu, { type CommandItem } from './ui/CircularCommandMenu';
import { CaptureIcon, CanvasIcon, MicIcon, TextIcon } from './ui/commandIcons';
import './FloatingLauncher.css';
import {
  CANVAS_SHEET_DEFAULT_SIZE,
  DRAG_THRESHOLD_PX,
  computeAnchorPreservingWindow,
  computeArcLayout,
  computeCanvasSheetPlacement,
  computeVoiceListenPlacement,
  exceedsDragThreshold,
  getCenter,
  isPrimaryButtonDown,
  measurePlusAlignment,
  VOICE_LISTEN_PILL_SIZE,
  type ArcLayoutResult,
  type CanvasSheetPlacement,
  type PointerInteraction,
} from '../launcherGeometry';
import {
  pendingModeForCommandItem,
  resolveAfterExit,
  resolveAfterOpen,
  resolveTriggerIntent,
  shouldFillBuddyWindow,
  shouldHoldArcStage,
  shouldRestoreCompactAfterMenuExit,
  shouldShowMenuItems,
  type MenuIntent,
  type MenuPhase,
  type PendingRadialMode,
} from '../menuLifecycle';
import {
  PRODUCT_DISPLAY_NAME,
  closeMenuProductLabel,
  demoVoiceListenLabel,
  minimizeProductLabel,
} from '@screentutor/shared';
import { COLLAPSED_SIZE, MENU_WINDOW_SIZE } from '../panelLayout';

interface Props {
  state: 'idle' | 'listening' | 'thinking' | 'responding' | 'pointing' | 'error' | 'privacy';
  isExpanded: boolean;
  isRecordingVoice: boolean;
  /** Part 6.6.5 — mark listening chrome as Demo when STT is simulated. */
  demoVoiceMode?: boolean;
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
  /** Voice preview countdown label, e.g. "Sending in 2s…". */
  voicePreviewHint?: string | null;
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
  demoVoiceMode = false,
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
  voicePreviewHint = null,
}: Props) {
  const triggerId = useId();
  const stageRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [arcLayout, setArcLayout] = useState<ArcLayoutResult | null>(null);
  /**
   * When Canvas is open, pin the disc with the same absolute offset technique as
   * the arc menu so edge clamping cannot slide the visible launcher center.
   */
  const [canvasOffset, setCanvasOffset] = useState<{ x: number; y: number } | null>(null);
  const [canvasWindowSize, setCanvasWindowSize] = useState({
    width: MENU_WINDOW_SIZE,
    height: MENU_WINDOW_SIZE,
  });
  const [canvasSheetSize, setCanvasSheetSize] = useState<{ width: number; height: number }>(
    CANVAS_SHEET_DEFAULT_SIZE
  );
  const canvasSheetRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<MenuPhase>('closed');
  const phaseRef = useRef<MenuPhase>('closed');
  const pendingIntentRef = useRef<MenuIntent>(null);
  const pendingActionRef = useRef<(() => void) | null>(null);
  /**
   * Queued radial action mode. Used so menu-exit compact restore cannot race a
   * newer Text/Voice expand (placeTutorPanel) or Canvas pin.
   */
  const pendingModeRef = useRef<PendingRadialMode>(null);
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

  const pinWindowToLauncherAnchor = useCallback(async (width: number, height: number) => {
    const bounds = await window.electronAPI.getMainBounds?.();
    if (!bounds?.anchor || !bounds.workArea) {
      window.electronAPI.setMainSizeAtAnchor?.(width, height);
      return null;
    }
    const layout = computeAnchorPreservingWindow({
      anchor: bounds.anchor,
      workArea: bounds.workArea,
      width,
      height,
    });
    if (typeof window.electronAPI.setMainBounds === 'function') {
      await window.electronAPI.setMainBounds(layout.window);
    } else {
      window.electronAPI.setMainSizeAtAnchor?.(width, height);
    }
    const applied = (await window.electronAPI.getMainBounds?.()) ?? layout.window;
    if (process.env.NODE_ENV !== 'production') {
      const screenX = applied.x + layout.launcherOffset.x;
      const screenY = applied.y + layout.launcherOffset.y;
      console.info('[Quicky.AI][launcher-pin]', {
        anchor: bounds.anchor,
        window: { x: applied.x, y: applied.y, width: applied.width, height: applied.height },
        offset: layout.launcherOffset,
        screenCenter: { x: screenX, y: screenY },
        delta: {
          x: screenX - bounds.anchor.cx,
          y: screenY - bounds.anchor.cy,
        },
      });
    }
    return {
      offset: layout.launcherOffset,
      windowSize: { width: applied.width, height: applied.height },
    };
  }, []);

  const finishClose = useCallback(() => {
    const pending = pendingIntentRef.current;
    pendingIntentRef.current = null;
    const result = resolveAfterExit(pending);
    setPhaseBoth('closed');

    const runPendingAction = () => {
      const action = pendingActionRef.current;
      pendingActionRef.current = null;
      action?.();
    };

    if (result.shouldReopen) {
      // User requested reopen during close — drop any queued action.
      setArcLayout(null);
      setCanvasOffset(null);
      pendingModeRef.current = null;
      pendingActionRef.current = null;
      void beginOpenRef.current();
      return;
    }

    const mode = pendingModeRef.current;
    pendingModeRef.current = null;

    // Run Canvas/Text/Voice/Capture while arc offset still holds the disc still.
    runPendingAction();

    if (mode === 'canvas') {
      // Keep arc offset visible until the pinned window + canvasOffset are ready,
      // then swap in one React update so the disc does not flex-jump.
      void (async () => {
        const pin = await pinWindowToLauncherAnchor(MENU_WINDOW_SIZE, MENU_WINDOW_SIZE);
        if (pin) {
          setCanvasWindowSize(pin.windowSize);
          setCanvasOffset(pin.offset);
        }
        setArcLayout(null);
      })();
      return;
    }

    if (mode === 'voice') {
      // Keep menu-sized buddy (do not shrink to a custom 240×200 — that jumps the disc).
      // Pill is placed with computeVoiceListenPlacement relative to the preserved anchor.
      void (async () => {
        const pin = await pinWindowToLauncherAnchor(MENU_WINDOW_SIZE, MENU_WINDOW_SIZE);
        if (pin) {
          setCanvasWindowSize(pin.windowSize);
          setCanvasOffset(pin.offset);
        }
        setArcLayout(null);
      })();
      return;
    }

    setArcLayout(null);
    setCanvasOffset(null);
    if (shouldRestoreCompactAfterMenuExit(mode)) {
      onMenuExitComplete?.();
    }
    // mode === 'panel': Text owns bounds via placeTutorPanel — do not shrink.
  }, [onMenuExitComplete, pinWindowToLauncherAnchor, setPhaseBoth]);

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
    pendingModeRef.current = null;
    setCanvasOffset(null);

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
      setCanvasOffset(null);
      onCanvasControlsClose();
      void pinWindowToLauncherAnchor(COLLAPSED_SIZE, COLLAPSED_SIZE);
      return;
    }

    // While listening, Esc is the only cancel — do not treat a launcher click as Done/Cancel.
    if (isRecordingVoice) {
      return;
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
  const voiceListenStage =
    Boolean(canvasOffset) && isRecordingVoice && !isExpanded && !canvasControlsOpen;
  const pinStage =
    (Boolean(canvasOffset) && canvasControlsOpen && !isExpanded) || voiceListenStage;
  const fillWindow = shouldFillBuddyWindow(phase, Boolean(arcLayout)) || pinStage;
  const showItems = shouldShowMenuItems(phase) && !isExpanded;

  const canvasSheetPlacement: CanvasSheetPlacement | null = useMemo(() => {
    if (!pinStage || !canvasOffset) return null;
    if (voiceListenStage) {
      return computeVoiceListenPlacement({
        launcherOffset: canvasOffset,
        windowSize: canvasWindowSize,
        pillSize: VOICE_LISTEN_PILL_SIZE,
      });
    }
    return computeCanvasSheetPlacement({
      launcherOffset: canvasOffset,
      windowSize: canvasWindowSize,
      sheetSize: canvasSheetSize,
    });
  }, [pinStage, voiceListenStage, demoVoiceMode, canvasOffset, canvasWindowSize, canvasSheetSize]);

  // Measure Canvas sheet only — Voice pill uses a fixed VOICE_LISTEN_PILL_SIZE
  // so waveform animation cannot resize geometry.
  useEffect(() => {
    if (!canvasControlsOpen || !canvasOffset || voiceListenStage) return;
    const el = canvasSheetRef.current;
    if (!el) return;
    const sync = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        setCanvasSheetSize({ width: Math.round(r.width), height: Math.round(r.height) });
      }
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, [
    canvasControlsOpen,
    voiceListenStage,
    canvasOffset,
    canvasSheetPlacement?.left,
    canvasSheetPlacement?.bottom,
    canvasSheetPlacement?.top,
  ]);

  // Hold-hotkey Voice (no radial menu) still needs a pinned buddy for the pill.
  useEffect(() => {
    if (!isRecordingVoice || isExpanded || canvasControlsOpen || canvasOffset) return;
    let cancelled = false;
    void (async () => {
      const pin = await pinWindowToLauncherAnchor(MENU_WINDOW_SIZE, MENU_WINDOW_SIZE);
      if (cancelled || !pin) return;
      setCanvasWindowSize(pin.windowSize);
      setCanvasOffset(pin.offset);
    })();
    return () => {
      cancelled = true;
    };
  }, [isRecordingVoice, isExpanded, canvasControlsOpen, canvasOffset, pinWindowToLauncherAnchor]);

  // Drop Voice pin and restore compact AT the saved anchor (Part 6.6.2).
  // Clearing offset without resizing leaves the disc floating inside a large
  // window — the Escape jump. Pin compact first in the same turn when possible.
  useEffect(() => {
    if (isRecordingVoice || canvasControlsOpen || isExpanded) return;
    if (!canvasOffset) return;
    const offset = canvasOffset;
    setCanvasOffset(null);
    void pinWindowToLauncherAnchor(COLLAPSED_SIZE, COLLAPSED_SIZE).then((pin) => {
      // If Chat claimed the window meanwhile, do not shrink over placeTutorPanel.
      if (isExpanded) return;
      if (!pin && process.env.NODE_ENV !== 'production') {
        console.info('[Quicky.AI][voice-pin-drop]', { hadOffset: offset });
      }
    });
  }, [isRecordingVoice, canvasControlsOpen, isExpanded, canvasOffset, pinWindowToLauncherAnchor]);

  const stageStyle =
    holdStage && arcLayout && !isExpanded
      ? {
          left: arcLayout.launcherOffset.x,
          top: arcLayout.launcherOffset.y,
        }
      : pinStage && canvasOffset
        ? {
            left: canvasOffset.x,
            top: canvasOffset.y,
          }
        : undefined;

  const canvasSheetStyle = canvasSheetPlacement
    ? {
        left: canvasSheetPlacement.left,
        right: 'auto' as const,
        transform: 'none' as const,
        bottom: canvasSheetPlacement.bottom ?? undefined,
        top: canvasSheetPlacement.top ?? undefined,
      }
    : undefined;

  return (
    <div
      className={`floating-launcher no-drag ${fillWindow ? 'is-menu-open' : ''} ${canvasControlsOpen ? 'is-canvas-open' : ''} ${holdStage || pinStage ? 'has-arc-layout' : ''}`}
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
            pendingModeRef.current = pendingModeForCommandItem(item.id);
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

        {/* Mount only after canvasOffset is ready — avoids a one-frame jump/clip. */}
        {canvasControlsOpen && canvasOffset && !isExpanded && (
          <div
            ref={canvasSheetRef}
            className="quicke-canvas-sheet"
            role="dialog"
            aria-label="Canvas controls"
            style={canvasSheetStyle}
          >
            <p className="quicke-canvas-sheet__title">Canvas</p>
            <button
              type="button"
              className="quicke-canvas-sheet__btn"
              onClick={() => {
                onClearAnnotations();
                setCanvasOffset(null);
                onCanvasControlsClose();
                void pinWindowToLauncherAnchor(COLLAPSED_SIZE, COLLAPSED_SIZE);
              }}
            >
              Clear annotations
            </button>
            <button
              type="button"
              className="quicke-canvas-sheet__btn"
              onClick={() => {
                setCanvasOffset(null);
                onCanvasControlsClose();
                void pinWindowToLauncherAnchor(COLLAPSED_SIZE, COLLAPSED_SIZE);
              }}
            >
              Close
            </button>
          </div>
        )}

        {/* One compact Listening indicator — no Done / Cancel / Stop controls (Esc only). */}
        {voiceListenStage && (
          <div
            ref={canvasSheetRef}
            className="quicke-listen-pill"
            role="status"
            aria-live="polite"
            aria-label="Listening. Press Escape to cancel."
            style={{
              ...canvasSheetStyle,
              width: VOICE_LISTEN_PILL_SIZE.width,
              height: VOICE_LISTEN_PILL_SIZE.height,
            }}
          >
            <span className="quicke-listen-pill__mic" aria-hidden="true">
              <MicIcon />
            </span>
            <span className="quicke-listen-pill__label">{demoVoiceListenLabel(demoVoiceMode)}</span>
            <span className="quicke-listen-pill__wave" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </span>
            <span className="quicke-listen-pill__esc">Esc</span>
          </div>
        )}

        {voicePreviewHint && isExpanded && (
          <p className="quicke-voice-preview-hint" role="status">
            {voicePreviewHint}
          </p>
        )}
      </div>
    </div>
  );
}
