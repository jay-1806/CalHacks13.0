import { describe, it, expect } from 'vitest';
import { StepAudioQueue, type AudioScheduler } from '@screentutor/shared';

/** Fake audio clock: 1 sample = 1 ms of audio, so durations are easy to read. */
function fakeAudio() {
  const played: Array<{ at: number; samples: number }> = [];
  let clock = 0;
  const scheduler: AudioScheduler = {
    now: () => clock,
    play: (samples, at) => {
      played.push({ at, samples: samples.length });
      return samples.length / 1000;
    },
  };
  return { scheduler, played, advanceTo: (t: number) => (clock = t) };
}

const ms = (n: number) => new Float32Array(n);

function record() {
  const steps: Array<[number, number]> = [];
  const done: number[] = [];
  return {
    steps,
    done,
    events: {
      onStep: (i: number, at: number) => steps.push([i, Math.round(at * 1000)]),
      onComplete: (endsAt: number) => done.push(Math.round(endsAt * 1000)),
    },
  };
}

describe('StepAudioQueue', () => {
  it('starts each step exactly when its first audio plays, back to back with a gap', () => {
    const { scheduler } = fakeAudio();
    const log = record();
    const q = new StepAudioQueue([false, false, false], scheduler, log.events, { gapSeconds: 0.1, leadSeconds: 0 });
    q.start();

    q.push(0, ms(1000));
    q.push(0, ms(500)); // step 0 is 1.5 s long
    q.finish(0);
    q.push(1, ms(700));
    q.finish(1);
    q.push(2, ms(300));
    q.finish(2);

    // step 1 starts at 1.5 s + 0.1 s gap; step 2 at 1.6 + 0.7 + 0.1
    expect(log.steps).toEqual([[0, 0], [1, 1600], [2, 2400]]);
    expect(log.done).toEqual([2700]);
  });

  it('holds audio that arrives early for a later step until earlier steps are scheduled', () => {
    const { scheduler, played } = fakeAudio();
    const log = record();
    const q = new StepAudioQueue([false, false], scheduler, log.events, { gapSeconds: 0, leadSeconds: 0 });
    q.start();

    q.push(1, ms(400)); // step 1's audio arrives first (generated in parallel)
    q.finish(1);
    expect(played).toHaveLength(0);
    expect(log.steps).toEqual([]);

    q.push(0, ms(1000));
    q.finish(0);
    expect(log.steps).toEqual([[0, 0], [1, 1000]]);
    expect(played.map((p) => p.at * 1000)).toEqual([0, 1000]);
  });

  it('a silent step starts as soon as the previous step ends and plays no audio', () => {
    const { scheduler, played } = fakeAudio();
    const log = record();
    const q = new StepAudioQueue([false, true, false], scheduler, log.events, { gapSeconds: 0.1, leadSeconds: 0 });
    q.start();

    q.push(0, ms(800));
    q.finish(0);
    q.push(2, ms(200));
    q.finish(2);

    expect(log.steps).toEqual([[0, 0], [1, 800], [2, 900]]);
    expect(played).toHaveLength(2);
  });

  it('never schedules audio in the past when it arrives late', () => {
    const audio = fakeAudio();
    const log = record();
    const q = new StepAudioQueue([false, false], audio.scheduler, log.events, { gapSeconds: 0, leadSeconds: 0.05 });
    q.start();
    q.push(0, ms(500));
    q.finish(0);

    audio.advanceTo(3); // step 1's audio shows up long after step 0 finished playing
    q.push(1, ms(500));
    q.finish(1);

    expect(log.steps[1]).toEqual([1, 3050]);
  });

  it('a step whose audio failed still advances so the overlay is not stuck', () => {
    const { scheduler } = fakeAudio();
    const log = record();
    const q = new StepAudioQueue([false, false, false], scheduler, log.events, { gapSeconds: 0, leadSeconds: 0 });
    q.start();
    q.push(0, ms(1000));
    q.finish(0);
    q.finish(1); // error: no audio for step 1
    q.push(2, ms(500));
    q.finish(2);

    expect(log.steps.map(([i]) => i)).toEqual([0, 1, 2]);
    expect(q.isComplete).toBe(true);
  });

  it('completes immediately when there is nothing to say', () => {
    const { scheduler } = fakeAudio();
    const log = record();
    const q = new StepAudioQueue([true, true], scheduler, log.events, { leadSeconds: 0 });
    q.start();
    expect(log.steps).toEqual([[0, 0], [1, 0]]);
    expect(log.done).toEqual([0]);
  });
});
