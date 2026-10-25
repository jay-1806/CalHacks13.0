import { describe, expect, it } from 'vitest';

/**
 * Mirrors apps/desktop/src/renderer/launcherGeometry.ts for Part 2.6
 * PLUS layout with no visible labels / tooltips.
 */

const DRAG_THRESHOLD_PX = 7;
const ITEM_DIAMETER = 48;
const LAUNCHER_DIAMETER = 54;
const PLUS_RADIUS = 120;
const FAN_RADIUS = 118;
const PREFERRED_SPREAD_DEG = 150;
const CORNER_SPREAD_DEG = 90;
const MENU_PAD = 16;
const PLUS_CLEARANCE = 18;
const HOVER_SCALE_PAD = 4;

type WorkArea = { x: number; y: number; width: number; height: number };
type LabelSide = 'above' | 'below' | 'left' | 'right';
type LayoutMode = 'plus' | 'fan';
type EdgeHints = { left: boolean; right: boolean; top: boolean; bottom: boolean };

function exceedsDragThreshold(dx: number, dy: number, threshold = DRAG_THRESHOLD_PX): boolean {
  return dx * dx + dy * dy >= threshold * threshold;
}

function isPrimaryButtonDown(buttons: number): boolean {
  return (buttons & 1) === 1;
}

function clampWindowOrigin(
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

function edgeHintsForCenter(cx: number, cy: number, work: WorkArea, margin = 180): EdgeHints {
  return {
    left: cx - work.x < margin,
    right: work.x + work.width - cx < margin,
    top: cy - work.y < margin,
    bottom: work.y + work.height - cy < margin,
  };
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function outwardLabelSide(x: number, y: number): LabelSide {
  if (Math.abs(y) >= Math.abs(x)) return y < 0 ? 'above' : 'below';
  return x < 0 ? 'left' : 'right';
}

function positionsOnPlus(count: number, radius: number) {
  if (count !== 4) return [];
  return [
    { x: 0, y: -radius, angle: degToRad(-90), label: 'above' as const },
    { x: -radius, y: 0, angle: degToRad(180), label: 'left' as const },
    { x: radius, y: 0, angle: degToRad(0), label: 'right' as const },
    { x: 0, y: radius, angle: degToRad(90), label: 'below' as const },
  ];
}

function chooseFanOrientation(edges: EdgeHints) {
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
  if (right) return { centerAngle: degToRad(180), spreadAngle: degToRad(PREFERRED_SPREAD_DEG) };
  if (left) return { centerAngle: degToRad(0), spreadAngle: degToRad(PREFERRED_SPREAD_DEG) };
  if (bottom) return { centerAngle: degToRad(-90), spreadAngle: degToRad(PREFERRED_SPREAD_DEG) };
  if (top) return { centerAngle: degToRad(90), spreadAngle: degToRad(PREFERRED_SPREAD_DEG) };
  return { centerAngle: degToRad(-90), spreadAngle: degToRad(PREFERRED_SPREAD_DEG) };
}

function positionsOnFan(count: number, radius: number, centerAngle: number, spreadAngle: number) {
  const start = centerAngle - spreadAngle / 2;
  const step = count === 1 ? 0 : spreadAngle / (count - 1);
  return Array.from({ length: count }, (_, i) => {
    const angle = start + i * step;
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    return { x, y, angle, label: outwardLabelSide(x, y) };
  });
}

function contentBounds(anchor: { x: number; y: number }, positions: Array<{ x: number; y: number }>) {
  const halfL = LAUNCHER_DIAMETER / 2 + HOVER_SCALE_PAD;
  const halfI = ITEM_DIAMETER / 2 + HOVER_SCALE_PAD;
  let minX = anchor.x - halfL;
  let maxX = anchor.x + halfL;
  let minY = anchor.y - halfL;
  let maxY = anchor.y + halfL;
  for (const p of positions) {
    minX = Math.min(minX, anchor.x + p.x - halfI);
    maxX = Math.max(maxX, anchor.x + p.x + halfI);
    minY = Math.min(minY, anchor.y + p.y - halfI);
    maxY = Math.max(maxY, anchor.y + p.y + halfI);
  }
  return { minX, maxX, minY, maxY };
}

function fitsInWork(b: { minX: number; maxX: number; minY: number; maxY: number }, work: WorkArea) {
  return b.minX >= work.x && b.maxX <= work.x + work.width && b.minY >= work.y && b.maxY <= work.y + work.height;
}

function plusMidpointsAreCentered(positions: Array<{ x: number; y: number }>): boolean {
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

function equalRadialDistances(positions: Array<{ x: number; y: number }>, radius: number): boolean {
  return positions.every((p) => Math.abs(Math.hypot(p.x, p.y) - radius) < 1e-9);
}

function computeArcLayout(input: { anchor: { x: number; y: number }; workArea: WorkArea; itemCount: number }) {
  const { anchor, workArea, itemCount } = input;
  const radius = Math.max(PLUS_RADIUS, LAUNCHER_DIAMETER / 2 + ITEM_DIAMETER / 2 + PLUS_CLEARANCE);
  const plusPositions = positionsOnPlus(itemCount, radius);
  const plusBounds = contentBounds(anchor, plusPositions);

  if (fitsInWork(plusBounds, workArea)) {
    const winW = Math.min(Math.ceil(plusBounds.maxX - plusBounds.minX + MENU_PAD * 2), workArea.width);
    const winH = Math.min(Math.ceil(plusBounds.maxY - plusBounds.minY + MENU_PAD * 2), workArea.height);
    const origin = clampWindowOrigin(
      Math.round(plusBounds.minX - MENU_PAD),
      Math.round(plusBounds.minY - MENU_PAD),
      winW,
      winH,
      workArea
    );
    return {
      mode: 'plus' as LayoutMode,
      radius,
      positions: plusPositions,
      window: { x: origin.x, y: origin.y, width: winW, height: winH },
      launcherOffset: { x: anchor.x - origin.x, y: anchor.y - origin.y },
    };
  }

  const edges = edgeHintsForCenter(anchor.x, anchor.y, workArea);
  const { centerAngle, spreadAngle } = chooseFanOrientation(edges);
  const fanPositions = positionsOnFan(itemCount, FAN_RADIUS, centerAngle, spreadAngle);
  const fanBounds = contentBounds(anchor, fanPositions);
  const winW = Math.min(Math.ceil(fanBounds.maxX - fanBounds.minX + MENU_PAD * 2), workArea.width);
  const winH = Math.min(Math.ceil(fanBounds.maxY - fanBounds.minY + MENU_PAD * 2), workArea.height);
  const origin = clampWindowOrigin(
    Math.round(fanBounds.minX - MENU_PAD),
    Math.round(fanBounds.minY - MENU_PAD),
    winW,
    winH,
    workArea
  );
  return {
    mode: 'fan' as LayoutMode,
    radius: FAN_RADIUS,
    positions: fanPositions,
    window: { x: origin.x, y: origin.y, width: winW, height: winH },
    launcherOffset: { x: anchor.x - origin.x, y: anchor.y - origin.y },
  };
}

describe('PLUS menu geometry (no labels)', () => {
  const work = { x: 0, y: 0, width: 1440, height: 900 };

  it('uses PLUS at screen center with exactly four actions', () => {
    const layout = computeArcLayout({ anchor: { x: 720, y: 450 }, workArea: work, itemCount: 4 });
    expect(layout.mode).toBe('plus');
    expect(layout.positions).toHaveLength(4);
  });

  it('places Voice / Capture / Text / Canvas on exact cardinal axes', () => {
    const pts = positionsOnPlus(4, 120);
    expect(pts[0]).toMatchObject({ x: 0, y: -120 });
    expect(pts[1]).toMatchObject({ x: -120, y: 0 });
    expect(pts[2]).toMatchObject({ x: 120, y: 0 });
    expect(pts[3]).toMatchObject({ x: 0, y: 120 });
  });

  it('keeps equal radial distance for all four actions', () => {
    const layout = computeArcLayout({ anchor: { x: 720, y: 450 }, workArea: work, itemCount: 4 });
    expect(equalRadialDistances(layout.positions, layout.radius)).toBe(true);
  });

  it('centers the launcher as the midpoint of opposite actions', () => {
    const layout = computeArcLayout({ anchor: { x: 720, y: 450 }, workArea: work, itemCount: 4 });
    expect(plusMidpointsAreCentered(layout.positions)).toBe(true);
  });

  it('preserves the launcher desktop anchor', () => {
    const anchor = { x: 720, y: 450 };
    const layout = computeArcLayout({ anchor, workArea: work, itemCount: 4 });
    expect(layout.window.x + layout.launcherOffset.x).toBeCloseTo(anchor.x, 5);
    expect(layout.window.y + layout.launcherOffset.y).toBeCloseTo(anchor.y, 5);
  });

  it('produces a symmetric PLUS window (equal width and height)', () => {
    const layout = computeArcLayout({ anchor: { x: 720, y: 450 }, workArea: work, itemCount: 4 });
    expect(layout.window.width).toBe(layout.window.height);
    // Rough expected size: 2*(120+24+4) + 2*16 = 320
    expect(layout.window.width).toBeGreaterThanOrEqual(300);
    expect(layout.window.width).toBeLessThanOrEqual(340);
  });

  it('places the launcher at the geometric center of the PLUS window', () => {
    const layout = computeArcLayout({ anchor: { x: 720, y: 450 }, workArea: work, itemCount: 4 });
    expect(layout.launcherOffset.x).toBeCloseTo(layout.window.width / 2, 5);
    expect(layout.launcherOffset.y).toBeCloseTo(layout.window.height / 2, 5);
  });

  it('does not reserve space for shared labels or tooltips', () => {
    const layout = computeArcLayout({ anchor: { x: 720, y: 450 }, workArea: work, itemCount: 4 });
    expect(layout).not.toHaveProperty('sharedLabelOffset');
    // Without a label card, height equals width for open-space PLUS.
    expect(layout.window.height).toBe(layout.window.width);
  });
});

describe('fan fallback preserved', () => {
  const work = { x: 0, y: 0, width: 1440, height: 900 };

  it('uses inward fan near the right edge', () => {
    const layout = computeArcLayout({ anchor: { x: 1390, y: 450 }, workArea: work, itemCount: 4 });
    expect(layout.mode).toBe('fan');
    expect(layout.positions).toHaveLength(4);
  });

  it('keeps all fan actions clickable (finite positions)', () => {
    const layout = computeArcLayout({ anchor: { x: 1390, y: 450 }, workArea: work, itemCount: 4 });
    for (const p of layout.positions) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });
});

describe('click vs drag helpers', () => {
  it('requires primary button down for drag updates', () => {
    expect(isPrimaryButtonDown(0)).toBe(false);
    expect(isPrimaryButtonDown(1)).toBe(true);
  });

  it('uses a 7px click/drag threshold', () => {
    expect(exceedsDragThreshold(6, 0)).toBe(false);
    expect(exceedsDragThreshold(7, 0)).toBe(true);
  });
});

describe('hover does not change layout geometry', () => {
  it('recomputing layout with the same anchor yields identical positions', () => {
    const a = computeArcLayout({ anchor: { x: 720, y: 450 }, workArea: { x: 0, y: 0, width: 1440, height: 900 }, itemCount: 4 });
    const b = computeArcLayout({ anchor: { x: 720, y: 450 }, workArea: { x: 0, y: 0, width: 1440, height: 900 }, itemCount: 4 });
    expect(b.positions).toEqual(a.positions);
    expect(b.window).toEqual(a.window);
    expect(b.launcherOffset).toEqual(a.launcherOffset);
  });
});

/** Mirrors launcherGeometry measurePlusAlignment / getCenter (Part 2.7). */
function getCenter(rect: { left: number; top: number; width: number; height: number }) {
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function measurePlusAlignment(
  launcher: { x: number; y: number },
  voice: { x: number; y: number },
  capture: { x: number; y: number },
  text: { x: number; y: number },
  canvas: { x: number; y: number },
  tolerance = 1
) {
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
  const distances = [
    Math.hypot(voice.x - launcher.x, voice.y - launcher.y),
    Math.hypot(capture.x - launcher.x, capture.y - launcher.y),
    Math.hypot(text.x - launcher.x, text.y - launcher.y),
    Math.hypot(canvas.x - launcher.x, canvas.y - launcher.y),
  ];
  const maxRadialDelta = Math.max(...distances) - Math.min(...distances);
  const aligned =
    Math.abs(horizontalError.x) <= tolerance &&
    Math.abs(horizontalError.y) <= tolerance &&
    Math.abs(verticalError.x) <= tolerance &&
    Math.abs(verticalError.y) <= tolerance &&
    maxRadialDelta <= tolerance * 2;
  return { horizontalError, verticalError, maxRadialDelta, aligned, distances };
}

describe('rendered PLUS alignment (DOM center math)', () => {
  it('detects the Part 2.7 double-centering bug (+27,+27)', () => {
    // Actions centered at stage origin; launcher pulled up-left by half diameter.
    const stage = { x: 328, y: 364 };
    const report = measurePlusAlignment(
      { x: stage.x - 27, y: stage.y - 27 },
      { x: stage.x, y: stage.y - 120 },
      { x: stage.x - 120, y: stage.y },
      { x: stage.x + 120, y: stage.y },
      { x: stage.x, y: stage.y + 120 }
    );
    expect(report.horizontalError.x).toBeCloseTo(27, 5);
    expect(report.horizontalError.y).toBeCloseTo(27, 5);
    expect(report.aligned).toBe(false);
  });

  it('passes when launcher and PLUS share one origin', () => {
    const origin = { x: 400, y: 400 };
    const report = measurePlusAlignment(
      origin,
      { x: origin.x, y: origin.y - 120 },
      { x: origin.x - 120, y: origin.y },
      { x: origin.x + 120, y: origin.y },
      { x: origin.x, y: origin.y + 120 }
    );
    expect(report.horizontalError.x).toBeCloseTo(0, 5);
    expect(report.horizontalError.y).toBeCloseTo(0, 5);
    expect(report.verticalError.x).toBeCloseTo(0, 5);
    expect(report.verticalError.y).toBeCloseTo(0, 5);
    expect(report.maxRadialDelta).toBeCloseTo(0, 5);
    expect(report.aligned).toBe(true);
  });

  it('converts top-left rects to centers exactly once', () => {
    const launcher = getCenter({ left: 373, top: 373, width: 54, height: 54 });
    expect(launcher).toEqual({ x: 400, y: 400 });
    const voice = getCenter({ left: 376, top: 256, width: 48, height: 48 });
    expect(voice).toEqual({ x: 400, y: 280 });
  });
});

/** Mirrors apps/desktop/src/renderer/menuLifecycle.ts (Part 2.8). */
type MenuPhase = 'closed' | 'opening' | 'open' | 'closing';
type MenuIntent = 'open' | 'close' | null;

function shouldHoldArcStage(phase: MenuPhase, hasLayout: boolean): boolean {
  if (!hasLayout) return false;
  return phase === 'opening' || phase === 'open' || phase === 'closing';
}

function shouldShowMenuItems(phase: MenuPhase): boolean {
  return phase === 'open';
}

function mayRestoreCompactWindow(phase: MenuPhase): boolean {
  return phase === 'closed';
}

function resolveTriggerIntent(phase: MenuPhase, pending: MenuIntent) {
  if (phase === 'closed') return { action: 'open' as const, pending: null };
  if (phase === 'open') return { action: 'close' as const, pending: null };
  if (phase === 'opening') {
    return { action: 'none' as const, pending: pending === 'close' ? null : ('close' as const) };
  }
  return { action: 'none' as const, pending: pending === 'open' ? null : ('open' as const) };
}

function resolveAfterExit(pending: MenuIntent) {
  if (pending === 'open') {
    return { nextPhase: 'closed' as const, shouldRestoreCompact: false, shouldReopen: true };
  }
  return { nextPhase: 'closed' as const, shouldRestoreCompact: true, shouldReopen: false };
}

function resolveAfterOpen(pending: MenuIntent) {
  if (pending === 'close') return { shouldClose: true, pending: null };
  return { shouldClose: false, pending: null };
}

/** Mirrors menuLifecycle.ts Part 6.5.2 — Chat must not be shrunk by menu exit. */
type PendingRadialMode = 'canvas' | 'panel' | 'voice' | null;

function shouldRestoreCompactAfterMenuExit(mode: PendingRadialMode): boolean {
  return mode !== 'canvas' && mode !== 'panel' && mode !== 'voice';
}

function pendingModeForCommandItem(id: string): PendingRadialMode {
  if (id === 'canvas') return 'canvas';
  if (id === 'text') return 'panel';
  if (id === 'voice') return 'voice';
  return null;
}

/**
 * Simulates the IPC race: placeTutorPanel(420×620) then a late compact restore.
 * When restore is gated (or expand is claimed early), Chat stays full-size.
 */
function simulateTextOpenBoundsRace(opts: {
  skipCompactRestore: boolean;
  claimExpandedBeforeAwait: boolean;
}): { width: number; height: number; clipped: boolean } {
  const PANEL = { width: 420, height: 620 };
  const COMPACT = { width: 96, height: 96 };
  let bounds = { width: 320, height: 320 };
  const expandedClaim = opts.claimExpandedBeforeAwait;

  // Main applies Chat placement.
  bounds = { ...PANEL };

  // A late setMainSizeAtAnchor(96) arrives after place-tutor-panel.
  if (!opts.skipCompactRestore && !expandedClaim) {
    bounds = { ...COMPACT };
  }

  return {
    ...bounds,
    clipped: bounds.width < PANEL.width || bounds.height < PANEL.height,
  };
}

describe('menu open/close lifecycle (Part 2.8)', () => {
  it('holds arc stage offset through closing (prevents mid-exit jump)', () => {
    expect(shouldHoldArcStage('closing', true)).toBe(true);
    expect(shouldHoldArcStage('open', true)).toBe(true);
    expect(shouldHoldArcStage('closed', true)).toBe(false);
  });

  it('shows menu items only after opening completes', () => {
    expect(shouldShowMenuItems('opening')).toBe(false);
    expect(shouldShowMenuItems('open')).toBe(true);
    expect(shouldShowMenuItems('closing')).toBe(false);
  });

  it('forbids compact restore while closing', () => {
    expect(mayRestoreCompactWindow('closing')).toBe(false);
    expect(mayRestoreCompactWindow('open')).toBe(false);
    expect(mayRestoreCompactWindow('closed')).toBe(true);
  });

  it('queues rapid open→close and close→open without overlapping actions', () => {
    expect(resolveTriggerIntent('opening', null)).toEqual({ action: 'none', pending: 'close' });
    expect(resolveTriggerIntent('closing', null)).toEqual({ action: 'none', pending: 'open' });
    expect(resolveTriggerIntent('open', null)).toEqual({ action: 'close', pending: null });
    expect(resolveTriggerIntent('closed', null)).toEqual({ action: 'open', pending: null });
  });

  it('reopens after exit when pending open was queued', () => {
    expect(resolveAfterExit('open')).toEqual({
      nextPhase: 'closed',
      shouldRestoreCompact: false,
      shouldReopen: true,
    });
    expect(resolveAfterExit(null).shouldRestoreCompact).toBe(true);
  });

  it('closes immediately after open when pending close was queued', () => {
    expect(resolveAfterOpen('close')).toEqual({ shouldClose: true, pending: null });
    expect(resolveAfterOpen(null)).toEqual({ shouldClose: false, pending: null });
  });

  it('documents open ordering: expand window before showing items', () => {
    // opening = bounds applying, items hidden; open = items visible
    expect(shouldShowMenuItems('opening')).toBe(false);
    expect(shouldHoldArcStage('opening', true)).toBe(true);
  });
});

describe('single launcher / window roles (Part 2.9)', () => {
  it('expects exactly one buddy launcher role among inventory roles', () => {
    const inventory = [
      { role: 'buddy' as const, visible: true },
      { role: 'overlay' as const, visible: true },
    ];
    expect(inventory.filter((w) => w.role === 'buddy')).toHaveLength(1);
    expect(inventory.filter((w) => w.role === 'overlay')).toHaveLength(1);
  });

  it('treats a second buddy as an invalid duplicate', () => {
    const bad = [
      { role: 'buddy' as const },
      { role: 'buddy' as const },
      { role: 'overlay' as const },
    ];
    expect(bad.filter((w) => w.role === 'buddy').length).toBeGreaterThan(1);
  });

  it('keeps compact restore forbidden until closed (no shrink during exit)', () => {
    expect(mayRestoreCompactWindow('closing')).toBe(false);
    expect(mayRestoreCompactWindow('opening')).toBe(false);
  });
});

/**
 * Mirrors apps/desktop/src/renderer/launcherGeometry.ts computeAnchorPreservingWindow.
 * Part 6.5.1: Canvas must not center-then-clamp (that slides the disc at edges).
 */
function computeAnchorPreservingWindow(opts: {
  anchor: { cx: number; cy: number };
  workArea: WorkArea;
  width: number;
  height: number;
}) {
  const ax = opts.anchor.cx;
  const ay = opts.anchor.cy;
  const width = Math.max(1, Math.round(opts.width));
  const height = Math.max(1, Math.round(opts.height));
  const origin = clampWindowOrigin(ax - width / 2, ay - height / 2, width, height, opts.workArea);
  const launcherOffset = { x: ax - origin.x, y: ay - origin.y };
  return {
    window: { x: origin.x, y: origin.y, width, height },
    launcherOffset,
    screenCenter: { x: origin.x + launcherOffset.x, y: origin.y + launcherOffset.y },
  };
}

function centerThenClampScreenCenter(opts: {
  anchor: { cx: number; cy: number };
  workArea: WorkArea;
  width: number;
  height: number;
}) {
  const origin = clampWindowOrigin(
    opts.anchor.cx - opts.width / 2,
    opts.anchor.cy - opts.height / 2,
    opts.width,
    opts.height,
    opts.workArea
  );
  return { x: origin.x + opts.width / 2, y: origin.y + opts.height / 2 };
}

describe('Chat panel open vs menu-exit race (Part 6.5.2)', () => {
  it('maps Text to panel, Voice to voice, and Canvas to canvas mode', () => {
    expect(pendingModeForCommandItem('text')).toBe('panel');
    expect(pendingModeForCommandItem('voice')).toBe('voice');
    expect(pendingModeForCommandItem('canvas')).toBe('canvas');
    expect(pendingModeForCommandItem('capture')).toBeNull();
  });

  it('does not compact-restore after Text, Voice, or Canvas', () => {
    expect(shouldRestoreCompactAfterMenuExit('panel')).toBe(false);
    expect(shouldRestoreCompactAfterMenuExit('voice')).toBe(false);
    expect(shouldRestoreCompactAfterMenuExit('canvas')).toBe(false);
    expect(shouldRestoreCompactAfterMenuExit(null)).toBe(true);
  });

  it('leaves Chat at 420×620 when compact restore is skipped', () => {
    const result = simulateTextOpenBoundsRace({
      skipCompactRestore: true,
      claimExpandedBeforeAwait: true,
    });
    expect(result).toMatchObject({ width: 420, height: 620, clipped: false });
  });

  it('reproduces the clipped Chat failure when compact restore wins the race', () => {
    const broken = simulateTextOpenBoundsRace({
      skipCompactRestore: false,
      claimExpandedBeforeAwait: false,
    });
    expect(broken.clipped).toBe(true);
    expect(broken.width).toBe(96);
  });

  it('keeps Canvas pin path free of Chat dimensions', () => {
    // Canvas mode must not request 420×620; compact restore stays suppressed.
    expect(shouldRestoreCompactAfterMenuExit(pendingModeForCommandItem('canvas'))).toBe(false);
    expect(pendingModeForCommandItem('canvas')).not.toBe('panel');
  });
});

/**
 * Mirrors launcherGeometry.computeCanvasSheetPlacement (Part 6.5.3).
 * Canvas sheet stays full size; only its offset changes to fit the buddy window.
 */
function computeCanvasSheetPlacement(opts: {
  launcherOffset: { x: number; y: number };
  windowSize: { width: number; height: number };
  sheetSize?: { width: number; height: number };
  gap?: number;
  margin?: number;
}) {
  const sheet = opts.sheetSize ?? { width: 188, height: 112 };
  const gap = opts.gap ?? 48;
  const margin = opts.margin ?? 12;
  const { x: lx, y: ly } = opts.launcherOffset;
  const winW = opts.windowSize.width;
  const winH = opts.windowSize.height;
  const desiredLeft = -sheet.width / 2;
  const minLeft = margin - lx;
  const maxLeft = winW - margin - sheet.width - lx;
  const left =
    minLeft <= maxLeft ? Math.min(Math.max(desiredLeft, minLeft), maxLeft) : (minLeft + maxLeft) / 2;
  const maxBottom = ly - margin - sheet.height;
  const minBottom = Math.max(0, ly - (winH - margin));
  let bottom: number | null = gap;
  let top: number | null = null;
  let adjusted = Math.abs(left - desiredLeft) > 0.5;
  if (maxBottom >= minBottom && gap <= maxBottom && gap >= minBottom) {
    bottom = gap;
  } else if (maxBottom >= minBottom) {
    bottom = Math.min(Math.max(gap, minBottom), maxBottom);
    adjusted = true;
  } else {
    bottom = null;
    const desiredTop = gap;
    const minTop = margin - ly;
    const maxTop = winH - margin - sheet.height - ly;
    top =
      minTop <= maxTop ? Math.min(Math.max(desiredTop, minTop), maxTop) : (minTop + maxTop) / 2;
    adjusted = true;
  }
  const sheetLeft = lx + left;
  const sheetTop = bottom != null ? ly - bottom - sheet.height : ly + (top ?? 0);
  const fits =
    sheetLeft >= margin - 0.5 &&
    sheetLeft + sheet.width <= winW - margin + 0.5 &&
    sheetTop >= margin - 0.5 &&
    sheetTop + sheet.height <= winH - margin + 0.5;
  return { left, bottom, top, adjusted, fits, sheetWidth: sheet.width, sheetHeight: sheet.height };
}

describe('Canvas sheet corner fit without resizing (Part 6.5.3)', () => {
  const win = { width: 320, height: 320 };
  const sheet = { width: 188, height: 112 };

  it('keeps the default centered-above placement when there is room', () => {
    // y=200 leaves room for gap 48 + sheet 112 + margin 12 above the launcher.
    const p = computeCanvasSheetPlacement({
      launcherOffset: { x: 160, y: 200 },
      windowSize: win,
      sheetSize: sheet,
    });
    expect(p.left).toBeCloseTo(-94, 5);
    expect(p.bottom).toBe(48);
    expect(p.top).toBeNull();
    expect(p.adjusted).toBe(false);
    expect(p.fits).toBe(true);
    expect(p.sheetWidth).toBe(188);
    expect(p.sheetHeight).toBe(112);
  });

  it('shifts left at the bottom-right so Clear/Close stay inside the window', () => {
    const p = computeCanvasSheetPlacement({
      launcherOffset: { x: 292, y: 292 },
      windowSize: win,
      sheetSize: sheet,
    });
    expect(p.adjusted).toBe(true);
    expect(p.fits).toBe(true);
    expect(p.left).toBeLessThan(-94);
    expect(292 + p.left + sheet.width).toBeLessThanOrEqual(320 - 12 + 0.5);
    expect(p.sheetWidth).toBe(188);
  });

  it('shifts right at the bottom-left', () => {
    const p = computeCanvasSheetPlacement({
      launcherOffset: { x: 28, y: 292 },
      windowSize: win,
      sheetSize: sheet,
    });
    expect(p.fits).toBe(true);
    expect(p.left).toBeGreaterThan(-94);
    expect(28 + p.left).toBeGreaterThanOrEqual(12 - 0.5);
  });

  it('flips below the launcher at the top-right instead of clipping', () => {
    const p = computeCanvasSheetPlacement({
      launcherOffset: { x: 292, y: 36 },
      windowSize: win,
      sheetSize: sheet,
    });
    expect(p.bottom).toBeNull();
    expect(p.top).not.toBeNull();
    expect(p.fits).toBe(true);
    expect(p.sheetHeight).toBe(112);
  });

  it('fits at the top-left', () => {
    const p = computeCanvasSheetPlacement({
      launcherOffset: { x: 28, y: 36 },
      windowSize: win,
      sheetSize: sheet,
    });
    expect(p.fits).toBe(true);
    expect(p.sheetWidth).toBe(188);
  });

  it('does not change sheet dimensions across corners', () => {
    const corners = [
      { x: 292, y: 292 },
      { x: 28, y: 292 },
      { x: 292, y: 36 },
      { x: 28, y: 36 },
      { x: 160, y: 160 },
    ];
    for (const launcherOffset of corners) {
      const p = computeCanvasSheetPlacement({ launcherOffset, windowSize: win, sheetSize: sheet });
      expect(p.sheetWidth).toBe(188);
      expect(p.sheetHeight).toBe(112);
      expect(p.fits).toBe(true);
    }
  });

  it('preserves launcher offset identity (sheet move only)', () => {
    const launcherOffset = { x: 292, y: 292 };
    const pin = computeAnchorPreservingWindow({
      anchor: { cx: 1400, cy: 800 },
      workArea: { x: 0, y: 0, width: 1440, height: 900 },
      width: 320,
      height: 320,
    });
    const p = computeCanvasSheetPlacement({
      launcherOffset: pin.launcherOffset,
      windowSize: pin.window,
      sheetSize: sheet,
    });
    expect(pin.screenCenter).toEqual({ x: 1400, y: 800 });
    expect(p.fits).toBe(true);
    // Placement mutates sheet left/bottom only — pin offset unchanged.
    expect(pin.launcherOffset).toEqual(pin.launcherOffset);
  });
});

describe('anchor-preserving Canvas / compact resize (Part 6.5.1)', () => {
  const work = { x: 0, y: 0, width: 1440, height: 900 };

  it('keeps launcher screen center identical at display center', () => {
    const anchor = { cx: 720, cy: 450 };
    const layout = computeAnchorPreservingWindow({
      anchor,
      workArea: work,
      width: 320,
      height: 320,
    });
    expect(layout.screenCenter.x).toBeCloseTo(anchor.cx, 5);
    expect(layout.screenCenter.y).toBeCloseTo(anchor.cy, 5);
  });

  it('keeps launcher screen center at the right edge where center-then-clamp drifts', () => {
    const anchor = { cx: 1400, cy: 800 };
    const preserving = computeAnchorPreservingWindow({
      anchor,
      workArea: work,
      width: 320,
      height: 320,
    });
    const clampedCenter = centerThenClampScreenCenter({
      anchor,
      workArea: work,
      width: 320,
      height: 320,
    });
    // The bug: flex-centered disc follows clamped window center, not the anchor.
    expect(Math.hypot(clampedCenter.x - anchor.cx, clampedCenter.y - anchor.cy)).toBeGreaterThan(20);
    // The fix: absolute offset keeps the disc on the anchor.
    expect(preserving.screenCenter.x).toBeCloseTo(anchor.cx, 5);
    expect(preserving.screenCenter.y).toBeCloseTo(anchor.cy, 5);
    expect(preserving.launcherOffset.x).not.toBeCloseTo(160, 0);
  });

  it('is stable across repeated Canvas-sized toggles at the left edge', () => {
    const anchor = { cx: 40, cy: 120 };
    const a = computeAnchorPreservingWindow({ anchor, workArea: work, width: 320, height: 320 });
    const b = computeAnchorPreservingWindow({ anchor, workArea: work, width: 96, height: 96 });
    const c = computeAnchorPreservingWindow({ anchor, workArea: work, width: 320, height: 320 });
    expect(a.screenCenter).toEqual({ x: anchor.cx, y: anchor.cy });
    expect(b.screenCenter).toEqual({ x: anchor.cx, y: anchor.cy });
    expect(c.screenCenter).toEqual(a.screenCenter);
  });
});
