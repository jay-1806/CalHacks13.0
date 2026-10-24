import { describe, it, expect } from 'vitest';
import { prepareOverlayText, StepAudioQueue, type AudioScheduler, type TutorStreamStep } from '@screentutor/shared';
import { JsonArrayItemStreamer } from '../providers/json-field-stream.js';
import { TutorStepStreamer } from '../providers/step-stream.js';

/** Feed text in uneven chunks, like a model stream. */
function feed(text: string, push: (chunk: string) => void, sizes = [1, 7, 3, 19, 2, 11]) {
  let i = 0;
  let k = 0;
  while (i < text.length) {
    const n = sizes[k++ % sizes.length];
    push(text.slice(i, i + n));
    i += n;
  }
}

const STEPS = [
  { spoken: 'White is to move.', visual: '[DRAW:clear] White to move [BOARD:0.2,0.1,0.6,0.9:white] [POINT:d5:knight]' },
  { spoken: 'The knight jumps to c7 — "a fork" {check}.', visual: '[DRAW:clear] Nc7+ [POINT:d5:knight] [DRAW:move:d5-c7]' },
  { spoken: 'It hits the king and the rook.', visual: '[DRAW:clear] King and rook [POINT:c7:fork] [DRAW:square:e8] [DRAW:square:a8]' },
];

describe('JsonArrayItemStreamer', () => {
  it('yields each step object as soon as it closes, whatever the chunking', () => {
    const json = JSON.stringify({ subject: 'chess', steps: STEPS, summary: 'Fork [x] {y}', concept: 'fork', confidence: 1 });
    const items: unknown[] = [];
    const streamer = new JsonArrayItemStreamer('steps', (item) => items.push(item));
    feed(json, (c) => streamer.push(c));
    expect(items).toEqual(STEPS);
  });

  it('reports a step before the rest of the answer exists', () => {
    const items: unknown[] = [];
    const streamer = new JsonArrayItemStreamer('steps', (item) => items.push(item));
    streamer.push('{"subject":"math","steps":[{"spoken":"A \\"quoted\\" brace } here","visual":"[DRAW:clear] x"},{"spo');
    expect(items).toEqual([{ spoken: 'A "quoted" brace } here', visual: '[DRAW:clear] x' }]);
  });
});

describe('TutorStepStreamer', () => {
  it('gives each step exactly the overlay line of the finished answer', () => {
    const streamed: TutorStreamStep[] = [];
    const streamer = new TutorStepStreamer((s) => streamed.push(s));
    STEPS.forEach((s) => streamer.push(s));

    const final = prepareOverlayText(STEPS.map((s) => s.spoken).join('\n'), STEPS.map((s) => s.visual).join('\n'));
    expect(streamed.map((s) => s.overlay)).toEqual(final.overlayText.split('\n'));
    expect(streamed.map((s) => s.index)).toEqual([0, 1, 2]);
    // Squares named in later steps are resolved with the board from step 1.
    expect(streamed[2].overlay).toContain('[DRAW:square:0.425,0.15,0.05,0.1]');
    expect(streamed[1].overlay).not.toContain('d5-c7');
  });

  it('keeps every step on one line', () => {
    const streamed: TutorStreamStep[] = [];
    const streamer = new TutorStepStreamer((s) => streamed.push(s));
    streamer.push({ spoken: 'First line\nsecond line', visual: '[DRAW:clear] A\n[POINT:0.5,0.5:a]' });
    expect(streamed[0].spoken).toBe('First line second line');
    expect(streamed[0].overlay).not.toContain('\n');
  });
});

describe('StepAudioQueue with steps arriving while it plays', () => {
  const audio = () => {
    let clock = 0;
    const scheduler: AudioScheduler = { now: () => clock, play: (samples) => samples.length / 1000 };
    return { scheduler, at: (t: number) => (clock = t) };
  };

  it('plays steps as they are added and completes only once closed', () => {
    const { scheduler } = audio();
    const started: number[] = [];
    const done: number[] = [];
    const q = new StepAudioQueue([false], scheduler, { onStep: (i) => started.push(i), onComplete: (t) => done.push(t) }, {
      open: true,
      gapSeconds: 0,
      leadSeconds: 0,
    });
    q.start();
    q.push(0, new Float32Array(500));
    q.finish(0);
    expect(started).toEqual([0]);
    expect(done).toEqual([]); // more may come

    const second = q.addStep(false);
    q.push(second, new Float32Array(300));
    q.finish(second);
    expect(started).toEqual([0, 1]);
    expect(done).toEqual([]);

    q.addStep(true); // a step with nothing to say still takes its turn
    expect(started).toEqual([0, 1, 2]);
    q.close();
    expect(done).toHaveLength(1);
    expect(q.isComplete).toBe(true);
  });

  it('waits for a late step instead of finishing early', () => {
    const { scheduler, at } = audio();
    const started: Array<[number, number]> = [];
    const q = new StepAudioQueue([false], scheduler, { onStep: (i, t) => started.push([i, t]), onComplete: () => {} }, {
      open: true,
      gapSeconds: 0,
      leadSeconds: 0.05,
    });
    q.start();
    q.push(0, new Float32Array(500));
    q.finish(0);
    at(2); // the next step is still being written when step 0's audio ends
    const i = q.addStep(false);
    q.push(i, new Float32Array(100));
    expect(started[1]).toEqual([1, 2.05]);
  });
});
