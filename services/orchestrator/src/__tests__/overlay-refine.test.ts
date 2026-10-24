import { describe, it, expect } from 'vitest';
import {
  refineOverlayAnnotationTags,
  snapShapeToPoint,
  dedupeRedundantTagLabels,
  stripDuplicateShapeLabel,
  labelsEquivalent,
} from '@screentutor/shared';

describe('overlay-refine', () => {
  it('removes draw labels that repeat prose measurements', () => {
    const raw =
      '[DRAW:clear] Left side 10 cm [POINT:0.18,0.55:10 cm] [DRAW:arrow:0.18,0.62,0.18,0.48:10 cm]';
    const deduped = dedupeRedundantTagLabels(raw);

    expect(deduped).toContain('[POINT:0.18,0.55:]');
    expect(deduped).toContain('[DRAW:arrow:0.18,0.62,0.18,0.48]');
    expect(deduped).not.toContain(':10 cm]');
  });

  it('drops redundant DRAW:label tags when equation is already in prose', () => {
    const raw =
      '[DRAW:clear] (x−3)²+100=(x+4)²+x² [POINT:0.5,0.12:equation] [DRAW:label:0.5,0.12:(x−3)²+100=(x+4)²+x²]';
    const deduped = dedupeRedundantTagLabels(raw);

    expect(deduped).not.toContain('[DRAW:label');
    expect(deduped).toContain('(x−3)²+100=(x+4)²+x²');
  });

  it('strips duplicate shape labels at render time', () => {
    const shape = stripDuplicateShapeLabel(
      { kind: 'arrow', coords: [0.1, 0.2, 0.3, 0.4], label: '10 cm' },
      '10 cm'
    );
    expect(shape.label).toBeUndefined();
  });

  it('labelsEquivalent handles unicode minus', () => {
    expect(labelsEquivalent('x-3 cm', 'x−3 cm')).toBe(true);
  });

  it('dedupes during full refine pass', () => {
    const raw =
      '[DRAW:clear] Base (10 - x) cm [POINT:0.4,0.7:10 - x cm] [DRAW:underline:0.3,0.7,0.5,0.7:10 - x cm]';
    const refined = refineOverlayAnnotationTags(raw);
    expect(refined).not.toMatch(/:10 - x cm\]/i);
  });

  it('snaps misplaced rect to circle at last point', () => {
    const raw =
      'Left 10 cm [POINT:0.2,0.5:left] [DRAW:rect:0.6,0.6,0.2,0.2:orphan]';
    const refined = refineOverlayAnnotationTags(raw);

    expect(refined).toContain('[DRAW:circle:0.2,0.5,0.035');
    expect(refined).not.toContain('[DRAW:rect:0.6');
  });

  it('snapShapeToPoint converts far rect to circle at anchor', () => {
    const shape = snapShapeToPoint(
      { kind: 'rect', coords: [0.6, 0.6, 0.15, 0.15], label: 'x' },
      { x: 0.2, y: 0.5 }
    );
    expect(shape?.kind).toBe('circle');
    expect(shape?.coords[0]).toBeCloseTo(0.2);
    expect(shape?.coords[1]).toBeCloseTo(0.5);
  });

  it('snapShapeToPoint centers misplaced arrow on anchor', () => {
    const shape = snapShapeToPoint(
      { kind: 'arrow', coords: [0.1, 0.1, 0.9, 0.9], label: 'side' },
      { x: 0.2, y: 0.5 }
    );
    expect(shape?.kind).toBe('arrow');
    const midX = ((shape?.coords[0] ?? 0) + (shape?.coords[2] ?? 0)) / 2;
    const midY = ((shape?.coords[1] ?? 0) + (shape?.coords[3] ?? 0)) / 2;
    expect(midX).toBeCloseTo(0.2, 1);
    expect(midY).toBeCloseTo(0.5, 1);
  });
});
