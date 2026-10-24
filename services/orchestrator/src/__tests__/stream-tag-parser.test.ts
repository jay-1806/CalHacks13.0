import { describe, it, expect } from 'vitest';
import { parseStreamTags, stripStreamTags } from '@screentutor/shared';

describe('Stream Tag Parser', () => {
  it('strips POINT tags without leaving gaps when prose is present', () => {
    const raw = 'Click the [POINT:0.73,0.41:submit button] to continue.';
    const { visibleText, events } = parseStreamTags(raw);

    expect(visibleText).toBe('Click the to continue.');
    expect(events[0]).toMatchObject({
      type: 'point',
      index: 10,
      x: 0.73,
      y: 0.41,
      label: 'submit button',
    });
  });

  it('parses multiple POINT tags in order', () => {
    const raw =
      'First [POINT:0.1,0.2:menu] then [POINT:0.8,0.9:button] here.';
    const { visibleText, events } = parseStreamTags(raw);

    expect(visibleText).toBe('First then here.');
    expect(events).toHaveLength(2);
  });

  it('parses DRAW circle tag', () => {
    const raw = 'See the logo [DRAW:circle:0.5,0.3,0.05:logo] here.';
    const { visibleText, events } = parseStreamTags(raw);

    expect(visibleText).toBe('See the logo here.');
    expect(events[0]).toMatchObject({
      type: 'draw',
      shape: { kind: 'circle', coords: [0.5, 0.3, 0.05], label: 'logo' },
    });
  });

  it('interleaves POINT and DRAW tags in document order', () => {
    const raw =
      '[DRAW:clear][POINT:0.5,0.5:center][DRAW:highlight:0.4,0.4,0.2,0.2:area] Done.';
    const { events } = parseStreamTags(raw);

    expect(events.map((e) => e.type)).toEqual(['clear', 'point', 'draw']);
  });

  it('parses DRAW label and rightangle tags', () => {
    const raw =
      '[DRAW:label:0.5,0.8:(x−3)²+100=x²] Corner [DRAW:rightangle:0.3,0.6,0.02] here.';
    const { visibleText, events } = parseStreamTags(raw);

    expect(visibleText).toContain('Corner');
    expect(events.filter((e) => e.type === 'draw')).toHaveLength(2);
    const drawEvents = events.filter((e) => e.type === 'draw') as Array<{ shape: { kind: string } }>;
    expect(drawEvents[0].shape.kind).toBe('label');
    expect(drawEvents[1].shape.kind).toBe('rightangle');
  });

  it('stripStreamTags matches parseStreamTags visible text', () => {
    const text = 'Hello [POINT:0.5,0.5:btn] and [DRAW:clear] world';
    expect(stripStreamTags(text)).toBe('Hello and world');
  });
});
