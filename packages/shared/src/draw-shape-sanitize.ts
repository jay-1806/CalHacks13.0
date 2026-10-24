import type { CanvasDrawShape } from './stream-tag-parser.js';

/** Max normalized size for rect/highlight — prevents full-screen accidental boxes */
const MAX_RECT_W = 0.22;
const MAX_RECT_H = 0.22;
const MIN_RECT_SIZE = 0.04;
const MAX_CIRCLE_R = 0.06;
const MIN_CIRCLE_R = 0.015;
/** Long enough for a diagram diagonal (e.g. a hypotenuse), short enough to stop runaway arrows */
const MAX_ARROW_SPAN = 0.85;

function clamp01(n: number): number {
  if (isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/** Clamp model-drawn shapes so they stay tight on the target region. */
export function sanitizeDrawShape(shape: CanvasDrawShape): CanvasDrawShape | null {
  switch (shape.kind) {
    case 'circle': {
      const [cx, cy, r] = shape.coords;
      if ([cx, cy, r].some((n) => isNaN(n))) return null;
      const safeR = Math.min(MAX_CIRCLE_R, Math.max(MIN_CIRCLE_R, r));
      return { ...shape, coords: [clamp01(cx), clamp01(cy), safeR] };
    }
    case 'rect':
    case 'highlight': {
      const [x, y, w, h] = shape.coords;
      if ([x, y, w, h].some((n) => isNaN(n))) return null;
      let safeW = Math.min(MAX_RECT_W, Math.max(MIN_RECT_SIZE, w));
      let safeH = Math.min(MAX_RECT_H, Math.max(MIN_RECT_SIZE, h));
      let safeX = clamp01(x);
      let safeY = clamp01(y);
      if (safeX + safeW > 1) safeX = Math.max(0, 1 - safeW);
      if (safeY + safeH > 1) safeY = Math.max(0, 1 - safeH);
      return { ...shape, coords: [safeX, safeY, safeW, safeH] };
    }
    case 'arrow':
    case 'underline': {
      const [x1, y1, x2, y2] = shape.coords;
      if ([x1, y1, x2, y2].some((n) => isNaN(n))) return null;
      let sx = clamp01(x1);
      let sy = clamp01(y1);
      let ex = clamp01(x2);
      let ey = clamp01(y2);
      const span = Math.hypot(ex - sx, ey - sy);
      if (span > MAX_ARROW_SPAN && span > 0) {
        const scale = MAX_ARROW_SPAN / span;
        ex = sx + (ex - sx) * scale;
        ey = sy + (ey - sy) * scale;
      }
      return { ...shape, coords: [sx, sy, ex, ey] };
    }
    case 'label':
    case 'work':
    case 'key':
    case 'gloss': {
      const [x, y] = shape.coords;
      if ([x, y].some((n) => isNaN(n))) return null;
      return { ...shape, coords: [clamp01(x), clamp01(y)] };
    }
    case 'rightangle': {
      const [x, y, size] = shape.coords;
      if ([x, y].some((n) => isNaN(n))) return null;
      const safeSize = Math.min(0.06, Math.max(0.01, size ?? 0.02));
      return { ...shape, coords: [clamp01(x), clamp01(y), safeSize] };
    }
    case 'square': {
      const [cx, cy, w, h] = shape.coords;
      if ([cx, cy, w, h].some((n) => isNaN(n))) return null;
      // A board square: bigger than a typo, smaller than a quarter of the screen.
      const size = (n: number) => Math.min(0.25, Math.max(0.01, Math.abs(n)));
      return { ...shape, coords: [clamp01(cx), clamp01(cy), size(w), size(h)] };
    }
    case 'move': {
      const [x1, y1, x2, y2] = shape.coords;
      if ([x1, y1, x2, y2].some((n) => isNaN(n))) return null;
      return { ...shape, coords: [clamp01(x1), clamp01(y1), clamp01(x2), clamp01(y2)] };
    }
    default:
      return null;
  }
}
