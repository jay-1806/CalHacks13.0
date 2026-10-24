import { describe, it, expect } from 'vitest';
import { buildNarrationSteps, figureCenter, placeBesideFigure, pointBesideWork, parseStreamTags } from '@screentutor/shared';

const TRIANGLE = [
  '[DRAW:clear] Right angle at A [POINT:0.26,0.79:A] [DRAW:rightangle:0.26,0.79,0.03]',
  '[DRAW:clear] Leg AC [POINT:0.26,0.53:AC] [DRAW:arrow:0.26,0.77,0.26,0.29]',
  '[DRAW:clear] Leg AB [POINT:0.47,0.79:AB] [DRAW:arrow:0.27,0.79,0.67,0.79]',
  '[DRAW:clear] Hypotenuse BC [POINT:0.47,0.53:BC] [DRAW:arrow:0.27,0.29,0.67,0.78]',
  '[DRAW:clear] Set up [POINT:0.73,0.30:setup] [DRAW:work:0.72,0.30:(x+2)² + (x+9)² = (x+10)²]',
];

const events = TRIANGLE.map((line) => parseStreamTags(line).events);
const arrow = (i: number) => {
  const e = events[i].find((ev) => ev.type === 'draw');
  if (e?.type !== 'draw') throw new Error('no draw');
  return e.shape;
};

describe('figureCenter', () => {
  it('averages the diagram marks and ignores working lines', () => {
    const c = figureCenter(events)!;
    expect(c.x).toBeGreaterThan(0.3);
    expect(c.x).toBeLessThan(0.45); // the working line at x=0.72 would pull it right
    expect(c.y).toBeGreaterThan(0.55);
  });

  it('is null when nothing is drawn on a figure', () => {
    expect(figureCenter([events[4]])).toBeNull();
  });
});

describe('placeBesideFigure', () => {
  const center = figureCenter(events);
  const W = 1600;
  const H = 900;

  it('moves each side arrow just outside the triangle', () => {
    const left = placeBesideFigure(arrow(1), center, W, H, 16);
    expect(left.coords[0] * W).toBeCloseTo(0.26 * W - 16, 5); // vertical leg → to the left

    const base = placeBesideFigure(arrow(2), center, W, H, 16);
    expect(base.coords[1] * H).toBeCloseTo(0.79 * H + 16, 5); // base → below

    const hyp = placeBesideFigure(arrow(3), center, W, H, 16);
    expect(hyp.coords[0]).toBeGreaterThan(0.27); // hypotenuse → up and to the right
    expect(hyp.coords[1]).toBeLessThan(0.29);
  });

  it('keeps the arrow parallel and the same length', () => {
    const before = arrow(3).coords;
    const after = placeBesideFigure(arrow(3), center, W, H, 16).coords;
    expect(after[2] - after[0]).toBeCloseTo(before[2] - before[0], 10);
    expect(after[3] - after[1]).toBeCloseTo(before[3] - before[1], 10);
  });

  it('tells corner marks where the figure is and leaves working alone', () => {
    expect(placeBesideFigure(arrow(0), center, W, H, 16).toward).toEqual(center);
    const work = arrow(4);
    expect(placeBesideFigure(work, center, W, H, 16)).toBe(work);
  });
});

describe('pointBesideWork', () => {
  it('rests the pointer just left of the working line, without a label', () => {
    const moved = pointBesideWork(events[4]);
    const point = moved.find((e) => e.type === 'point');
    expect(point).toMatchObject({ type: 'point', y: 0.3, label: '' });
    expect(point?.type === 'point' && point.x).toBeLessThan(0.72);
  });

  it('leaves steps without working untouched', () => {
    expect(pointBesideWork(events[1])).toBe(events[1]);
  });

  it('is applied to narration steps', () => {
    const steps = buildNarrationSteps('Set up the equation.', TRIANGLE[4]);
    expect(steps[0].events.find((e) => e.type === 'point')).toMatchObject({ label: '' });
  });
});

describe('working lines with brackets', () => {
  it('keeps a bracketed evaluation inside its DRAW tag', () => {
    const parsed = parseStreamTags('[DRAW:clear] Integrate [POINT:0.65,0.68:] [DRAW:work:0.63,0.68:= [x²/2]₂⁴]');
    expect(parsed.visibleText.trim()).toBe('Integrate');
    const work = parsed.events.find((e) => e.type === 'draw');
    expect(work?.type === 'draw' && work.shape.label).toBe('= [x²/2]₂⁴');
  });
});
