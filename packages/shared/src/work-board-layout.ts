/**
 * Non-overlapping layout for cumulative `[DRAW:work]` explanation boards.
 *
 * Positions from the model are a hint only. Boards stay on screen for the whole
 * lesson; this module stacks them in the safest blank region beside the figure
 * so they never share the same coordinates.
 */

import type { CanvasDrawShape, StreamEvent } from './stream-tag-parser.js';
import { inkDensityInRect, type InkGrid } from './capture-ink-occupancy.js';

export type NormRect = { x: number; y: number; w: number; h: number };

const MARGIN = 0.02;
const GAP = 0.012;
const MIN_RAIL_W = 0.22;
const MIN_RAIL_H = 0.18;
/** Approx glyph width factor matching overlay-canvas HAND_FONT work boards. */
const CHAR_WIDTH_FACTOR = 0.55;
/** Generous pad so thin diagram lines / vertex labels stay protected. */
const DEFAULT_FIGURE_PAD = 0.1;
const POINT_PAD = 0.05;
/** Reject rails whose mean capture-ink density exceeds this. */
const MAX_RAIL_INK = 0.18;

/** Anything that must not be covered by work boards (includes labels on the figure). */
function isContentShape(shape: CanvasDrawShape): boolean {
  return shape.kind !== 'work';
}

function overlap(a: NormRect, b: NormRect, pad = 0): boolean {
  return !(
    a.x + a.w + pad <= b.x ||
    b.x + b.w + pad <= a.x ||
    a.y + a.h + pad <= b.y ||
    b.y + b.h + pad <= a.y
  );
}

/** Estimate work-board size in normalized units (mirrors overlay-canvas workBox). */
export function estimateWorkBoardSize(
  text: string,
  canvasW: number,
  canvasH: number
): { w: number; h: number } {
  const minDim = Math.max(1, Math.min(canvasW, canvasH));
  const fontSize = Math.max(24, Math.min(40, minDim * 0.034));
  const padX = fontSize * 0.5;
  const padY = fontSize * 0.2;
  const textW = Math.max((text || ' ').length, 1) * fontSize * CHAR_WIDTH_FACTOR + padX * 2;
  const boxH = fontSize + padY * 2;
  return {
    w: Math.min(0.55, Math.max(0.12, textW / canvasW)),
    h: Math.min(0.2, Math.max(0.035, boxH / canvasH)),
  };
}

/** Axis-aligned bounds of diagram content (excludes work boards; includes labels). */
export function figureOccupancyFromShapes(
  shapes: CanvasDrawShape[],
  pad = DEFAULT_FIGURE_PAD
): NormRect | null {
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  let any = false;
  for (const shape of shapes) {
    if (!isContentShape(shape)) continue;
    const c = shape.coords;
    for (let i = 0; i + 1 < c.length; i += 2) {
      any = true;
      minX = Math.min(minX, c[i]);
      maxX = Math.max(maxX, c[i]);
      minY = Math.min(minY, c[i + 1]);
      maxY = Math.max(maxY, c[i + 1]);
    }
  }
  if (!any) return null;
  return {
    x: Math.max(0, minX - pad),
    y: Math.max(0, minY - pad),
    w: Math.min(1, maxX + pad) - Math.max(0, minX - pad),
    h: Math.min(1, maxY + pad) - Math.max(0, minY - pad),
  };
}

export function figureOccupancyFromEvents(
  stepEvents: StreamEvent[][],
  pad = DEFAULT_FIGURE_PAD
): NormRect | null {
  const shapes: CanvasDrawShape[] = [];
  for (const events of stepEvents) {
    for (const e of events) {
      if (e.type === 'draw') shapes.push(e.shape);
    }
  }
  return figureOccupancyFromShapes(shapes, pad);
}

/** Small protective discs around [POINT] targets (angles, vertices, equations). */
export function pointObstacleRects(
  points: Array<{ x: number; y: number }>,
  pad = POINT_PAD
): NormRect[] {
  return points.map((p) => ({
    x: Math.max(0, p.x - pad),
    y: Math.max(0, p.y - pad),
    w: Math.min(1, p.x + pad) - Math.max(0, p.x - pad),
    h: Math.min(1, p.y + pad) - Math.max(0, p.y - pad),
  }));
}

function overlapArea(a: NormRect, b: NormRect): number {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w);
  const y1 = Math.min(a.y + a.h, b.y + b.h);
  if (x1 <= x0 || y1 <= y0) return 0;
  return (x1 - x0) * (y1 - y0);
}

export type WorkRailCandidate = NormRect & {
  id: 'right' | 'left' | 'bottom' | 'top';
  score: number;
  /** False when every candidate collides with the question — caller should prefer chat panel. */
  safe: boolean;
};

/**
 * Pick a stable explanation rail: prefer wide vertical gutters beside the figure,
 * then horizontal bands. Never force a right rail over diagram content.
 */
export function chooseWorkRail(opts: {
  figure: NormRect | null;
  obstacles?: NormRect[];
  inkGrid?: InkGrid | null;
  minW?: number;
  minH?: number;
}): WorkRailCandidate {
  const minW = opts.minW ?? MIN_RAIL_W;
  const minH = opts.minH ?? MIN_RAIL_H;
  const fig = opts.figure ?? { x: 0.25, y: 0.25, w: 0.35, h: 0.4 };
  const obstacles = opts.obstacles ?? [];

  const candidates: WorkRailCandidate[] = [
    {
      id: 'right',
      x: Math.min(1 - MARGIN - minW, fig.x + fig.w + MARGIN),
      y: MARGIN,
      w: Math.max(0, 1 - MARGIN - Math.min(1 - MARGIN - minW, fig.x + fig.w + MARGIN)),
      h: 1 - 2 * MARGIN,
      score: 0,
      safe: true,
    },
    {
      id: 'left',
      x: MARGIN,
      y: MARGIN,
      w: Math.max(0, fig.x - 2 * MARGIN),
      h: 1 - 2 * MARGIN,
      score: 0,
      safe: true,
    },
    {
      id: 'bottom',
      x: MARGIN,
      y: Math.min(1 - MARGIN - minH, fig.y + fig.h + MARGIN),
      w: 1 - 2 * MARGIN,
      h: Math.max(0, 1 - MARGIN - Math.min(1 - MARGIN - minH, fig.y + fig.h + MARGIN)),
      score: 0,
      safe: true,
    },
    {
      id: 'top',
      x: MARGIN,
      y: MARGIN,
      w: 1 - 2 * MARGIN,
      h: Math.max(0, fig.y - 2 * MARGIN),
      score: 0,
      safe: true,
    },
  ];

  for (const c of candidates) {
    c.w = Math.max(0, Math.min(c.w, 1 - c.x - MARGIN));
    c.h = Math.max(0, Math.min(c.h, 1 - c.y - MARGIN));
    let score = c.w * c.h;
    if (c.w < minW * 0.85 || c.h < minH * 0.85) score *= 0.2;

    const figOverlap = overlapArea(c, fig);
    if (figOverlap > 0) {
      score *= Math.max(0.01, 1 - figOverlap / Math.max(0.0001, c.w * c.h));
      c.safe = false;
    }
    for (const o of obstacles) {
      const oArea = overlapArea(c, o);
      if (oArea > 0) {
        score *= Math.max(0.05, 1 - oArea / Math.max(0.0001, c.w * c.h));
        c.safe = false;
      }
    }
    if (opts.inkGrid) {
      const ink = inkDensityInRect(opts.inkGrid, c);
      if (ink > MAX_RAIL_INK) {
        score *= Math.max(0.02, 1 - ink);
        c.safe = false;
      } else {
        score *= 1 - ink * 0.5;
      }
    }
    // Mild bias only among otherwise equal safe rails — never overrides safety.
    const bias = c.id === 'right' ? 0.002 : c.id === 'left' ? 0.0015 : c.id === 'bottom' ? 0.001 : 0;
    c.score = score + bias;
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  // If the winner is tiny, still return it marked unsafe — do NOT invent a
  // full-height right rail that covers the question.
  if (best.w < minW * 0.45 || best.h < minH * 0.45) {
    best.safe = false;
  }
  return best;
}

export type LaidOutWorkBoard = {
  /** Stable step index within the lesson rail. */
  index: number;
  /** Top-left of the board in normalized coords (after scroll). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Logical Y before scroll (for scroll math). */
  logicalY: number;
  label: string;
  active: boolean;
};

export type WorkBoardLayoutResult = {
  rail: WorkRailCandidate;
  boards: LaidOutWorkBoard[];
  /** Content height in normalized units. */
  contentHeight: number;
  /** Scroll offset in normalized units (0 = top). */
  scrollY: number;
  /** True when content exceeds the rail — caller may enable wheel scrolling. */
  scrollable: boolean;
  /** Interactive hit target for the rail (normalized). */
  hitRect: NormRect;
  /**
   * When false, no desktop gutter is safe — keep boards cumulative but the UI
   * should prefer the tutoring panel for readability instead of covering the question.
   */
  safe: boolean;
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Lay out all cumulative work boards into a non-overlapping vertical (or
 * wrapped) stack inside the chosen rail. When content overflows, keep every
 * board in the model and scroll so `activeIndex` stays visible.
 */
export function layoutWorkBoards(opts: {
  texts: string[];
  canvasW: number;
  canvasH: number;
  figure?: NormRect | null;
  obstacles?: NormRect[];
  inkGrid?: InkGrid | null;
  /** Which board is emphasized / brought into view. */
  activeIndex?: number;
  /** Current scroll (normalized); ignored when bringing active into view. */
  scrollY?: number;
  autoScrollActive?: boolean;
}): WorkBoardLayoutResult {
  const rail = chooseWorkRail({
    figure: opts.figure ?? null,
    obstacles: opts.obstacles,
    inkGrid: opts.inkGrid,
  });
  const activeIndex = opts.activeIndex ?? Math.max(0, opts.texts.length - 1);
  const boards: LaidOutWorkBoard[] = [];
  let cursorY = rail.y;
  let contentBottom = rail.y;

  // Prefer a single stable vertical column. When width is generous and height is
  // short, pack into two columns without overlapping slots.
  const sizes = opts.texts.map((label) => estimateWorkBoardSize(label ?? '', opts.canvasW, opts.canvasH));
  const totalVertical =
    sizes.reduce((sum, s) => sum + s.h, 0) + Math.max(0, opts.texts.length - 1) * GAP;
  const useTwoColumns = totalVertical > rail.h && rail.w >= MIN_RAIL_W * 1.6 && opts.texts.length > 2;

  if (useTwoColumns) {
    const colW = (rail.w - GAP) / 2;
    const colY = [rail.y, rail.y];
    for (let i = 0; i < opts.texts.length; i++) {
      const label = opts.texts[i] ?? '';
      const size = sizes[i];
      const col = colY[0] <= colY[1] ? 0 : 1;
      const x = rail.x + col * (colW + GAP);
      const logicalY = colY[col];
      const w = Math.min(size.w, colW);
      const h = size.h;
      boards.push({
        index: i,
        x,
        y: logicalY,
        w,
        h,
        logicalY,
        label,
        active: i === activeIndex,
      });
      colY[col] = logicalY + h + GAP;
      contentBottom = Math.max(contentBottom, logicalY + h);
    }
  } else {
    for (let i = 0; i < opts.texts.length; i++) {
      const label = opts.texts[i] ?? '';
      const size = sizes[i];
      const w = Math.min(size.w, rail.w);
      const h = size.h;
      const logicalY = cursorY;
      boards.push({
        index: i,
        x: rail.x,
        y: logicalY,
        w,
        h,
        logicalY,
        label,
        active: i === activeIndex,
      });
      cursorY = logicalY + h + GAP;
      contentBottom = Math.max(contentBottom, logicalY + h);
    }
  }

  const contentHeight = Math.max(0, contentBottom - rail.y);
  const scrollable = contentHeight > rail.h + 0.001;
  let scrollY = opts.scrollY ?? 0;
  if (scrollable) {
    const maxScroll = Math.max(0, contentHeight - rail.h);
    if (opts.autoScrollActive !== false && boards[activeIndex]) {
      const active = boards[activeIndex];
      const targetTop = active.logicalY - rail.y;
      const targetBottom = targetTop + active.h;
      if (targetTop < scrollY) scrollY = targetTop;
      if (targetBottom > scrollY + rail.h) scrollY = targetBottom - rail.h;
    }
    scrollY = clamp(scrollY, 0, maxScroll);
  } else {
    scrollY = 0;
  }

  for (const b of boards) {
    b.y = b.logicalY - scrollY;
    // Keep boards horizontally inside the rail.
    b.x = clamp(b.x, rail.x, rail.x + rail.w - b.w);
  }

  return {
    rail,
    boards,
    contentHeight,
    scrollY,
    scrollable,
    hitRect: { x: rail.x, y: rail.y, w: rail.w, h: Math.min(rail.h, Math.max(contentHeight, MIN_RAIL_H)) },
    safe: rail.safe,
  };
}

/**
 * Assign non-overlapping coords to every `work` shape in order.
 * Non-work shapes are left untouched. Returns a new array.
 */
export function relocateWorkShapes(
  shapes: CanvasDrawShape[],
  canvasW: number,
  canvasH: number,
  opts?: {
    figure?: NormRect | null;
    obstacles?: NormRect[];
    points?: Array<{ x: number; y: number }>;
    inkGrid?: InkGrid | null;
    activeWorkIndex?: number;
    scrollY?: number;
    /** When false, keep scrollY instead of bringing the active board into view. */
    autoScrollActive?: boolean;
  }
): { shapes: CanvasDrawShape[]; layout: WorkBoardLayoutResult } {
  const works = shapes.filter((s) => s.kind === 'work');
  const figure =
    opts?.figure !== undefined ? opts.figure : figureOccupancyFromShapes(shapes);
  const pointObstacles = pointObstacleRects(opts?.points ?? []);
  const layout = layoutWorkBoards({
    texts: works.map((w) => w.label ?? ''),
    canvasW,
    canvasH,
    figure,
    obstacles: [...(opts?.obstacles ?? []), ...pointObstacles],
    inkGrid: opts?.inkGrid,
    activeIndex: opts?.activeWorkIndex ?? works.length - 1,
    scrollY: opts?.scrollY,
    autoScrollActive: opts?.autoScrollActive,
  });

  let workIdx = 0;
  const next = shapes.map((shape) => {
    if (shape.kind !== 'work') return shape;
    const board = layout.boards[workIdx++];
    if (!board) return shape;
    // drawWorkLine left-anchors at (x, y) with y as vertical center of the board.
    return {
      ...shape,
      coords: [board.x, board.y + board.h / 2],
    };
  });
  return { shapes: next, layout };
}

/**
 * Place a single new work board given already-placed work shapes (and optional
 * figure marks) already on the overlay.
 */
export function placeWorkBoard(
  shape: CanvasDrawShape,
  existing: CanvasDrawShape[],
  canvasW: number,
  canvasH: number,
  opts?: {
    scrollY?: number;
    obstacles?: NormRect[];
    points?: Array<{ x: number; y: number }>;
    inkGrid?: InkGrid | null;
  }
): { shape: CanvasDrawShape; layout: WorkBoardLayoutResult } {
  if (shape.kind !== 'work') {
    return {
      shape,
      layout: layoutWorkBoards({ texts: [], canvasW, canvasH }),
    };
  }
  const combined = [...existing.filter((s) => s.kind === 'work' || isContentShape(s)), shape];
  const { shapes, layout } = relocateWorkShapes(combined, canvasW, canvasH, {
    scrollY: opts?.scrollY,
    obstacles: opts?.obstacles,
    points: opts?.points,
    inkGrid: opts?.inkGrid,
    activeWorkIndex: combined.filter((s) => s.kind === 'work').length - 1,
  });
  const placed = shapes.filter((s) => s.kind === 'work').at(-1) ?? shape;
  return { shape: placed, layout };
}

/**
 * After work boards are relocated, move a work-adjacent pointer to sit beside
 * the active board. Diagram-targeted pointers (far from the original work) stay put.
 */
export function syncPointerToRelocatedWork(opts: {
  pointer: { x: number; y: number } | null;
  /** Work coords before relocation (model / pre-layout). */
  previousWork: { x: number; y: number } | null;
  /** Work coords after relocation. */
  nextWork: { x: number; y: number } | null;
  radius?: number;
  gap?: number;
}): { x: number; y: number; label: string } | null {
  if (!opts.pointer || !opts.previousWork || !opts.nextWork) return null;
  const radius = opts.radius ?? 0.12;
  const gap = opts.gap ?? 0.018;
  if (Math.hypot(opts.pointer.x - opts.previousWork.x, opts.pointer.y - opts.previousWork.y) > radius) {
    return null;
  }
  return {
    x: Math.max(0.01, opts.nextWork.x - gap),
    y: opts.nextWork.y,
    label: '',
  };
}

/** True when two work boards' estimated boxes overlap (normalized). */
export function workBoardsOverlap(
  a: { coords: number[]; label?: string },
  b: { coords: number[]; label?: string },
  canvasW: number,
  canvasH: number,
  pad = 0.004
): boolean {
  const sa = estimateWorkBoardSize(a.label ?? '', canvasW, canvasH);
  const sb = estimateWorkBoardSize(b.label ?? '', canvasW, canvasH);
  const ra: NormRect = { x: a.coords[0], y: a.coords[1] - sa.h / 2, w: sa.w, h: sa.h };
  const rb: NormRect = { x: b.coords[0], y: b.coords[1] - sb.h / 2, w: sb.w, h: sb.h };
  return overlap(ra, rb, pad);
}
