import { describe, it, expect } from 'vitest';
import { prepareOverlayText } from '@screentutor/shared';
import { aimPoints, scoreAnswer, targetHit, type EvalCase } from '../../evals/score.js';

const chessCase: EvalCase = {
  id: 'chess',
  image: 'x.png',
  question: 'Best move?',
  subject: 'chess',
  targets: [
    { name: 'knight on d5', box: [0.35, 0.4, 0.4, 0.5] },
    { name: 'fork square c7', box: [0.3, 0.2, 0.35, 0.3] },
    { name: 'king or rook', anyOf: [[0.4, 0.1, 0.45, 0.2], [0.2, 0.1, 0.25, 0.2]] },
  ],
};

describe('eval scoring', () => {
  it('counts a target as hit when a pointer or a mark lands in it', () => {
    const { overlayText } = prepareOverlayText(
      'The knight forks.\nIt attacks the king.',
      '[DRAW:clear] The knight forks [BOARD:0.2,0.1,0.6,0.9:white] [POINT:d5:knight] [DRAW:move:d5-c7]\n[DRAW:clear] It attacks the king [POINT:c7:fork] [DRAW:square:e8]'
    );
    const score = scoreAnswer(chessCase, { subject: 'chess', spokenText: 'The knight forks.\nIt attacks the king.', overlayText });
    expect(score.subjectCorrect).toBe(true);
    expect(score.hit).toEqual(['knight on d5', 'fork square c7', 'king or rook']);
    expect(score.targetRecall).toBe(1);
    expect(score.stepsAligned).toBe(true);
  });

  it('reports misses and a wrong subject', () => {
    const score = scoreAnswer(chessCase, {
      subject: 'general',
      spokenText: 'Look here.',
      overlayText: '[DRAW:clear] Look here [POINT:0.9,0.9:corner] [DRAW:circle:0.9,0.9,0.02]',
    });
    expect(score.subjectCorrect).toBe(false);
    expect(score.targetRecall).toBe(0);
    expect(score.missed).toHaveLength(3);
  });

  it('measures sides by distance to the segment', () => {
    const side = { name: 'side', segment: [0.2, 0.2, 0.2, 0.8] as [number, number, number, number], tolerance: 0.03 };
    expect(targetHit(side, [{ x: 0.22, y: 0.5 }])).toBe(true);
    expect(targetHit(side, [{ x: 0.3, y: 0.5 }])).toBe(false);
    expect(targetHit(side, [{ x: 0.2, y: 0.9 }])).toBe(false);
  });

  it('does not count working lines or keycaps as aiming at something', () => {
    expect(aimPoints('[DRAW:work:0.7,0.3:x = 3] [DRAW:key:0.1,0.1:Ctrl+J]')).toEqual([]);
  });
});
