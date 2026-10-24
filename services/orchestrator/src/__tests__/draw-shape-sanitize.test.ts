import { describe, it, expect } from 'vitest';
import { sanitizeDrawShape } from '@screentutor/shared';

describe('sanitizeDrawShape', () => {
  it('clamps oversized highlight rectangles', () => {
    const result = sanitizeDrawShape({
      kind: 'highlight',
      coords: [0.1, 0.55, 0.55, 0.4],
      label: 'lower triangle',
    });

    expect(result).not.toBeNull();
    expect(result!.coords[2]).toBeLessThanOrEqual(0.22);
    expect(result!.coords[3]).toBeLessThanOrEqual(0.22);
    expect(result!.coords[0] + result!.coords[2]).toBeLessThanOrEqual(1.01);
  });

  it('clamps oversized circle radius', () => {
    const result = sanitizeDrawShape({
      kind: 'circle',
      coords: [0.5, 0.5, 0.25],
    });

    expect(result!.coords[2]).toBeLessThanOrEqual(0.06);
  });
});
