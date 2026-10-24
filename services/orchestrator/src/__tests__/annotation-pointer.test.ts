import { describe, expect, it } from 'vitest';
import {
  ANNOTATION_INK,
  ANNOTATION_POINTER,
  arrowHeadSize,
  choosePointerAnchor,
  inkStrokeWidth,
  pointInRect,
  pointerObstacleRect,
  shortenSegmentTip,
} from '@screentutor/shared';

describe('annotation pointer style constants', () => {
  it('keeps the focus disc compact', () => {
    expect(ANNOTATION_POINTER.outerR).toBeLessThanOrEqual(8);
    expect(ANNOTATION_POINTER.outerR).toBeGreaterThanOrEqual(4);
    expect(ANNOTATION_POINTER.stroke).toBeGreaterThanOrEqual(1.4);
    expect(ANNOTATION_POINTER.stroke).toBeLessThanOrEqual(2.2);
    expect(ANNOTATION_POINTER.tipClearance).toBeGreaterThanOrEqual(6);
  });

  it('keeps ink and arrowheads within the preferred slim range', () => {
    expect(ANNOTATION_INK.minWidth).toBeLessThanOrEqual(2);
    expect(ANNOTATION_INK.maxWidth).toBeLessThanOrEqual(3);
    expect(arrowHeadSize(120)).toBeLessThanOrEqual(ANNOTATION_INK.arrowHeadMax);
    expect(arrowHeadSize(120)).toBeGreaterThanOrEqual(ANNOTATION_INK.arrowHeadMin);
    expect(inkStrokeWidth(900)).toBeLessThanOrEqual(ANNOTATION_INK.maxWidth);
    expect(inkStrokeWidth(900)).toBeGreaterThanOrEqual(ANNOTATION_INK.minWidth);
  });
});

describe('choosePointerAnchor', () => {
  const viewport = { viewportW: 1280, viewportH: 800 };

  it('offsets away from a known equation bounds instead of covering its center', () => {
    const content = { x: 400, y: 300, w: 220, h: 40 };
    const result = choosePointerAnchor({
      targetX: 510,
      targetY: 320,
      ...viewport,
      contentBounds: content,
    });
    expect(pointInRect(result.markerX, result.markerY, content, 2)).toBe(false);
    expect(result.clearOfContent).toBe(true);
    expect(Math.hypot(result.tipX - 510, result.tipY - 320)).toBeGreaterThanOrEqual(
      ANNOTATION_POINTER.tipClearance - 1
    );
  });

  it('offsets away from the target near screen edges', () => {
    const result = choosePointerAnchor({
      targetX: 40,
      targetY: 400,
      ...viewport,
    });
    const dist = Math.hypot(result.markerX - 40, result.markerY - 400);
    expect(dist).toBeGreaterThanOrEqual(ANNOTATION_POINTER.tipClearance);
    expect(result.markerX).toBeGreaterThanOrEqual(ANNOTATION_POINTER.outerR);
    expect(result.markerX).toBeLessThan(viewport.viewportW);
  });

  it('keeps markers inside the viewport for corner targets', () => {
    const result = choosePointerAnchor({
      targetX: 20,
      targetY: 20,
      ...viewport,
    });
    expect(result.markerX).toBeGreaterThanOrEqual(ANNOTATION_POINTER.outerR);
    expect(result.markerY).toBeGreaterThanOrEqual(ANNOTATION_POINTER.outerR);
  });

  it('avoids overlapping another obstacle when ranking candidates', () => {
    const content = { x: 500, y: 280, w: 180, h: 36 };
    const aboveBlock = { x: 520, y: 200, w: 140, h: 60 };
    const result = choosePointerAnchor({
      targetX: 590,
      targetY: 298,
      ...viewport,
      contentBounds: content,
      obstacles: [aboveBlock],
    });
    expect(pointInRect(result.markerX, result.markerY, aboveBlock, 6)).toBe(false);
  });

  it('does not mutate the input content rectangle', () => {
    const content = { x: 100, y: 100, w: 80, h: 30 };
    const before = { ...content };
    choosePointerAnchor({
      targetX: 140,
      targetY: 115,
      ...viewport,
      contentBounds: content,
    });
    expect(content).toEqual(before);
  });
});

describe('shortenSegmentTip', () => {
  it('stops the tip short of the endpoint', () => {
    const result = shortenSegmentTip(0, 0, 100, 0, 8);
    expect(result.x2).toBeCloseTo(92, 5);
    expect(result.y2).toBeCloseTo(0, 5);
    expect(result.x1).toBe(0);
  });

  it('leaves short segments unchanged', () => {
    const result = shortenSegmentTip(0, 0, 5, 0, 8);
    expect(result.x2).toBe(5);
  });
});

describe('pointerObstacleRect', () => {
  it('covers marker, tip, and label headroom for bubble layout', () => {
    const r = pointerObstacleRect(100, 100, 110, 108);
    expect(r.w).toBeGreaterThan(10);
    expect(r.h).toBeGreaterThan(20);
    expect(r.y).toBeLessThan(100);
  });
});
