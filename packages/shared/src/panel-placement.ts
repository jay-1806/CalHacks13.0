/**
 * Pure geometry for placing the Quicky.AI tutor panel near the floating launcher.
 * Screen/work-area coordinates are device-independent (Electron CSS pixels).
 */

export type WorkAreaRect = { x: number; y: number; width: number; height: number };
export type PanelRect = { x: number; y: number; width: number; height: number };
export type PlacementSide = 'right' | 'left' | 'below' | 'above';

export interface TutorPanelPlacementInput {
  launcherCenter: { cx: number; cy: number };
  /** Compact buddy window size (square) used for clearance. */
  launcherSize: number;
  panelWidth: number;
  panelHeight: number;
  workArea: WorkAreaRect;
  /** Visual gap between launcher disc and panel edge (CSS px). */
  gap?: number;
}

export interface TutorPanelPlacementResult extends PanelRect {
  side: PlacementSide;
  fullyFits: boolean;
}

const DEFAULT_GAP = 16;
const PREFERENCE: PlacementSide[] = ['right', 'left', 'below', 'above'];

export function clampOrigin(
  x: number,
  y: number,
  width: number,
  height: number,
  work: WorkAreaRect
): { x: number; y: number } {
  const maxX = work.x + Math.max(0, work.width - width);
  const maxY = work.y + Math.max(0, work.height - height);
  return {
    x: Math.min(Math.max(Math.round(x), work.x), maxX),
    y: Math.min(Math.max(Math.round(y), work.y), maxY),
  };
}

export function rectFullyFits(rect: PanelRect, work: WorkAreaRect): boolean {
  return (
    rect.x >= work.x &&
    rect.y >= work.y &&
    rect.x + rect.width <= work.x + work.width + 0.5 &&
    rect.y + rect.height <= work.y + work.height + 0.5
  );
}

export function rectsOverlap(a: PanelRect, b: PanelRect): boolean {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

function launcherClearanceRect(cx: number, cy: number, size: number): PanelRect {
  const half = size / 2;
  return {
    x: cx - half,
    y: cy - half,
    width: size,
    height: size,
  };
}

function candidateForSide(
  side: PlacementSide,
  cx: number,
  cy: number,
  launcherSize: number,
  panelWidth: number,
  panelHeight: number,
  gap: number
): PanelRect {
  const half = launcherSize / 2;
  switch (side) {
    case 'right':
      return {
        x: cx + half + gap,
        y: cy - panelHeight / 2,
        width: panelWidth,
        height: panelHeight,
      };
    case 'left':
      return {
        x: cx - half - gap - panelWidth,
        y: cy - panelHeight / 2,
        width: panelWidth,
        height: panelHeight,
      };
    case 'below':
      return {
        x: cx - panelWidth / 2,
        y: cy + half + gap,
        width: panelWidth,
        height: panelHeight,
      };
    case 'above':
      return {
        x: cx - panelWidth / 2,
        y: cy - half - gap - panelHeight,
        width: panelWidth,
        height: panelHeight,
      };
  }
}

function scoreCandidate(
  side: PlacementSide,
  rect: PanelRect,
  launcher: PanelRect,
  preferenceIndex: number
): number {
  let score = 1000 - preferenceIndex * 100;
  if (rectsOverlap(rect, launcher)) score -= 500;
  // Prefer closer center-to-center distance (connected feel).
  const rcx = rect.x + rect.width / 2;
  const rcy = rect.y + rect.height / 2;
  const lcx = launcher.x + launcher.width / 2;
  const lcy = launcher.y + launcher.height / 2;
  const dist = Math.hypot(rcx - lcx, rcy - lcy);
  score -= dist * 0.05;
  // Tiny side bias already in preferenceIndex.
  void side;
  return score;
}

/**
 * Shrink preferred panel size so it fits the work area with margin (never grows).
 * Keeps header/composer usable on small displays without changing the preferred constants.
 */
export function fitPreferredPanelSize(
  preferredWidth: number,
  preferredHeight: number,
  workArea: WorkAreaRect,
  margin = 16
): { width: number; height: number } {
  const maxW = Math.max(280, workArea.width - margin * 2);
  const maxH = Math.max(360, workArea.height - margin * 2);
  return {
    width: Math.min(Math.round(preferredWidth), Math.round(maxW)),
    height: Math.min(Math.round(preferredHeight), Math.round(maxH)),
  };
}

/**
 * Choose a tutor panel rect near the launcher without overlapping it when possible.
 * Never docks to a fixed screen corner independent of the launcher.
 */
export function computeTutorPanelBounds(input: TutorPanelPlacementInput): TutorPanelPlacementResult {
  const gap = input.gap ?? DEFAULT_GAP;
  const { cx, cy } = input.launcherCenter;
  const { launcherSize, workArea } = input;
  const fitted = fitPreferredPanelSize(input.panelWidth, input.panelHeight, workArea, gap);
  const panelWidth = fitted.width;
  const panelHeight = fitted.height;
  const launcher = launcherClearanceRect(cx, cy, launcherSize);

  const fullFit: Array<{ side: PlacementSide; rect: PanelRect; score: number }> = [];

  for (let i = 0; i < PREFERENCE.length; i++) {
    const side = PREFERENCE[i];
    const raw = candidateForSide(side, cx, cy, launcherSize, panelWidth, panelHeight, gap);
    if (!rectFullyFits(raw, workArea)) continue;
    const rect: PanelRect = {
      x: Math.round(raw.x),
      y: Math.round(raw.y),
      width: panelWidth,
      height: panelHeight,
    };
    fullFit.push({
      side,
      rect,
      score: scoreCandidate(side, rect, launcher, i),
    });
  }

  if (fullFit.length > 0) {
    // Prefer non-overlapping full fits; then highest score.
    fullFit.sort((a, b) => {
      const aOverlap = rectsOverlap(a.rect, launcher) ? 1 : 0;
      const bOverlap = rectsOverlap(b.rect, launcher) ? 1 : 0;
      if (aOverlap !== bOverlap) return aOverlap - bOverlap;
      return b.score - a.score;
    });
    const best = fullFit[0];
    return { ...best.rect, side: best.side, fullyFits: true };
  }

  // Fallback: preferred side, clamped into the work area (may reduce clearance).
  const fallbackSide = PREFERENCE[0];
  const raw = candidateForSide(fallbackSide, cx, cy, launcherSize, panelWidth, panelHeight, gap);
  const origin = clampOrigin(raw.x, raw.y, panelWidth, panelHeight, workArea);
  return {
    x: origin.x,
    y: origin.y,
    width: panelWidth,
    height: panelHeight,
    side: fallbackSide,
    fullyFits: false,
  };
}

/** True when bounds match a classic primary-display bottom-right dock (regression guard). */
export function looksLikeDefaultBottomRightDock(
  panel: PanelRect,
  primaryWorkArea: WorkAreaRect,
  margin = 16
): boolean {
  const expectedX = primaryWorkArea.x + primaryWorkArea.width - panel.width - margin;
  const expectedY = primaryWorkArea.y + primaryWorkArea.height - panel.height - margin;
  return Math.abs(panel.x - expectedX) <= 1 && Math.abs(panel.y - expectedY) <= 1;
}
