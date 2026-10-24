import { describe, it, expect } from 'vitest';
import { buildNarrationSteps, estimateSpeechDurationMs, estimateStepDurationMs } from '@screentutor/shared';

describe('buildNarrationSteps', () => {
  it('pairs spoken and overlay lines by index', () => {
    const spoken = 'Left side is 10 cm.\nBase is x minus 3.\nSolve x equals 9.';
    const overlay =
      'Left side 10 cm [POINT:0.18,0.55:left]\nBase (x−3) cm [POINT:0.42,0.78:base]\n(x−3)²+100=(x+4)²+x² → x=9 [POINT:0.5,0.12:eq]';

    const steps = buildNarrationSteps(spoken, overlay);
    expect(steps).toHaveLength(3);
    expect(steps[0].spoken).toContain('Left side');
    expect(steps[0].display).toContain('Left side 10 cm');
    expect(steps[0].events.some((e) => e.type === 'point')).toBe(true);
    expect(steps[2].display).toContain('x=9');
  });

  it('prepends [DRAW:clear] to each step when missing', () => {
    const spoken = 'Side A.\nSide B.';
    const overlay =
      'Side A [POINT:0.2,0.5:a]\nSide B [POINT:0.8,0.5:b]';

    const steps = buildNarrationSteps(spoken, overlay);
    expect(steps).toHaveLength(2);
    expect(steps[0].events[0]).toMatchObject({ type: 'clear' });
    expect(steps[1].events[0]).toMatchObject({ type: 'clear' });
  });
});

describe('extra overlay steps', () => {
  it('gives overlay lines beyond the spoken lines no speech, so nothing is said twice', () => {
    const steps = buildNarrationSteps('Set up the equation.', '[DRAW:clear] Setup [POINT:0.5,0.3:eq]\n[DRAW:clear] Result [DRAW:work:0.7,0.4:x = 3]');
    expect(steps.map((s) => s.spoken)).toEqual(['Set up the equation.', '']);
    expect(steps[1].events.some((e) => e.type === 'draw')).toBe(true);
  });
});

describe('estimateStepDurationMs', () => {
  it('is zero for a silent step and grows with length', () => {
    expect(estimateStepDurationMs('')).toBe(0);
    expect(estimateStepDurationMs('Leg A C is x plus 2.')).toBeGreaterThan(2000);
    expect(estimateStepDurationMs('a'.repeat(80))).toBeGreaterThan(estimateStepDurationMs('a'.repeat(20)));
  });
});

describe('estimateSpeechDurationMs', () => {
  it('scales with text length', () => {
    expect(estimateSpeechDurationMs('hi')).toBeGreaterThanOrEqual(3000);
    expect(estimateSpeechDurationMs('a'.repeat(200))).toBeGreaterThan(3000);
  });
});
