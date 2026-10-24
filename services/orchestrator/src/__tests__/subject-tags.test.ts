import { describe, it, expect } from 'vitest';
import {
  Subject,
  parseBoardTag,
  parseStreamTags,
  prepareOverlayText,
  resolveBoardTags,
  squareCenter,
  type CanvasDrawShape,
} from '@screentutor/shared';
import { buildSubjectPrompt, SUBJECT_PACKS } from '../prompts/subject-packs.js';
import { TUTOR_OUTPUT_SCHEMA } from '../providers/anthropic-provider.js';

const shapes = (overlay: string): CanvasDrawShape[] =>
  parseStreamTags(overlay)
    .events.filter((e) => e.type === 'draw')
    .map((e) => (e.type === 'draw' ? e.shape : (null as never)));

describe('chess board tags', () => {
  // Squares span x 0.2–0.6 and y 0.1–0.9: each square is 0.05 wide and 0.1 tall.
  const white = parseBoardTag('[BOARD:0.2,0.1,0.6,0.9:white]')!;
  const black = parseBoardTag('[BOARD:0.2,0.1,0.6,0.9:black]')!;

  it('puts a1 bottom-left with White at the bottom, top-right with Black at the bottom', () => {
    expect(squareCenter(white, 'a1')).toEqual({ x: 0.225, y: 0.85 });
    expect(squareCenter(white, 'h8').x).toBeCloseTo(0.575);
    expect(squareCenter(white, 'h8').y).toBeCloseTo(0.15);
    expect(squareCenter(black, 'a1').x).toBeCloseTo(0.575);
    expect(squareCenter(black, 'a1').y).toBeCloseTo(0.15);
    expect(squareCenter(black, 'e4')).toEqual(squareCenter(white, 'd5'));
  });

  it('turns square names into coordinates and removes the board tag', () => {
    const out = resolveBoardTags(
      '[DRAW:clear] Knight fork [BOARD:0.2,0.1,0.6,0.9:white] [POINT:d5:knight] [DRAW:move:d5-c7] [DRAW:square:e8]'
    );
    expect(out).not.toContain('[BOARD');
    expect(out).toContain('[POINT:0.375,0.45:knight]');
    expect(out).toContain('[DRAW:move:0.375,0.45,0.325,0.25]');
    expect(out).toContain('[DRAW:square:0.425,0.15,0.05,0.1]');
  });

  it('accepts e2e4 and capture notation for moves', () => {
    expect(resolveBoardTags('[BOARD:0,0,0.8,0.8:white] [DRAW:move:e2e4]')).toContain('[DRAW:move:0.45,0.65,0.45,0.45]');
    expect(resolveBoardTags('[BOARD:0,0,0.8,0.8:white] [DRAW:move:e4xd5]')).toContain('[DRAW:move:');
  });

  it('drops square-named tags when there is no usable board', () => {
    const out = resolveBoardTags('[DRAW:clear] Look here [POINT:e4:center] [DRAW:square:e4]');
    expect(out).not.toMatch(/\[POINT|\[DRAW:square/);
    expect(resolveBoardTags('[BOARD:oops] [DRAW:move:e2-e4]')).not.toContain('move');
  });

  it('survives the whole overlay pipeline with exact board positions', () => {
    const { overlayText } = prepareOverlayText(
      'The knight jumps to c7.',
      '[DRAW:clear] The knight jumps to c7 [BOARD:0.2,0.1,0.6,0.9:white] [POINT:d5:knight] [DRAW:move:d5-c7] [DRAW:square:a8]'
    );
    const [move, square] = shapes(overlayText);
    expect(move).toMatchObject({ kind: 'move', coords: [0.375, 0.45, 0.325, 0.25] });
    expect(square).toMatchObject({ kind: 'square', coords: [0.225, 0.15, 0.05, 0.1] });
    expect(parseStreamTags(overlayText).visibleText.trim()).toBe('The knight jumps to c7');
  });
});

describe('shortcut and gloss tags', () => {
  it('keeps keycaps where the tutor put them, with the shortcut intact', () => {
    const { overlayText } = prepareOverlayText(
      'Choose the Crop tool. Its shortcut is C.',
      '[DRAW:clear] Choose the Crop tool, shortcut C [POINT:0.021,0.31:Crop tool] [DRAW:circle:0.021,0.31,0.02] [DRAW:key:0.05,0.31:C]'
    );
    expect(shapes(overlayText).find((s) => s.kind === 'key')).toMatchObject({ coords: [0.05, 0.31], label: 'C' });
  });

  it('keeps a gloss even when the sentence says the same meaning', () => {
    const { overlayText } = prepareOverlayText(
      'Biblioteca means library.',
      '[DRAW:clear] "Biblioteca" means library [POINT:0.34,0.42:biblioteca] [DRAW:gloss:0.34,0.42:biblioteca|library]'
    );
    expect(shapes(overlayText)).toEqual([
      expect.objectContaining({ kind: 'gloss', coords: [0.34, 0.42], label: 'biblioteca|library' }),
    ]);
  });

  it('needs text for keys and glosses', () => {
    expect(shapes('[DRAW:key:0.5,0.5] [DRAW:gloss:0.2,0.2]')).toEqual([]);
  });
});

describe('subject packs', () => {
  it('offers every pack when the subject is not known, one pack when it is', () => {
    const all = buildSubjectPrompt();
    for (const subject of Subject.options) expect(all).toContain(SUBJECT_PACKS[subject]);
    const chess = buildSubjectPrompt('chess');
    expect(chess).toContain(SUBJECT_PACKS.chess);
    expect(chess).not.toContain(SUBJECT_PACKS.math);
    expect(chess).toContain('Set "subject" to "chess"');
  });

  it('asks Claude for the subject without delaying the spoken text', () => {
    expect(Object.keys(TUTOR_OUTPUT_SCHEMA.properties)[0]).toBe('spokenText');
    expect(TUTOR_OUTPUT_SCHEMA.properties.subject.enum).toEqual([...Subject.options]);
    expect(TUTOR_OUTPUT_SCHEMA.required).toContain('subject');
  });
});
