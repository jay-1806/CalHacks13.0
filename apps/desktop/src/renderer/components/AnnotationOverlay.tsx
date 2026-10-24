import { useCallback, useEffect, useRef, useState } from 'react';
import type { DrawingCommand, PointTarget } from '@screentutor/shared';
import {
  parseStreamTags,
  snapShapeToPoint,
  stripDuplicateShapeLabel,
  mapPointThroughCaptureRegion,
  mapShapeThroughCaptureRegion,
  buildNarrationSteps,
  figureCenter,
  placeBesideFigure,
  type CaptureRegion,
  type CanvasDrawShape,
  type StreamEvent,
  type NarrationStep,
} from '@screentutor/shared';
import type { OverlayExplanationPayload } from '../types/explanation';
import {
  setupCanvas,
  drawShapeOnCanvas,
  beginOverlayFrame,
  drawEnhancedPointer,
  sideMarkGap,
  DRAW_STROKE_MS,
  type PointerTrailPoint,
} from './overlay-canvas';
import './AnnotationOverlay.css';

const MOVE_DURATION_MS = 350;
const FADE_IN_MS = 200;
const MAX_QUEUE_DEPTH = 50;
const CHAR_STREAM_MS = 30;
const TRAIL_LENGTH = 6;
/** Opacity of earlier steps' diagram marks: the current step stands out, earlier ones stay readable */
const FADED_SHAPE_ALPHA = 0.6;
/** Written notes (working lines, word meanings) stay at full strength for the whole lesson */
const STAYS_FULL = new Set<CanvasDrawShape['kind']>(['work', 'gloss']);
/** How long a finished explanation stays on screen before it fades away */
const ERASE_AFTER_MS = 8000;
const ERASE_FADE_MS = 1200;
interface QueuedPoint {
  px: number;
  py: number;
  label: string;
}

interface ActiveShape {
  id: string;
  shape: CanvasDrawShape;
  createdAt: number;
  /** A mark from an earlier narration step, drawn dimmed */
  faded?: boolean;
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function quadBezier(
  t: number,
  p0: { x: number; y: number },
  p1: { x: number; y: number },
  p2: { x: number; y: number }
) {
  const inv = 1 - t;
  return {
    x: inv * inv * p0.x + 2 * inv * t * p1.x + t * t * p2.x,
    y: inv * inv * p0.y + 2 * inv * t * p1.y + t * t * p2.y,
  };
}

function drawingCommandToShape(cmd: DrawingCommand): CanvasDrawShape | null {
  const { x, y, width = 0.1, height = 0.1 } = cmd.coordinates;
  switch (cmd.type) {
    case 'circle':
      return { kind: 'circle', coords: [x, y, Math.max(width, height) / 2], label: cmd.label };
    case 'rectangle':
      return { kind: 'rect', coords: [x - width / 2, y - height / 2, width, height], label: cmd.label };
    case 'arrow':
      return { kind: 'arrow', coords: [x - width, y - height, x, y], label: cmd.label };
    case 'highlight':
      return { kind: 'highlight', coords: [x - width / 2, y - height / 2, width, height], label: cmd.label };
    case 'underline':
      return { kind: 'underline', coords: [x, y, x + width, y], label: cmd.label };
    default:
      return null;
  }
}

export default function AnnotationOverlay() {
  const [point, setPoint] = useState<{ pointTarget: PointTarget; text: string } | null>(null);
  const [triggerError, setTriggerError] = useState(false);
  const [displayedText, setDisplayedText] = useState('');
  const [isVisible, setIsVisible] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [showFullText, setShowFullText] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const shapeIdRef = useRef(0);
  const pointRef = useRef(point);
  const isMinimizedRef = useRef(isMinimized);
  const dragOffsetRef = useRef(dragOffset);
  const dragStartRef = useRef({ pointerX: 0, pointerY: 0, offsetX: 0, offsetY: 0 });

  pointRef.current = point;
  isMinimizedRef.current = isMinimized;
  dragOffsetRef.current = dragOffset;

  const pointerPosRef = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
  const pointerLabelRef = useRef('');
  const pointerQueueRef = useRef<QueuedPoint[]>([]);
  const shapesRef = useRef<ActiveShape[]>([]);
  const lastPointNormRef = useRef<{ x: number; y: number } | null>(null);
  const lastPointLabelRef = useRef('');
  const captureRegionRef = useRef<CaptureRegion | null>(null);
  /** Middle of the figure being explained (screen-normalized), so marks sit around it */
  const figureCenterRef = useRef<{ x: number; y: number } | null>(null);
  const [isRegionSelecting, setIsRegionSelecting] = useState(false);
  const firedEventCountRef = useRef(0);

  const moveRef = useRef<{
    active: boolean;
    startTime: number;
    from: { x: number; y: number };
    to: { x: number; y: number };
    control: { x: number; y: number };
    label: string;
  } | null>(null);

  const arrivalBurstRef = useRef<{ startTime: number } | null>(null);
  const trailRef = useRef<PointerTrailPoint[]>([]);

  const streamRef = useRef<{
    visibleText: string;
    events: StreamEvent[];
    charIndex: number;
    intervalId: ReturnType<typeof setInterval> | null;
  }>({ visibleText: '', events: [], charIndex: 0, intervalId: null });

  const narrationRef = useRef<{
    steps: NarrationStep[];
    stepIndex: number;
  }>({ steps: [], stepIndex: -1 });
  const narrationStartedRef = useRef(false);
  const charStreamFallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eraseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** When the fade-out began, while a finished explanation is being erased */
  const eraseStartRef = useRef<number | null>(null);

  const stopCharStream = () => {
    const stream = streamRef.current;
    if (stream.intervalId) {
      clearInterval(stream.intervalId);
      stream.intervalId = null;
    }
  };

  /** Forget the current narration so late step events from the app are ignored. */
  const stopNarration = () => {
    narrationRef.current = { steps: [], stepIndex: -1 };
  };

  const enqueuePoint = (px: number, py: number, label: string) => {
    pointerQueueRef.current.push({ px, py, label });
    console.log('[pointer] push queue depth=', pointerQueueRef.current.length, label);
    if (pointerQueueRef.current.length > MAX_QUEUE_DEPTH) {
      pointerQueueRef.current.shift();
    }
    startNextMove();
  };

  const startNextMove = () => {
    if (moveRef.current?.active) return;
    const next = pointerQueueRef.current.shift();
    if (!next) return;

    console.log('[pointer] drain queue, remaining=', pointerQueueRef.current.length, next.label);

    const from = { ...pointerPosRef.current };
    const to = { x: next.px, y: next.py };
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.sqrt(dx * dx + dy * dy) || 1;

    moveRef.current = {
      active: true,
      startTime: performance.now(),
      from,
      to,
      control: { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 - distance * 0.3 },
      label: next.label,
    };
  };

  /**
   * `replay` re-applies an earlier narration step: its shapes appear instantly
   * (working lines at full strength, diagram marks faded) and the pointer stays put.
   */
  const applyStreamEvent = (event: StreamEvent, replay = false) => {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const region = captureRegionRef.current;

    if (event.type === 'point') {
      const mapped = mapPointThroughCaptureRegion(event.x, event.y, region);
      lastPointNormRef.current = { x: mapped.x, y: mapped.y };
      lastPointLabelRef.current = event.label;
      if (!replay) enqueuePoint(mapped.x * W, mapped.y * H, event.label);
    } else if (event.type === 'clear') {
      // Clear only this step's marks: written notes and earlier steps' faded marks persist.
      shapesRef.current = shapesRef.current.filter((s) => s.faded || STAYS_FULL.has(s.shape.kind));
      lastPointNormRef.current = null;
      lastPointLabelRef.current = '';
    } else if (event.type === 'draw') {
      const mappedShape = mapShapeThroughCaptureRegion(event.shape, region);
      const snapped = snapShapeToPoint(mappedShape, lastPointNormRef.current) ?? mappedShape;
      const labelled = stripDuplicateShapeLabel(snapped, lastPointLabelRef.current);
      const anchored = placeBesideFigure(labelled, figureCenterRef.current, W, H, sideMarkGap(Math.min(W, H)));
      shapesRef.current.push({
        id: `shape-${shapeIdRef.current++}`,
        shape: anchored,
        createdAt: replay ? 0 : performance.now(),
        faded: replay && !STAYS_FULL.has(anchored.kind),
      });
    }
  };

  const dispatchStreamEventsUpTo = (charIndex: number, events: StreamEvent[]) => {
    while (
      firedEventCountRef.current < events.length &&
      events[firedEventCountRef.current].index <= charIndex
    ) {
      applyStreamEvent(events[firedEventCountRef.current]);
      firedEventCountRef.current++;
    }
  };

  const startCharStream = (parsed: { visibleText: string; events: StreamEvent[] }) => {
    const stream = streamRef.current;
    stream.visibleText = parsed.visibleText;
    stream.events = parsed.events;
    stream.charIndex = 0;
    stopCharStream();
    const center = figureCenter([parsed.events]);
    figureCenterRef.current = center
      ? mapPointThroughCaptureRegion(center.x, center.y, captureRegionRef.current)
      : null;

    stream.intervalId = setInterval(() => {
      if (stream.charIndex < stream.visibleText.length) {
        const idx = stream.charIndex;
        setDisplayedText(stream.visibleText.substring(0, idx + 1));
        dispatchStreamEventsUpTo(idx, stream.events);
        stream.charIndex++;
      } else {
        dispatchStreamEventsUpTo(stream.visibleText.length, stream.events);
        stopCharStream();
        scheduleErase();
      }
    }, CHAR_STREAM_MS);
  };

  const applyNarrationStep = (stepIndex: number, steps: NarrationStep[]) => {
    shapesRef.current = [];
    // Rebuild what earlier steps left on screen so the explanation accumulates.
    for (let i = 0; i < stepIndex; i++) {
      lastPointNormRef.current = null;
      for (const event of steps[i].events) {
        if (event.type !== 'clear') applyStreamEvent(event, true);
      }
    }
    lastPointNormRef.current = null;
    const display = steps
      .slice(0, stepIndex + 1)
      .map((step) => step.display)
      .filter(Boolean)
      .join('\n');
    setDisplayedText(display);
    for (const event of steps[stepIndex].events) {
      applyStreamEvent(event);
    }
    narrationRef.current.stepIndex = stepIndex;
  };

  const finishNarration = () => {
    const steps = narrationRef.current.steps;
    if (steps.length === 0) return;
    stopNarration();

    setDisplayedText(steps.map((step) => step.display).filter(Boolean).join('\n'));
    applyNarrationStep(steps.length - 1, steps);
    scheduleErase();
  };

  /** After an explanation ends, leave it up for a while, then fade it all away. */
  const scheduleErase = () => {
    cancelErase();
    eraseTimerRef.current = setTimeout(() => {
      eraseTimerRef.current = null;
      eraseStartRef.current = performance.now();
    }, ERASE_AFTER_MS);
  };

  const cancelErase = () => {
    if (eraseTimerRef.current) clearTimeout(eraseTimerRef.current);
    eraseTimerRef.current = null;
    eraseStartRef.current = null;
    if (canvasRef.current) canvasRef.current.style.opacity = '';
  };

  const clearOverlayNow = () => {
    cancelErase();
    stopCharStream();
    stopNarration();
    narrationStartedRef.current = false;
    if (charStreamFallbackRef.current) {
      clearTimeout(charStreamFallbackRef.current);
      charStreamFallbackRef.current = null;
    }
    setPoint(null);
    shapesRef.current = [];
    pointerQueueRef.current = [];
    moveRef.current = null;
    arrivalBurstRef.current = null;
    setDisplayedText('');
    setIsMinimized(false);
    setShowFullText(false);
    setDragOffset({ x: 0, y: 0 });
    setIsVisible(false);
  };

  /**
   * Prepare a narration's steps. Nothing is shown on a timer: each step is applied
   * when the app reports that its audio started (onOverlayNarrationStep).
   */
  const startNarration = (
    spokenText: string,
    overlayText: string,
    captureRegion?: CaptureRegion | null
  ) => {
    captureRegionRef.current = captureRegion ?? null;
    cancelErase();
    stopCharStream();
    if (charStreamFallbackRef.current) {
      clearTimeout(charStreamFallbackRef.current);
      charStreamFallbackRef.current = null;
    }
    narrationStartedRef.current = true;

    firedEventCountRef.current = 0;
    shapesRef.current = [];
    pointerQueueRef.current = [];
    moveRef.current = null;
    arrivalBurstRef.current = null;
    trailRef.current = [];
    lastPointNormRef.current = null;

    const steps = buildNarrationSteps(spokenText, overlayText || pointRef.current?.text || '');
    narrationRef.current.steps = steps;
    narrationRef.current.stepIndex = -1;
    const center = figureCenter(steps.map((step) => step.events));
    figureCenterRef.current = center ? mapPointThroughCaptureRegion(center.x, center.y, captureRegion ?? null) : null;

    if (steps.length === 0) {
      startCharStream(parseStreamTags(overlayText || pointRef.current?.text || ''));
      return;
    }
  };

  const renderFrame = useRef((timestamp: number) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      rafRef.current = requestAnimationFrame(renderFrame.current);
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      rafRef.current = requestAnimationFrame(renderFrame.current);
      return;
    }

    const W = window.innerWidth;
    const H = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    const expectedW = Math.round(W * dpr);
    const expectedH = Math.round(H * dpr);
    if (canvas.width !== expectedW || canvas.height !== expectedH) {
      setupCanvas(canvas);
    }

    ctx.clearRect(0, 0, W, H);

    beginOverlayFrame();
    for (const active of shapesRef.current) {
      const fadeT = Math.min(1, (timestamp - active.createdAt) / FADE_IN_MS);
      const strokeT = Math.min(1, (timestamp - active.createdAt) / DRAW_STROKE_MS);
      drawShapeOnCanvas(ctx, active.shape, W, H, active.faded ? fadeT * FADED_SHAPE_ALPHA : fadeT, strokeT);
    }

    let pointerLabel = pointerLabelRef.current;
    const currentPoint = pointRef.current;
    const minimized = isMinimizedRef.current;

    if (moveRef.current?.active) {
      const move = moveRef.current;
      const elapsed = timestamp - move.startTime;
      const t = easeInOut(Math.min(1, elapsed / MOVE_DURATION_MS));

      pointerPosRef.current = quadBezier(t, move.from, move.control, move.to);
      pointerLabel = move.label;

      trailRef.current.unshift({ x: pointerPosRef.current.x, y: pointerPosRef.current.y, age: 0 });
      if (trailRef.current.length > TRAIL_LENGTH) {
        trailRef.current.length = TRAIL_LENGTH;
      }

      if (t >= 1) {
        moveRef.current = null;
        pointerLabelRef.current = move.label;
        arrivalBurstRef.current = { startTime: timestamp };
        startNextMove();
      }
    }

    for (const pt of trailRef.current) {
      pt.age += 1;
    }
    trailRef.current = trailRef.current.filter((pt) => pt.age < TRAIL_LENGTH);

    if (!minimized && currentPoint?.pointTarget.x !== null && currentPoint?.pointTarget.y !== null) {
      drawEnhancedPointer(
        ctx,
        pointerPosRef.current.x,
        pointerPosRef.current.y,
        timestamp,
        pointerLabel,
        trailRef.current,
        arrivalBurstRef.current &&
          timestamp - arrivalBurstRef.current.startTime < 400
          ? arrivalBurstRef.current
          : null
      );
      if (arrivalBurstRef.current && timestamp - arrivalBurstRef.current.startTime >= 400) {
        arrivalBurstRef.current = null;
      }
    }

    if (eraseStartRef.current !== null) {
      const left = 1 - (timestamp - eraseStartRef.current) / ERASE_FADE_MS;
      if (left <= 0) {
        clearOverlayNow();
      } else {
        canvas.style.opacity = String(left);
      }
    }

    rafRef.current = requestAnimationFrame(renderFrame.current);
  });

  useEffect(() => {
    window.electronAPI.logToServer('AnnotationOverlay component mounted!');
    if (canvasRef.current) {
      setupCanvas(canvasRef.current);
    }
    const onResize = () => {
      if (canvasRef.current) setupCanvas(canvasRef.current);
    };
    window.addEventListener('resize', onResize);
    rafRef.current = requestAnimationFrame(renderFrame.current);
    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  useEffect(() => {
    window.electronAPI.onOverlayDrawings((cmds: DrawingCommand[]) => {
      shapesRef.current = cmds
        .map((cmd) => {
          const shape = drawingCommandToShape(cmd);
          if (!shape) return null;
          return { id: cmd.id, shape, createdAt: performance.now() };
        })
        .filter(Boolean) as ActiveShape[];
      setIsVisible(true);
    });

    window.electronAPI.onOverlayPoint((data: { pointTarget: PointTarget; text: string }) => {
      if (!data?.pointTarget || data.pointTarget.x === null || data.pointTarget.y === null) {
        setPoint(null);
        return;
      }

      cancelErase();
      stopCharStream();
      stopNarration();
      narrationStartedRef.current = false;
      if (charStreamFallbackRef.current) {
        clearTimeout(charStreamFallbackRef.current);
        charStreamFallbackRef.current = null;
      }

      pointerQueueRef.current = [];
      moveRef.current = null;
      arrivalBurstRef.current = null;
      lastPointNormRef.current = null;
      firedEventCountRef.current = 0;
      shapesRef.current = [];

      if (data.pointTarget.x !== null && data.pointTarget.y !== null) {
        pointerPosRef.current = { x: data.pointTarget.x, y: data.pointTarget.y };
      } else {
        pointerPosRef.current = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
      }
      pointerLabelRef.current = '';

      setPoint({ pointTarget: data.pointTarget, text: data.text || '' });
      setDisplayedText('');
      setIsMinimized(false);
      setShowFullText(false);
      setDragOffset({ x: 0, y: 0 });
      setIsVisible(true);
    });

    window.electronAPI.onOverlayClear(clearOverlayNow);

    window.electronAPI.onOverlayNarrationStart((data: {
      spokenText: string;
      overlayText: string;
      captureRegion?: CaptureRegion | null;
    }) => {
      startNarration(data.spokenText, data.overlayText, data.captureRegion);
    });

    window.electronAPI.onOverlayNarrationStep((index: number) => {
      const steps = narrationRef.current.steps;
      if (index >= 0 && index < steps.length) applyNarrationStep(index, steps);
    });

    window.electronAPI.onOverlayNarrationFinish(() => {
      finishNarration();
    });

    window.electronAPI.onRegionSelectStart(() => {
      setIsRegionSelecting(true);
    });

    window.electronAPI.onRegionSelectCancel(() => {
      setIsRegionSelecting(false);
    });

    window.electronAPI.onRestoreExplanation((data: OverlayExplanationPayload) => {
      if (!data?.pointTarget || data.pointTarget.x === null || data.pointTarget.y === null) return;
      cancelErase();

      pointerPosRef.current = { x: data.pointTarget.x, y: data.pointTarget.y };
      shapesRef.current = [];
      const parsed = parseStreamTags(data.text || '');
      for (const event of parsed.events) {
        if (event.type === 'draw' || event.type === 'clear') {
          applyStreamEvent(event);
        }
      }

      setPoint({
        pointTarget: { x: data.pointTarget.x, y: data.pointTarget.y, label: '', rawTag: '' },
        text: data.text || '',
      });
      setDragOffset({ x: data.dragOffsetX ?? 0, y: data.dragOffsetY ?? 0 });
      setIsMinimized(false);
      setShowFullText(!!data.showFullText);
      setDisplayedText(data.showFullText ? parsed.visibleText : '');
      setIsVisible(true);
    });

    window.electronAPI.onTriggerOverlayError(() => {
      setTriggerError(true);
    });
  }, []);

  useEffect(() => {
    if (!point?.pointTarget || point.pointTarget.x === null || point.pointTarget.y === null) return;
    window.electronAPI.notifyExplanationReady({
      anchorX: point.pointTarget.x,
      anchorY: point.pointTarget.y,
      text: point.text,
    });
  }, [point?.pointTarget?.x, point?.pointTarget?.y, point?.text]);

  useEffect(() => {
    if (isRegionSelecting) {
      window.electronAPI.setIgnoreMouseEvents(false);
      return;
    }
    // Pointer, marks and working are display-only: clicks go through to the page.
    window.electronAPI.setIgnoreMouseEvents(true, { forward: true });
  }, [isRegionSelecting]);

  useEffect(() => {
    // Once the voice-synced narration has started it owns the overlay. This render
    // can land after it started (the point and narration messages arrive back to
    // back), and must not tear it down for the timer-driven fallback below.
    if (narrationStartedRef.current) return;
    stopCharStream();
    if (charStreamFallbackRef.current) {
      clearTimeout(charStreamFallbackRef.current);
      charStreamFallbackRef.current = null;
    }

    if (!point?.text) return;

    const parsed = parseStreamTags(point.text);
    streamRef.current.visibleText = parsed.visibleText;
    streamRef.current.events = parsed.events;
    streamRef.current.charIndex = 0;
    firedEventCountRef.current = 0;
    lastPointNormRef.current = null;
    shapesRef.current = [];
    setDisplayedText('');

    if (showFullText) {
      setDisplayedText(parsed.visibleText);
      dispatchStreamEventsUpTo(parsed.visibleText.length, parsed.events);
      return;
    }

    charStreamFallbackRef.current = setTimeout(() => {
      if (!narrationStartedRef.current) {
        startCharStream(parsed);
      }
    }, 1500);

    return () => {
      stopCharStream();
      if (charStreamFallbackRef.current) {
        clearTimeout(charStreamFallbackRef.current);
        charStreamFallbackRef.current = null;
      }
    };
  }, [point, showFullText]);

  if (triggerError) {
    throw new Error('Simulated Overlay Render Error');
  }

  if (!isVisible) return null;

  return (
    <div
      className="annotation-overlay-container"
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 9999 }}
    >
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      />
    </div>
  );
}
