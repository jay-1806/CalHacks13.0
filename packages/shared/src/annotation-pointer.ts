/**
 * Pure geometry + style constants for Quicky.AI on-screen teaching pointers.
 * Placement prefers empty space beside a known content rect; with only a point,
 * uses a conservative screen-aware offset (no OCR / invented text bounds).
 */

export type PointerSide = 'above' | 'below' | 'left' | 'right';

export type RectLike = { x: number; y: number; w: number; h: number };

function annotationRectsOverlap(a: RectLike, b: RectLike, pad = 0): boolean {
  return !(
    a.x + a.w + pad <= b.x ||
    b.x + b.w + pad <= a.x ||
    a.y + a.h + pad <= b.y ||
    b.y + b.h + pad <= a.y
  );
}

export const ANNOTATION_POINTER = {
  /** Filled focus disc radius (CSS px). */
  outerR: 5.5,
  /** Inner highlight radius. */
  innerR: 2,
  /** Leader / ring stroke. */
  stroke: 1.65,
  /** Keep the tip this far outside the target point / content edge. */
  tipClearance: 8,
  /** Length of the thin leader from offset marker toward the target. */
  leaderLen: 16,
  /** Idle scale amplitude (0 = none). */
  idleAmp: 0.05,
  /** Arrival ring max radius. */
  burstMaxR: 16,
  /** Arrival ring duration ms (visual only; does not affect narration timing). */
  burstMs: 280,
  /** Trail point radius. */
  trailR: 2.2,
  /** Max trail points kept visually. */
  trailMax: 4,
} as const;

export const ANNOTATION_INK = {
  /** Stroke width range for diagram marks (CSS px). */
  minWidth: 1.7,
  maxWidth: 2.6,
  scale: 0.0022,
  /** Arrowhead size range. */
  arrowHeadMin: 7,
  arrowHeadMax: 10,
  arrowHeadFactor: 0.11,
  /** Minimum circle radius on canvas. */
  circleMinR: 8,
  /** Highlight opacity / thickness factor (relative to region height). */
  highlightAlpha: 0.22,
  highlightMinWidth: 8,
  highlightHeightFactor: 0.55,
  /** Soft halo beyond stroke (px). */
  haloExtra: 2.2,
} as const;

export function expandRect(r: RectLike, pad: number): RectLike {
  return { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 };
}

export function pointInRect(px: number, py: number, r: RectLike, pad = 0): boolean {
  return (
    px >= r.x - pad &&
    py >= r.y - pad &&
    px <= r.x + r.w + pad &&
    py <= r.y + r.h + pad
  );
}

/** Candidate offset anchors around a target point (marker center relative to target). */
export function pointerOffsetCandidates(
  tx: number,
  ty: number,
  clearance: number = ANNOTATION_POINTER.tipClearance + ANNOTATION_POINTER.leaderLen
): Array<{ side: PointerSide; x: number; y: number }> {
  return [
    { side: 'above', x: tx, y: ty - clearance },
    { side: 'below', x: tx, y: ty + clearance },
    { side: 'left', x: tx - clearance, y: ty },
    { side: 'right', x: tx + clearance, y: ty },
  ];
}

function sideOutsideContent(side: PointerSide, content: RectLike, clearance: number): { x: number; y: number } {
  const cx = content.x + content.w / 2;
  const cy = content.y + content.h / 2;
  switch (side) {
    case 'above':
      return { x: cx, y: content.y - clearance };
    case 'below':
      return { x: cx, y: content.y + content.h + clearance };
    case 'left':
      return { x: content.x - clearance, y: cy };
    case 'right':
      return { x: content.x + content.w + clearance, y: cy };
  }
}

export interface PointerAnchorInput {
  targetX: number;
  targetY: number;
  viewportW: number;
  viewportH: number;
  /** Known content footprint to avoid (equation/region). Optional. */
  contentBounds?: RectLike | null;
  /** Other active obstacles (bubbles, marks). */
  obstacles?: RectLike[];
  clearance?: number;
  markerR?: number;
}

export interface PointerAnchorResult {
  markerX: number;
  markerY: number;
  tipX: number;
  tipY: number;
  side: PointerSide;
  /** True when marker stays clear of contentBounds (if provided). */
  clearOfContent: boolean;
}

/**
 * Place a compact teaching pointer beside the target — never centered on content
 * when bounds are known. With only a point, offsets conservatively toward open space.
 */
export function choosePointerAnchor(input: PointerAnchorInput): PointerAnchorResult {
  const clearance = input.clearance ?? ANNOTATION_POINTER.tipClearance + ANNOTATION_POINTER.outerR;
  const markerR = input.markerR ?? ANNOTATION_POINTER.outerR;
  const { targetX: tx, targetY: ty, viewportW: W, viewportH: H } = input;
  const content = input.contentBounds ?? null;
  const obstacles = input.obstacles ?? [];

  const tipClear = ANNOTATION_POINTER.tipClearance;
  const tipToward = (mx: number, my: number) => {
    const dx = tx - mx;
    const dy = ty - my;
    const len = Math.hypot(dx, dy) || 1;
    const stop = Math.max(0, len - tipClear);
    return { tipX: mx + (dx / len) * stop, tipY: my + (dy / len) * stop };
  };

  const candidates: Array<{ side: PointerSide; x: number; y: number }> = content
    ? (['above', 'below', 'left', 'right'] as PointerSide[]).map((side) => ({
        side,
        ...sideOutsideContent(side, content, clearance + markerR),
      }))
    : pointerOffsetCandidates(tx, ty, clearance + markerR);

  const score = (x: number, y: number, side: PointerSide) => {
    const marker: RectLike = {
      x: x - markerR,
      y: y - markerR,
      w: markerR * 2,
      h: markerR * 2,
    };
    let s = 0;
    // Prefer on-screen.
    if (x < markerR || y < markerR || x > W - markerR || y > H - markerR) s -= 400;
    // Prefer clear of content.
    if (content && annotationRectsOverlap(marker, expandRect(content, 2))) s -= 500;
    // Prefer clear of other obstacles.
    for (const o of obstacles) {
      if (annotationRectsOverlap(marker, o, 4)) s -= 120;
    }
    // Prefer closer to target (connected feel).
    s -= Math.hypot(x - tx, y - ty) * 0.08;
    // Mild preference: above > right > left > below for reading.
    const pref = { above: 12, right: 8, left: 4, below: 0 }[side];
    s += pref;
    // Prefer more room to the viewport edge behind the marker.
    if (side === 'above') s += Math.min(40, y);
    if (side === 'below') s += Math.min(40, H - y);
    if (side === 'left') s += Math.min(40, x);
    if (side === 'right') s += Math.min(40, W - x);
    return s;
  };

  let best = candidates[0];
  let bestScore = -Infinity;
  for (const c of candidates) {
    const sc = score(c.x, c.y, c.side);
    if (sc > bestScore) {
      best = c;
      bestScore = sc;
    }
  }

  // Clamp marker into the viewport.
  const markerX = Math.min(W - markerR - 2, Math.max(markerR + 2, best.x));
  const markerY = Math.min(H - markerR - 2, Math.max(markerR + 2, best.y));
  const tip = tipToward(markerX, markerY);
  const clearOfContent = content
    ? !pointInRect(markerX, markerY, content, markerR + 2)
    : !pointInRect(markerX, markerY, { x: tx - 4, y: ty - 4, w: 8, h: 8 }, 0);

  return {
    markerX,
    markerY,
    tipX: tip.tipX,
    tipY: tip.tipY,
    side: best.side,
    clearOfContent,
  };
}

/** Shorten an arrow tip so the head stops short of covering the endpoint. */
export function shortenSegmentTip(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  tipClearancePx: number
): { x1: number; y1: number; x2: number; y2: number } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy);
  if (len <= tipClearancePx + 1) return { x1, y1, x2, y2 };
  const t = (len - tipClearancePx) / len;
  return { x1, y1, x2: x1 + dx * t, y2: y1 + dy * t };
}

/** Approximate obstacle rect for bubble layout around the refined pointer. */
export function pointerObstacleRect(markerX: number, markerY: number, tipX: number, tipY: number): RectLike {
  const pad = 10;
  const minX = Math.min(markerX, tipX) - pad;
  const minY = Math.min(markerY, tipY) - pad - 28; // label sits above marker
  const maxX = Math.max(markerX, tipX) + pad;
  const maxY = Math.max(markerY, tipY) + pad;
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function inkStrokeWidth(minDim: number): number {
  return Math.max(ANNOTATION_INK.minWidth, Math.min(ANNOTATION_INK.maxWidth, minDim * ANNOTATION_INK.scale));
}

export function arrowHeadSize(lengthPx: number): number {
  return Math.max(
    ANNOTATION_INK.arrowHeadMin,
    Math.min(ANNOTATION_INK.arrowHeadMax, lengthPx * ANNOTATION_INK.arrowHeadFactor)
  );
}
