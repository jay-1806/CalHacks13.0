import { describe, it, expect } from 'vitest';
import { parseStreamTags, prepareOverlayText, buildNarrationSteps, sanitizeDrawShape } from '@screentutor/shared';
import { speedOptions } from '../providers/anthropic-provider.js';

const overlay = [
  '[DRAW:clear] Leg AC is x + 2 [POINT:0.26,0.53:AC] [DRAW:arrow:0.26,0.76,0.26,0.30]',
  '[DRAW:clear] Set up Pythagoras [POINT:0.74,0.30:setup] [DRAW:work:0.72,0.30:(x+2)² + (x+9)² = (x+10)²]',
  '[DRAW:clear] Factor and solve [POINT:0.74,0.37:answer] [DRAW:work:0.72,0.37:(x+5)(x−3) = 0 → x = 3]',
].join('\n');

describe('working lines ([DRAW:work])', () => {
  it('parses a work tag, keeping colons and math in its text', () => {
    const { events } = parseStreamTags('[DRAW:work:0.7,0.3:f(x): x² = 9]');
    expect(events[0]).toMatchObject({ type: 'draw', shape: { kind: 'work', coords: [0.7, 0.3], label: 'f(x): x² = 9' } });
  });

  it('survives server-side refinement unchanged, even when it repeats the sentence', () => {
    const prepared = prepareOverlayText('Set up Pythagoras. Factor and solve.', overlay);
    expect(prepared.overlayText).toContain('[DRAW:work:0.72,0.3:(x+2)² + (x+9)² = (x+10)²]');
    expect(prepared.overlayText).toContain('[DRAW:work:0.72,0.37:(x+5)(x−3) = 0 → x = 3]');
  });

  it('is not snapped to the pointer like diagram marks are', () => {
    const refined = prepareOverlayText('x', '[DRAW:clear] note [POINT:0.2,0.2:a] [DRAW:work:0.8,0.6:x = 3]').overlayText;
    expect(refined).toContain('[DRAW:work:0.8,0.6:x = 3]');
  });

  it('gives each narration step its own working line', () => {
    const steps = buildNarrationSteps('Leg AC is x plus 2.\nSet up Pythagoras.\nFactor and solve.', overlay);
    const workPerStep = steps.map((s) => s.events.filter((e: any) => e.type === 'draw' && e.shape.kind === 'work').length);
    expect(workPerStep).toEqual([0, 1, 1]);
  });

  it('lets a long arrow trace a full hypotenuse', () => {
    const arrow = sanitizeDrawShape({ kind: 'arrow', coords: [0.27, 0.29, 0.66, 0.77] });
    expect(arrow!.coords).toEqual([0.27, 0.29, 0.66, 0.77]);
  });
});

describe('speedOptions', () => {
  it('uses Opus fast mode with fallbacks', () => {
    expect(speedOptions('claude-opus-5-5', 'fast', 'adaptive')).toEqual({
      speed: 'fast',
      betas: ['fast-mode-2026-02-01', 'server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
  });

  it('ignores fast mode off Opus and maps thinking-off per model', () => {
    expect(speedOptions('claude-sonnet-5-5', 'fast', 'off')).toMatchObject({ thinking: { type: 'between_tools' } });
    expect(speedOptions('claude-sonnet-5-5', 'fast', 'off').speed).toBeUndefined();
    const haiku = speedOptions('claude-haiku-5-5', 'standard', 'off');
    expect(haiku).toEqual({ thinking: { type: 'disabled' } }); // no fallbacks: a 400 on Haiku 5.5
  });

  it('never sends a thinking override to Opus 5.5, which cannot turn thinking off', () => {
    expect(speedOptions('claude-opus-5-5', 'standard', 'off').thinking).toBeUndefined();
  });
});
