import { z } from 'zod';
import type { CanvasDrawShape } from './stream-tag-parser.js';

/** Normalized rectangle on the target display (0–1 fractions). */
export const CaptureRegion = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});
export type CaptureRegion = z.infer<typeof CaptureRegion>;

export function normalizeCaptureRegion(
  dipX: number,
  dipY: number,
  dipW: number,
  dipH: number,
  displayWidth: number,
  displayHeight: number
): CaptureRegion {
  return {
    x: dipX / displayWidth,
    y: dipY / displayHeight,
    width: dipW / displayWidth,
    height: dipH / displayHeight,
  };
}

/** Map a point from cropped-image normalized coords to full-display normalized coords. */
export function mapPointThroughCaptureRegion(
  x: number,
  y: number,
  region?: CaptureRegion | null
): { x: number; y: number } {
  if (!region) return { x, y };
  return {
    x: region.x + x * region.width,
    y: region.y + y * region.height,
  };
}

function scaleRadiusForRegion(r: number, region: CaptureRegion): number {
  return r * Math.min(region.width, region.height);
}

/** Map draw-shape coords from crop space to full-display normalized space. */
export function mapShapeThroughCaptureRegion(
  shape: CanvasDrawShape,
  region?: CaptureRegion | null
): CanvasDrawShape {
  if (!region) return shape;

  const mapPt = (x: number, y: number) => mapPointThroughCaptureRegion(x, y, region);
  const [a, b, c, d] = shape.coords;

  switch (shape.kind) {
    case 'circle': {
      const p = mapPt(a, b);
      return { ...shape, coords: [p.x, p.y, scaleRadiusForRegion(c, region)] };
    }
    case 'rect':
    case 'highlight': {
      const p1 = mapPt(a, b);
      return { ...shape, coords: [p1.x, p1.y, c * region.width, d * region.height] };
    }
    case 'arrow':
    case 'underline': {
      const p1 = mapPt(a, b);
      const p2 = mapPt(c, d);
      return { ...shape, coords: [p1.x, p1.y, p2.x, p2.y] };
    }
    case 'label':
    case 'work':
    case 'rightangle': {
      const p = mapPt(a, b);
      const size = shape.kind === 'rightangle' ? scaleRadiusForRegion(d ?? 0.02, region) : d;
      return { ...shape, coords: shape.kind === 'rightangle' ? [p.x, p.y, size] : [p.x, p.y] };
    }
    default:
      return shape;
  }
}
