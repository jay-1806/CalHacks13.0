/**
 * Plays narration audio step by step, in order, and reports when each step starts.
 *
 * Each narration step is synthesized separately, so its audio arrives tagged with
 * the step it belongs to, possibly interleaved with later steps. The queue holds
 * a later step's audio until every earlier step is fully scheduled, then plays it
 * right after, separated by a short pause. Because it decides the exact start time
 * of each step's first sample, it can tell the overlay precisely when to move on —
 * the voice is the clock, not an estimate.
 *
 * No browser APIs here: the caller supplies the audio clock and playback.
 */

export interface AudioScheduler {
  /** Current time of the audio clock, in seconds. */
  now(): number;
  /** Play samples starting at `at` (audio-clock seconds); returns their duration in seconds. */
  play(samples: Float32Array, at: number): number;
}

export interface StepAudioQueueEvents {
  /** Step `index` will start playing at `at` (audio-clock seconds). */
  onStep(index: number, at: number): void;
  /** Every step is scheduled; the last sample ends at `endsAt`. */
  onComplete(endsAt: number): void;
}

export interface StepAudioQueueOptions {
  /** Silence inserted before each step after the first (seconds). */
  gapSeconds?: number;
  /** Minimum lead so nothing is scheduled in the past (seconds). */
  leadSeconds?: number;
  /**
   * More steps will be added with addStep() while it plays (a streamed answer);
   * it completes only after close(). Default false: the steps given are all of them.
   */
  open?: boolean;
}

interface StepState {
  pending: Float32Array[];
  done: boolean;
  started: boolean;
}

export class StepAudioQueue {
  private steps: StepState[];
  private cursor = 0;
  private nextStart: number;
  private completed = false;
  private closed: boolean;
  private readonly gap: number;
  private readonly lead: number;

  /**
   * @param silent per step: true when the step has no speech (it starts as soon as
   *   the previous step's audio ends and produces no audio of its own)
   */
  constructor(
    silent: boolean[],
    private scheduler: AudioScheduler,
    private events: StepAudioQueueEvents,
    options: StepAudioQueueOptions = {}
  ) {
    this.gap = options.gapSeconds ?? 0.15;
    this.lead = options.leadSeconds ?? 0.05;
    this.steps = silent.map((isSilent) => ({ pending: [], done: isSilent, started: false }));
    this.nextStart = scheduler.now() + this.lead;
    this.closed = !options.open;
  }

  /** Append a step to an open queue (its index is the current step count). */
  addStep(silent: boolean): number {
    const index = this.steps.length;
    this.steps.push({ pending: [], done: silent, started: false });
    // A silent step reached while waiting for it plays straight away.
    if (silent) this.advance();
    return index;
  }

  /** No more steps will be added: the queue completes once these have played. */
  close(): void {
    this.closed = true;
    this.advance();
  }

  get stepCount(): number {
    return this.steps.length;
  }

  /** Audio samples for step `index` (in arrival order for that step). */
  push(index: number, samples: Float32Array): void {
    const step = this.steps[index];
    if (!step || step.done || samples.length === 0) return;
    if (index === this.cursor) {
      this.play(index, samples);
    } else if (index > this.cursor) {
      step.pending.push(samples);
    }
  }

  /** No more audio will arrive for step `index` (finished or failed). */
  finish(index: number): void {
    const step = this.steps[index];
    if (!step || step.done) return;
    step.done = true;
    this.advance();
  }

  /** Start draining (call once, after construction): handles leading silent steps. */
  start(): void {
    this.advance();
  }

  get isComplete(): boolean {
    return this.completed;
  }

  private play(index: number, samples: Float32Array): void {
    const step = this.steps[index];
    let at = Math.max(this.nextStart, this.scheduler.now() + this.lead);
    if (!step.started) {
      step.started = true;
      if (index > 0) at += this.gap;
      this.events.onStep(index, at);
    }
    const duration = this.scheduler.play(samples, at);
    this.nextStart = at + duration;
  }

  /** Move past every finished step, flushing the next step's buffered audio. */
  private advance(): void {
    while (this.cursor < this.steps.length && this.steps[this.cursor].done) {
      const finished = this.steps[this.cursor];
      if (!finished.started) {
        // A silent step (or one whose audio never came): it begins where the last one ended.
        finished.started = true;
        this.events.onStep(this.cursor, Math.max(this.nextStart, this.scheduler.now()));
      }
      this.cursor++;
      const next = this.steps[this.cursor];
      if (next) {
        const buffered = next.pending;
        next.pending = [];
        for (const samples of buffered) this.play(this.cursor, samples);
      }
    }
    if (this.cursor >= this.steps.length && this.closed && !this.completed) {
      this.completed = true;
      this.events.onComplete(this.nextStart);
    }
  }
}
