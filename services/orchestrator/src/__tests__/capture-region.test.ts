import { describe, expect, it } from 'vitest';
import {
  mapPointThroughCaptureRegion,
  mapShapeThroughCaptureRegion,
  normalizeCaptureRegion,
} from '@screentutor/shared';

describe('capture-region', () => {
  it('normalizes DIP rect to display fractions', () => {
    expect(normalizeCaptureRegion(100, 50, 400, 300, 1920, 1080)).toEqual({
      x: 100 / 1920,
      y: 50 / 1080,
      width: 400 / 1920,
      height: 300 / 1080,
    });
  });

  it('maps crop-normalized points to full display', () => {
    const region = { x: 0.25, y: 0.1, width: 0.5, height: 0.4 };
    expect(mapPointThroughCaptureRegion(0, 0, region)).toEqual({ x: 0.25, y: 0.1 });
    expect(mapPointThroughCaptureRegion(1, 1, region)).toEqual({ x: 0.75, y: 0.5 });
    expect(mapPointThroughCaptureRegion(0.5, 0.5, region).x).toBeCloseTo(0.5);
    expect(mapPointThroughCaptureRegion(0.5, 0.5, region).y).toBeCloseTo(0.3);
  });

  it('maps circle shapes through region', () => {
    const region = { x: 0, y: 0, width: 0.5, height: 0.5 };
    const mapped = mapShapeThroughCaptureRegion(
      { kind: 'circle', coords: [0.2, 0.4, 0.1] },
      region
    );
    expect(mapped.coords[0]).toBeCloseTo(0.1);
    expect(mapped.coords[1]).toBeCloseTo(0.2);
    expect(mapped.coords[2]).toBeCloseTo(0.05);
  });
});
