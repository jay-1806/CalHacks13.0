/** Shared geometry helpers for Quicky.AI launcher menu + drag (pure, testable). */

export const DRAG_THRESHOLD_PX = 7;
export const ITEM_DIAMETER = 48;
export const LAUNCHER_DIAMETER = 54;
/** Open-space PLUS layout center-to-center distance. */
export const PLUS_RADIUS = 120;
export const FAN_RADIUS = 118;
export const PREFERRED_SPREAD_DEG = 150;
export const CORNER_SPREAD_DEG = 90;
/** Shadow / hover-scale padding around content circles. */
export const MENU_PAD = 16;
export const PLUS_CLEARANCE = 18;
/** Extra allowance so whileHover scale (~1.06) does not clip shadows. */
export const HOVER_SCALE_PAD = 4;

/** @deprecated Kept for import compatibility — visible labels are removed. */
export const RING_RADIUS = PLUS_RADIUS;

export type EdgeHints = {
  left: boolean;
  right: boolean;
  top: boolean;
  bottom: boolean;
};

export type WorkArea = { x: number; y: number; width: number; height: number };

/** Legacy outward-side hint (no longer used for visible UI). */
export type LabelSide = 'above' | 'below' | 'left' | 'right';

export type LayoutMode = 'plus' | 'fan';

export type PointerInteraction = 'idle' | 'pressed' | 'dragging';

export interface ArcLayoutInput {
  anchor: { x: number; y: number };
  workArea: WorkArea;
  itemCount: number;
  itemDiameter?: number;
  launcherDiameter?: number;
  plusRadius?: number;
  fanRadius?: number;
}

export interface ArcItemPosition {
  x: number;
  y: number;
  angle: number;
  /** Legacy field — unused for display; kept for test compatibility. */
  label: LabelSide;
}

export interface ArcLayoutResult {
  mode: LayoutMode;
  centerAngle: number;
  spreadAngle: number;
  radius: number;
  positions: ArcItemPosition[];
  window: { x: number; y: number; width: number; height: number };
  launcherOffset: { x: number; y: number };
}

/**
 * PLUS layout for Voice / Capture / Text / Canvas (screen y-down):
 * Voice top (−90°), Capture left (180°), Text right (0°), Canvas bottom (90°).
 */
export const PLUS_SLOTS: ReadonlyArray<{ angleDeg: number; label: LabelSide }> = [
  { angleDeg: -90, label: 'above' },
  { angleDeg: 180, label: 'left' },
  { angleDeg: 0, label: 'right' },
  { angleDeg: 90, label: 'below' },
];

export function exceedsDragThreshold(dx: number, dy: number, threshold = DRAG_THRESHOLD_PX): boolean {
  return dx * dx + dy * dy >= threshold * threshold;
}

export function isPrimaryButtonDown(buttons: number): boolean {
  return (buttons & 1) === 1;
}

export function clampWindowOrigin(
  x: number,
  y: number,
  width: number,
  height: number,
  work: WorkArea
): { x: number; y: number } {
  const maxX = work.x + Math.max(0, work.width - width);
  const maxY = work.y + Math.max(0, work.height - height);
  return {
    x: Math.min(Math.max(Math.round(x), work.x), maxX),
    y: Math.min(Math.max(Math.round(y), work.y), maxY),
  };
}

export function boundsPreservingCenter(
  current: { x: number; y: number; width: number; height: number },
  nextWidth: number,
  nextHeight: number,
  work: WorkArea
): { x: number; y: number; width: number; height: number } {
  const cx = current.x + current.width / 2;
  const cy = current.y + current.height / 2;
  const origin = clampWindowOrigin(cx - nextWidth / 2, cy - nextHeight / 2, nextWidth, nextHeight, work);
  return { ...origin, width: nextWidth, height: nextHeight };
}

export function edgeHintsForCenter(
  cx: number,
  cy: number,
  work: WorkArea,
  margin = 180
): EdgeHints {
  return {
    left: cx - work.x < margin,
    right: work.x + work.width - cx < margin,
    top: cy - work.y < margin,
    bottom: work.y + work.height - cy < margin,
  };
}

export function chordDistance(radius: number, deltaRadians: number): number {
  return 2 * radius * Math.sin(Math.abs(deltaRadians) / 2);
}

export function outwardLabelSide(x: number, y: number): LabelSide {
  if (Math.abs(y) >= Math.abs(x)) return y < 0 ? 'above' : 'below';
  return x < 0 ? 'left' : 'right';
}

export function labelSide(x: number, y: number): LabelSide {
  return outwardLabelSide(x, y);
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Exact cardinal PLUS positions — no cos/sin float drift on the four-action case.
 * Centers relative to the launcher origin (0, 0).
 */
export function positionsOnPlus(count: number, radius: number): ArcItemPosition[] {
  if (count <= 0) return [];
  if (count === 4) {
    return [
      { x: 0, y: -radius, angle: degToRad(-90), label: 'above' },
      { x: -radius, y: 0, angle: degToRad(180), label: 'left' },
      { x: radius, y: 0, angle: degToRad(0), label: 'right' },
      { x: 0, y: radius, angle: degToRad(90), label: 'below' },
    ];
  }
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    return { x, y, angle, label: outwardLabelSide(x, y) };
  });
}

export function positionsOnRing(count: number, radius: number): ArcItemPosition[] {
  return positionsOnPlus(count, radius);
}

export function chooseFanOrientation(
  edges: EdgeHints,
  preferredSpreadDeg = PREFERRED_SPREAD_DEG
): { centerAngle: number; spreadAngle: number } {
  const { left, right, top, bottom } = edges;
  const corners = [left, right, top, bottom].filter(Boolean).length;

  if (corners >= 2) {
    let centerDeg = -135;
    if (right && bottom) centerDeg = -135;
    else if (left && bottom) centerDeg = -45;
    else if (right && top) centerDeg = 135;
    else if (left && top) centerDeg = 45;
    return { centerAngle: degToRad(centerDeg), spreadAngle: degToRad(CORNER_SPREAD_DEG) };
  }
  if (right) return { centerAngle: degToRad(180), spreadAngle: degToRad(preferredSpreadDeg) };
  if (left) return { centerAngle: degToRad(0), spreadAngle: degToRad(preferredSpreadDeg) };
  if (bottom) return { centerAngle: degToRad(-90), spreadAngle: degToRad(preferredSpreadDeg) };
  if (top) return { centerAngle: degToRad(90), spreadAngle: degToRad(preferredSpreadDeg) };
  return { centerAngle: degToRad(-90), spreadAngle: degToRad(preferredSpreadDeg) };
}

function positionsOnFan(
  count: number,
  radius: number,
  centerAngle: number,
  spreadAngle: number
): ArcItemPosition[] {
  if (count <= 0) return [];
  if (count === 1) {
    const x = Math.cos(centerAngle) * radius;
    const y = Math.sin(centerAngle) * radius;
    return [{ x, y, angle: centerAngle, label: outwardLabelSide(x, y) }];
  }
  const start = centerAngle - spreadAngle / 2;
  const step = spreadAngle / (count - 1);
  return Array.from({ length: count }, (_, i) => {
    const angle = start + i * step;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    return { x, y, angle, label: outwardLabelSide(x, y) };
  });
}

function contentBounds(
  anchor: { x: number; y: number },
  positions: ArcItemPosition[],
  launcherDiameter: number,
  itemDiameter: number
): { minX: number; maxX: number; minY: number; maxY: number } {
  const halfL = launcherDiameter / 2 + HOVER_SCALE_PAD;
  const halfI = itemDiameter / 2 + HOVER_SCALE_PAD;
  let minX = anchor.x - halfL;
  let maxX = anchor.x + halfL;
  let minY = anchor.y - halfL;
  let maxY = anchor.y + halfL;

  for (const p of positions) {
    const ix = anchor.x + p.x;
    const iy = anchor.y + p.y;
    minX = Math.min(minX, ix - halfI);
    maxX = Math.max(maxX, ix + halfI);
    minY = Math.min(minY, iy - halfI);
    maxY = Math.max(maxY, iy + halfI);
  }

  return { minX, maxX, minY, maxY };
}

function fitsInWork(
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  work: WorkArea
): boolean {
  return (
    bounds.minX >= work.x &&
    bounds.maxX <= work.x + work.width &&
    bounds.minY >= work.y &&
    bounds.maxY <= work.y + work.height
  );
}

function buildWindow(
  anchor: { x: number; y: number },
  positions: ArcItemPosition[],
  launcherDiameter: number,
  itemDiameter: number,
  work: WorkArea
): { window: ArcLayoutResult['window']; launcherOffset: { x: number; y: number } } {
  const b = contentBounds(anchor, positions, launcherDiameter, itemDiameter);
  let winW = Math.ceil(b.maxX - b.minX + MENU_PAD * 2);
  let winH = Math.ceil(b.maxY - b.minY + MENU_PAD * 2);
  winW = Math.min(winW, work.width);
  winH = Math.min(winH, work.height);
  const idealX = Math.round(b.minX - MENU_PAD);
  const idealY = Math.round(b.minY - MENU_PAD);
  const origin = clampWindowOrigin(idealX, idealY, winW, winH, work);
  return {
    window: { x: origin.x, y: origin.y, width: winW, height: winH },
    launcherOffset: { x: anchor.x - origin.x, y: anchor.y - origin.y },
  };
}

/** Midpoint of opposite action centers must equal the launcher origin (0, 0). */
export function plusMidpointsAreCentered(positions: ArcItemPosition[]): boolean {
  if (positions.length !== 4) return false;
  const [voice, capture, text, canvas] = positions;
  const midVT = { x: (voice.x + canvas.x) / 2, y: (voice.y + canvas.y) / 2 };
  const midCT = { x: (capture.x + text.x) / 2, y: (capture.y + text.y) / 2 };
  return (
    Math.abs(midVT.x) < 1e-9 &&
    Math.abs(midVT.y) < 1e-9 &&
    Math.abs(midCT.x) < 1e-9 &&
    Math.abs(midCT.y) < 1e-9
  );
}

/** All four action centers share the same radial distance from the origin. */
export function equalRadialDistances(positions: ArcItemPosition[], radius: number): boolean {
  return positions.every((p) => Math.abs(Math.hypot(p.x, p.y) - radius) < 1e-9);
}

export type Point = { x: number; y: number };

export type RectLike = { left: number; top: number; width: number; height: number };

/** Center of a DOMRect / getBoundingClientRect result. */
export function getCenter(rect: RectLike): Point {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

export type PlusAlignmentReport = {
  launcher: Point;
  voice: Point;
  capture: Point;
  text: Point;
  canvas: Point;
  horizontalMidpoint: Point;
  verticalMidpoint: Point;
  horizontalError: Point;
  verticalError: Point;
  distances: { voice: number; capture: number; text: number; canvas: number };
  maxRadialDelta: number;
  aligned: boolean;
};

/**
 * Compare rendered element centers after the open animation settles.
 * Tolerates ≤1 CSS pixel of midpoint error (sub-pixel / DPR rounding).
 */
export function measurePlusAlignment(
  launcher: Point,
  voice: Point,
  capture: Point,
  text: Point,
  canvas: Point,
  tolerance = 1
): PlusAlignmentReport {
  const horizontalMidpoint = {
    x: (capture.x + text.x) / 2,
    y: (capture.y + text.y) / 2,
  };
  const verticalMidpoint = {
    x: (voice.x + canvas.x) / 2,
    y: (voice.y + canvas.y) / 2,
  };
  const horizontalError = {
    x: horizontalMidpoint.x - launcher.x,
    y: horizontalMidpoint.y - launcher.y,
  };
  const verticalError = {
    x: verticalMidpoint.x - launcher.x,
    y: verticalMidpoint.y - launcher.y,
  };
  const distances = {
    voice: Math.hypot(voice.x - launcher.x, voice.y - launcher.y),
    capture: Math.hypot(capture.x - launcher.x, capture.y - launcher.y),
    text: Math.hypot(text.x - launcher.x, text.y - launcher.y),
    canvas: Math.hypot(canvas.x - launcher.x, canvas.y - launcher.y),
  };
  const vals = Object.values(distances);
  const maxRadialDelta = Math.max(...vals) - Math.min(...vals);
  const aligned =
    Math.abs(horizontalError.x) <= tolerance &&
    Math.abs(horizontalError.y) <= tolerance &&
    Math.abs(verticalError.x) <= tolerance &&
    Math.abs(verticalError.y) <= tolerance &&
    maxRadialDelta <= tolerance * 2;

  return {
    launcher,
    voice,
    capture,
    text,
    canvas,
    horizontalMidpoint,
    verticalMidpoint,
    horizontalError,
    verticalError,
    distances,
    maxRadialDelta,
    aligned,
  };
}

/**
 * Prefer a balanced PLUS layout; fall back to an inward fan near edges/corners.
 * Bounds cover only the launcher + four action circles (no text labels).
 */
export function computeArcLayout(input: ArcLayoutInput): ArcLayoutResult {
  const {
    anchor,
    workArea,
    itemCount,
    itemDiameter = ITEM_DIAMETER,
    launcherDiameter = LAUNCHER_DIAMETER,
    plusRadius = PLUS_RADIUS,
    fanRadius = FAN_RADIUS,
  } = input;

  let radius = Math.max(plusRadius, launcherDiameter / 2 + itemDiameter / 2 + PLUS_CLEARANCE);
  const plusPositions = positionsOnPlus(itemCount, radius);
  const plusBounds = contentBounds(anchor, plusPositions, launcherDiameter, itemDiameter);

  if (fitsInWork(plusBounds, workArea)) {
    const { window, launcherOffset } = buildWindow(
      anchor,
      plusPositions,
      launcherDiameter,
      itemDiameter,
      workArea
    );
    return {
      mode: 'plus',
      centerAngle: 0,
      spreadAngle: Math.PI * 2,
      radius,
      positions: plusPositions,
      window,
      launcherOffset,
    };
  }

  const edges = edgeHintsForCenter(anchor.x, anchor.y, workArea);
  let { centerAngle, spreadAngle } = chooseFanOrientation(edges);
  radius = fanRadius;
  const minChord = itemDiameter + 10;
  if (itemCount >= 2) {
    const step = spreadAngle / (itemCount - 1);
    const chord = chordDistance(radius, step);
    if (chord < minChord) {
      radius = minChord / (2 * Math.sin(Math.max(step, 1e-3) / 2));
    }
  }

  let fanPositions = positionsOnFan(itemCount, radius, centerAngle, spreadAngle);

  for (let attempt = 0; attempt < 5; attempt++) {
    const b = contentBounds(anchor, fanPositions, launcherDiameter, itemDiameter);
    if (fitsInWork(b, workArea)) break;
    radius = Math.max(84, radius * 0.92);
    spreadAngle = Math.max(degToRad(72), spreadAngle * 0.92);
    fanPositions = positionsOnFan(itemCount, radius, centerAngle, spreadAngle);
  }

  const { window, launcherOffset } = buildWindow(
    anchor,
    fanPositions,
    launcherDiameter,
    itemDiameter,
    workArea
  );

  return {
    mode: 'fan',
    centerAngle,
    spreadAngle,
    radius,
    positions: fanPositions,
    window,
    launcherOffset,
  };
}

export function getRadialOffsets(
  count: number,
  radius: number,
  _edges?: EdgeHints
): Array<{ x: number; y: number; label: LabelSide }> {
  return positionsOnPlus(count, radius).map(({ x, y, label }) => ({ x, y, label }));
}

export function chooseArcOrientation(
  edges: EdgeHints,
  preferredSpreadDeg = PREFERRED_SPREAD_DEG
): { mode: 'open' | 'edge' | 'corner'; centerAngle: number; spreadAngle: number } {
  const corners = [edges.left, edges.right, edges.top, edges.bottom].filter(Boolean).length;
  const fan = chooseFanOrientation(edges, preferredSpreadDeg);
  const mode = corners >= 2 ? 'corner' : corners === 1 ? 'edge' : 'open';
  return { mode, ...fan };
}
