/**
 * Lightweight ink / content occupancy from a captured screenshot.
 * No paid vision — deterministic luminance sampling only.
 */

import type { NormRect } from './work-board-layout.js';

export type InkGrid = {
  cols: number;
  rows: number;
  /** 0 = blank, 1 = ink/content for each cell (row-major). */
  cells: Float32Array;
};

/**
 * Build a coarse ink grid from raw RGBA bytes (e.g. decoded PNG/JPEG bitmap).
 * Dark or saturated pixels count as content so thin diagram lines register.
 */
export function buildInkGridFromRgba(
  data: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  cols = 24,
  rows = 16
): InkGrid {
  const cells = new Float32Array(cols * rows);
  const counts = new Float32Array(cols * rows);
  for (let y = 0; y < height; y++) {
    const row = Math.min(rows - 1, Math.floor((y / height) * rows));
    for (let x = 0; x < width; x++) {
      const col = Math.min(cols - 1, Math.floor((x / width) * cols));
      const i = (y * width + x) * 4;
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      const a = data[i + 3] ?? 255;
      if (a < 16) continue;
      // Perceived luma; invert so dark ink → high occupancy.
      const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      const ink = luma < 0.85 ? 1 - luma : 0;
      const idx = row * cols + col;
      cells[idx] += ink;
      counts[idx] += 1;
    }
  }
  for (let i = 0; i < cells.length; i++) {
    cells[i] = counts[i] > 0 ? Math.min(1, cells[i] / counts[i]) : 0;
  }
  return { cols, rows, cells };
}

/** Mean ink density inside a normalized rect. */
export function inkDensityInRect(grid: InkGrid, rect: NormRect): number {
  const x0 = Math.max(0, Math.floor(rect.x * grid.cols));
  const x1 = Math.min(grid.cols, Math.ceil((rect.x + rect.w) * grid.cols));
  const y0 = Math.max(0, Math.floor(rect.y * grid.rows));
  const y1 = Math.min(grid.rows, Math.ceil((rect.y + rect.h) * grid.rows));
  if (x1 <= x0 || y1 <= y0) return 0;
  let sum = 0;
  let n = 0;
  for (let row = y0; row < y1; row++) {
    for (let col = x0; col < x1; col++) {
      sum += grid.cells[row * grid.cols + col] ?? 0;
      n++;
    }
  }
  return n > 0 ? sum / n : 0;
}

/**
 * Expand ink cells above a threshold into occupancy rectangles (merged per row run).
 * Used as obstacles so work boards avoid thin lines sitting in white space.
 */
export function inkObstacleRects(grid: InkGrid, threshold = 0.12, padNorm = 0.015): NormRect[] {
  const rects: NormRect[] = [];
  const cellW = 1 / grid.cols;
  const cellH = 1 / grid.rows;
  for (let row = 0; row < grid.rows; row++) {
    let runStart = -1;
    for (let col = 0; col <= grid.cols; col++) {
      const ink = col < grid.cols ? (grid.cells[row * grid.cols + col] ?? 0) : 0;
      const hot = col < grid.cols && ink >= threshold;
      if (hot && runStart < 0) runStart = col;
      if (!hot && runStart >= 0) {
        const x = Math.max(0, runStart * cellW - padNorm);
        const y = Math.max(0, row * cellH - padNorm);
        const w = Math.min(1 - x, (col - runStart) * cellW + padNorm * 2);
        const h = Math.min(1 - y, cellH + padNorm * 2);
        rects.push({ x, y, w, h });
        runStart = -1;
      }
    }
  }
  return rects;
}
