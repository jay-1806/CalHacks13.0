import { describe, expect, it } from 'vitest';
import {
  clampOrigin,
  computeTutorPanelBounds,
  fitPreferredPanelSize,
  looksLikeDefaultBottomRightDock,
  rectFullyFits,
  rectsOverlap,
  type WorkAreaRect,
} from '@screentutor/shared';

const PANEL_W = 420;
const PANEL_H = 620;
const LAUNCHER = 96;
const GAP = 16;

/** Typical macOS primary work area (menu bar already excluded). */
const PRIMARY: WorkAreaRect = { x: 0, y: 25, width: 1440, height: 875 };

/** Secondary display with negative origin. */
const SECONDARY: WorkAreaRect = { x: -1920, y: 0, width: 1920, height: 1080 };

/** High-DPI-ish logical work area (still DIP coordinates). */
const HIDPI: WorkAreaRect = { x: 0, y: 28, width: 1800, height: 1120 };

function place(
  cx: number,
  cy: number,
  work: WorkAreaRect = PRIMARY,
  gap = GAP
) {
  return computeTutorPanelBounds({
    launcherCenter: { cx, cy },
    launcherSize: LAUNCHER,
    panelWidth: PANEL_W,
    panelHeight: PANEL_H,
    workArea: work,
    gap,
  });
}

function launcherRect(cx: number, cy: number) {
  const half = LAUNCHER / 2;
  return { x: cx - half, y: cy - half, width: LAUNCHER, height: LAUNCHER };
}

describe('computeTutorPanelBounds', () => {
  it('opens near a centered launcher (prefer right)', () => {
    const cx = PRIMARY.x + PRIMARY.width / 2;
    const cy = PRIMARY.y + PRIMARY.height / 2;
    const result = place(cx, cy);
    expect(result.side).toBe('right');
    expect(result.fullyFits).toBe(true);
    expect(result.x).toBe(Math.round(cx + LAUNCHER / 2 + GAP));
    expect(rectFullyFits(result, PRIMARY)).toBe(true);
    expect(rectsOverlap(result, launcherRect(cx, cy))).toBe(false);
    expect(looksLikeDefaultBottomRightDock(result, PRIMARY)).toBe(false);
  });

  it('chooses left when near the right boundary', () => {
    const cx = PRIMARY.x + PRIMARY.width - 40;
    const cy = PRIMARY.y + PRIMARY.height / 2;
    const result = place(cx, cy);
    expect(result.side).toBe('left');
    expect(result.fullyFits).toBe(true);
    expect(rectsOverlap(result, launcherRect(cx, cy))).toBe(false);
    expect(looksLikeDefaultBottomRightDock(result, PRIMARY)).toBe(false);
  });

  it('chooses a valid placement near the left boundary', () => {
    const cx = PRIMARY.x + 40;
    const cy = PRIMARY.y + PRIMARY.height / 2;
    const result = place(cx, cy);
    expect(result.side).toBe('right');
    expect(result.fullyFits).toBe(true);
    expect(result.x).toBeGreaterThanOrEqual(PRIMARY.x);
  });

  it('keeps the panel accessible near the top boundary', () => {
    const cx = PRIMARY.x + PRIMARY.width / 2;
    const cy = PRIMARY.y + 40;
    const result = place(cx, cy);
    expect(result.y).toBeGreaterThanOrEqual(PRIMARY.y);
    expect(result.y + result.height).toBeLessThanOrEqual(PRIMARY.y + PRIMARY.height);
    expect(looksLikeDefaultBottomRightDock(result, PRIMARY)).toBe(false);
  });

  it('keeps the panel accessible near the bottom boundary', () => {
    const cx = PRIMARY.x + PRIMARY.width / 2;
    const cy = PRIMARY.y + PRIMARY.height - 40;
    const result = place(cx, cy);
    expect(result.y).toBeGreaterThanOrEqual(PRIMARY.y);
    expect(result.y + result.height).toBeLessThanOrEqual(PRIMARY.y + PRIMARY.height + 0.5);
    expect(looksLikeDefaultBottomRightDock(result, PRIMARY)).toBe(false);
  });

  it.each([
    ['top-left', PRIMARY.x + 36, PRIMARY.y + 36],
    ['top-right', PRIMARY.x + PRIMARY.width - 36, PRIMARY.y + 36],
    ['bottom-left', PRIMARY.x + 36, PRIMARY.y + PRIMARY.height - 36],
    ['bottom-right', PRIMARY.x + PRIMARY.width - 36, PRIMARY.y + PRIMARY.height - 36],
  ] as const)('places accessibly in the %s corner', (_name, cx, cy) => {
    const result = place(cx, cy);
    expect(result.width).toBe(PANEL_W);
    expect(result.height).toBe(PANEL_H);
    expect(result.x).toBeGreaterThanOrEqual(PRIMARY.x);
    expect(result.y).toBeGreaterThanOrEqual(PRIMARY.y);
    expect(result.x + result.width).toBeLessThanOrEqual(PRIMARY.x + PRIMARY.width + 0.5);
    expect(result.y + result.height).toBeLessThanOrEqual(PRIMARY.y + PRIMARY.height + 0.5);
    // Must not blindly reuse the legacy bottom-right dock unless the launcher is already there
    // and right/left/above/below cannot fit — still assert it is near the launcher.
    const panelCx = result.x + result.width / 2;
    const panelCy = result.y + result.height / 2;
    expect(Math.hypot(panelCx - cx, panelCy - cy)).toBeLessThan(700);
  });

  it('supports secondary monitors with negative coordinates', () => {
    const cx = SECONDARY.x + SECONDARY.width / 2;
    const cy = SECONDARY.y + SECONDARY.height / 2;
    const result = place(cx, cy, SECONDARY);
    expect(result.x).toBeLessThan(0);
    expect(result.fullyFits).toBe(true);
    expect(rectFullyFits(result, SECONDARY)).toBe(true);
    expect(looksLikeDefaultBottomRightDock(result, PRIMARY)).toBe(false);
  });

  it('works with larger high-DPI logical work areas', () => {
    const cx = HIDPI.x + HIDPI.width / 2;
    const cy = HIDPI.y + HIDPI.height / 2;
    const result = place(cx, cy, HIDPI);
    expect(result.side).toBe('right');
    expect(result.fullyFits).toBe(true);
  });

  it('avoids overlapping the launcher when another full-fit option exists', () => {
    const cx = PRIMARY.x + 200;
    const cy = PRIMARY.y + PRIMARY.height / 2;
    const result = place(cx, cy);
    expect(rectsOverlap(result, launcherRect(cx, cy))).toBe(false);
  });

  it('does not open at the legacy primary bottom-right dock for a left-side launcher', () => {
    const cx = PRIMARY.x + 120;
    const cy = PRIMARY.y + 200;
    const result = place(cx, cy);
    expect(looksLikeDefaultBottomRightDock(result, PRIMARY)).toBe(false);
    expect(result.x).toBeLessThan(PRIMARY.x + PRIMARY.width / 2);
  });

  it('clamps when the work area is smaller than the panel', () => {
    const tiny: WorkAreaRect = { x: 100, y: 100, width: 300, height: 400 };
    const result = place(150, 150, tiny);
    const fitted = fitPreferredPanelSize(PANEL_W, PANEL_H, tiny, GAP);
    expect(result.width).toBe(fitted.width);
    expect(result.height).toBe(fitted.height);
    expect(result.width).toBeLessThan(PANEL_W);
    expect(result.height).toBeLessThan(PANEL_H);
    const origin = clampOrigin(result.x, result.y, result.width, result.height, tiny);
    expect(result.x).toBe(origin.x);
    expect(result.y).toBe(origin.y);
  });

  it('fitPreferredPanelSize never exceeds the work area margins', () => {
    const fitted = fitPreferredPanelSize(PANEL_W, PANEL_H, PRIMARY, 16);
    expect(fitted.width).toBe(PANEL_W);
    expect(fitted.height).toBe(PANEL_H);
    const small = fitPreferredPanelSize(PANEL_W, PANEL_H, { x: 0, y: 0, width: 400, height: 500 }, 16);
    expect(small.width).toBeLessThanOrEqual(400 - 32);
    expect(small.height).toBeLessThanOrEqual(500 - 32);
  });
});

describe('launcher anchor vs panel drag (pure contract)', () => {
  it('documents that panel top-left must not become the next launcher center', () => {
    const launcher = { cx: 200, cy: 300 };
    const panel = place(launcher.cx, launcher.cy);
    // After the user drags the panel elsewhere, collapse must restore around launcher — not panel origin.
    const draggedPanel = { ...panel, x: panel.x + 400, y: panel.y - 120 };
    const restoredCompact = clampOrigin(
      launcher.cx - LAUNCHER / 2,
      launcher.cy - LAUNCHER / 2,
      LAUNCHER,
      LAUNCHER,
      PRIMARY
    );
    expect(restoredCompact.x).not.toBe(draggedPanel.x);
    expect(restoredCompact.y).not.toBe(draggedPanel.y);
    expect(Math.abs(restoredCompact.x + LAUNCHER / 2 - launcher.cx)).toBeLessThanOrEqual(1);
    expect(Math.abs(restoredCompact.y + LAUNCHER / 2 - launcher.cy)).toBeLessThanOrEqual(1);
  });

  it('reopening uses the current launcher center, not a prior panel corner', () => {
    const first = place(180, 220);
    const movedLauncher = { cx: 900, cy: 500 };
    const second = place(movedLauncher.cx, movedLauncher.cy);
    expect(second.x).not.toBe(first.x);
    expect(Math.abs(second.x - (movedLauncher.cx + LAUNCHER / 2 + GAP))).toBeLessThanOrEqual(1);
  });
});
