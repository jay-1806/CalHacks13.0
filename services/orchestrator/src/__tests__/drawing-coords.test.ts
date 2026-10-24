import { describe, it, expect } from 'vitest';
import { NormalizedCoordinates } from '@screentutor/shared';

describe('Drawing Coordinates Validation', () => {
  it('accepts valid 0-1 coordinates', () => {
    expect(() => NormalizedCoordinates.parse({ x: 0.5, y: 0.5, width: 0.1, height: 0.2 })).not.toThrow();
    expect(() => NormalizedCoordinates.parse({ x: 0, y: 1 })).not.toThrow(); // width/height optional
  });

  it('rejects coordinates out of bounds', () => {
    expect(() => NormalizedCoordinates.parse({ x: 1.5, y: 0.5 })).toThrow();
    expect(() => NormalizedCoordinates.parse({ x: 0.5, y: -0.1 })).toThrow();
    expect(() => NormalizedCoordinates.parse({ x: 0.5, y: 0.5, width: 1.1 })).toThrow();
  });
});
