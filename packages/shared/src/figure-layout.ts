import { shapeCenter } from './overlay-refine.js';
import type { CanvasDrawShape, StreamEvent } from './stream-tag-parser.js';

type Pt = { x: number; y: number };

/** Working lines and loose labels are written beside the figure, not on it. */
function isFigureMark(shape: CanvasDrawShape): boolean {
  return shape.kind !== 'work' && shape.kind !== 'label';
}

/**
 * The middle of the figure being explained: the average centre of every diagram
 * mark across the lesson's steps. Null when the lesson draws on no figure.
 */
export function figureCenter(stepEvents: StreamEvent[][]): Pt | null {
  const centers: Pt[] = [];
  for (const events of stepEvents) {
    for (const e of events) {
      if (e.type === 'draw' && isFigureMark(e.shape)) centers.push(shapeCenter(e.shape));
    }
  }
  if (centers.length === 0) return null;
  return {
    x: centers.reduce((s, p) => s + p.x, 0) / centers.length,
    y: centers.reduce((s, p) => s + p.y, 0) / centers.length,
  };
}

/**
 * Place a mark relative to its figure. An arrow along a side moves parallel to
 * itself by `gapPx` screen pixels, to the outside, like a dimension line, so it
 * doesn't sit on the side's own ink. Every figure mark remembers where the figure
 * is (`toward`), so corner marks open into it and labels go on the outside.
 */
export function placeBesideFigure(
  shape: CanvasDrawShape,
  center: Pt | null,
  W: number,
  H: number,
  gapPx: number
): CanvasDrawShape {
  if (!center || !isFigureMark(shape)) return shape;
  if (shape.kind !== 'arrow') return { ...shape, toward: center };

  const [x1, y1, x2, y2] = shape.coords;
  const dx = (x2 - x1) * W;
  const dy = (y2 - y1) * H;
  const len = Math.hypot(dx, dy);
  if (len < 1) return { ...shape, toward: center };
  let nx = -dy / len;
  let ny = dx / len;
  const outX = ((x1 + x2) / 2 - center.x) * W;
  const outY = ((y1 + y2) / 2 - center.y) * H;
  if (nx * outX + ny * outY < 0) {
    nx = -nx;
    ny = -ny;
  }
  const ox = (nx * gapPx) / W;
  const oy = (ny * gapPx) / H;
  return { ...shape, coords: [x1 + ox, y1 + oy, x2 + ox, y2 + oy], toward: center };
}

/** How close a [POINT] must be to a working line to count as pointing at it. */
const WORK_POINT_RADIUS = 0.12;

/**
 * On a working step the pointer rests just left of the line being written, not on
 * top of its first characters, and drops its label: the line says it.
 */
export function pointBesideWork(events: StreamEvent[], gap = 0.018): StreamEvent[] {
  const work = events.find((e) => e.type === 'draw' && e.shape.kind === 'work');
  if (!work || work.type !== 'draw') return events;
  const [wx, wy] = work.shape.coords;
  return events.map((e) =>
    e.type === 'point' && Math.hypot(e.x - wx, e.y - wy) < WORK_POINT_RADIUS
      ? { ...e, x: Math.max(0.01, wx - gap), y: wy, label: '' }
      : e
  );
}
