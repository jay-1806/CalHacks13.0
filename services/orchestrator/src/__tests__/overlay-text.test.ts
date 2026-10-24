import { describe, it, expect } from 'vitest';
import { prepareOverlayText } from '@screentutor/shared';

describe('prepareOverlayText', () => {
  it('uses visualText with tags for overlay', () => {
    const result = prepareOverlayText(
      'Click the settings gear in the top right.',
      '[DRAW:clear]Open [POINT:0.8,0.05:Settings] here. [DRAW:circle:0.8,0.05,0.03:gear]'
    );

    expect(result.overlayText).toContain('[POINT:0.8,0.05:Settings]');
    expect(result.overlayText).toContain('[DRAW:circle');
    expect(result.displayText).not.toContain('[POINT');
    expect(result.displayText).not.toContain('[DRAW');
    expect(result.pointTarget.x).toBe(0.8);
    expect(result.pointTarget.y).toBe(0.05);
  });

  it('falls back to spokenText when visualText has no tags', () => {
    const result = prepareOverlayText(
      'Look at [POINT:0.5,0.5:center] this.',
      'Plain visual with no tags.'
    );

    expect(result.overlayText).toContain('[POINT:0.5,0.5:center]');
    expect(result.displayText).toContain('Look at');
    expect(result.pointTarget.label).toBe('center');
  });

  it('appends POINT:none when no tags anywhere', () => {
    const result = prepareOverlayText('Hello world', 'Hello world');
    expect(result.overlayText).toContain('[POINT:none]');
    expect(result.pointTarget.x).toBeNull();
  });
});
