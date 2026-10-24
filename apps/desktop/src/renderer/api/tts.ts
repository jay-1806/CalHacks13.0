import { StepAudioQueue, stripStreamTags } from '@screentutor/shared';
import { cartesiaSocketUrl, getVoiceSession } from './voice-session';

/** Callbacks for a narration: the voice is the clock for everything on screen. */
export interface NarrationHandlers {
  /** The first step started playing. */
  onStart?: () => void;
  /** Step `index` is starting to play now. */
  onStep?: (index: number) => void;
  /** All steps finished playing (not called after stop()). */
  onEnd?: () => void;
}

/** A narration whose steps can keep arriving while earlier ones play (a streamed answer). */
export interface StepNarration {
  /** Add the next step's spoken text ('' for a step with nothing to say). */
  append(text: string): void;
  /** No more steps: onEnd fires once every appended step has played. */
  end(): void;
}

export interface TTSProvider {
  /** Start a narration; append steps as they become available, then end() it. */
  startSteps(handlers: NarrationHandlers): StepNarration;
  /** Speak each step in order, reporting the moment each one starts. */
  speakSteps(steps: string[], handlers: NarrationHandlers): void;
  stop(): void;
  isSpeaking(): boolean;
  /** Optional: prepare the voice connection before an answer arrives */
  warm?(): void;
}

function clean(text: string): string {
  return stripStreamTags(text).trim();
}

/** A whole answer at once: every step appended, then ended. */
function speakAll(provider: TTSProvider, steps: string[], handlers: NarrationHandlers): void {
  const narration = provider.startSteps(handlers);
  steps.forEach((step) => narration.append(step));
  narration.end();
}

/**
 * Browser speech synthesis: one utterance per step, so each step's `onstart`
 * event is the exact moment it is heard.
 */
export class SystemTTSProvider implements TTSProvider {
  private generation = 0;
  private speaking = false;

  speakSteps(steps: string[], handlers: NarrationHandlers): void {
    speakAll(this, steps, handlers);
  }

  startSteps(handlers: NarrationHandlers): StepNarration {
    this.stop();
    const run = ++this.generation;
    const live = () => run === this.generation;
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
    if (!synth) console.warn('System speech synthesis is not supported in this environment.');
    const voice = synth?.getVoices().find((v) => v.lang.startsWith('en'));

    let count = 0;
    let started = false;
    let ended = false;
    /** Utterances queued and not finished yet */
    let busy = 0;
    /** Silent steps waiting for the utterance before them to finish, by that utterance's step */
    const silentAfter = new Map<number, number[]>();
    let lastSpoken = -1;

    const maybeEnd = () => {
      if (ended && busy === 0 && live()) {
        this.speaking = false;
        handlers.onEnd?.();
      }
    };

    return {
      append: (text) => {
        if (!live()) return;
        const i = count++;
        const spoken = clean(text);
        if (!spoken || !synth) {
          // Nothing to say: this step starts when the speech before it ends (or now).
          if (busy === 0) handlers.onStep?.(i);
          else silentAfter.set(lastSpoken, [...(silentAfter.get(lastSpoken) ?? []), i]);
          return;
        }
        lastSpoken = i;
        busy++;
        const utterance = new SpeechSynthesisUtterance(spoken);
        if (voice) utterance.voice = voice;
        utterance.rate = 1.05;
        utterance.onstart = () => {
          if (!live()) return;
          if (!started) {
            started = true;
            this.speaking = true;
            handlers.onStart?.();
          }
          handlers.onStep?.(i);
        };
        const finished = () => {
          if (!live()) return;
          busy--;
          for (const j of silentAfter.get(i) ?? []) handlers.onStep?.(j);
          silentAfter.delete(i);
          maybeEnd();
        };
        utterance.onend = finished;
        utterance.onerror = (e) => {
          console.error('Speech synthesis utterance error:', e);
          finished();
        };
        // Utterances queue up and play in order, even when added while one is speaking.
        synth.speak(utterance);
      },
      end: () => {
        if (!live()) return;
        ended = true;
        maybeEnd();
      },
    };
  }

  stop(): void {
    this.generation++;
    this.speaking = false;
    try {
      window.speechSynthesis?.cancel();
    } catch (err) {
      console.error('Error canceling speech synthesis:', err);
    }
  }

  isSpeaking(): boolean {
    return this.speaking;
  }
}

const TTS_SAMPLE_RATE = 24000;

interface CartesiaRun {
  id: string;
  steps: string[];
  handlers: NarrationHandlers;
  queue: StepAudioQueue;
  /** Leftover bytes per step: chunks don't always end on a 4-byte sample boundary. */
  carry: Map<number, Uint8Array>;
  timers: ReturnType<typeof setTimeout>[];
  started: boolean;
  /** Audio-clock time the last sample ends, once every step is scheduled. */
  endsAt: number | null;
  /** Spoken steps not yet sent to Cartesia, in order. */
  unsent: number[];
  /** Steps sent whose generation has not finished. */
  inFlight: Set<number>;
  /** How many generations Cartesia lets us run at once (drops to 1 if it pushes back). */
  maxInFlight: number;
  socket: WebSocket | null;
  session: { ttsModel: string; voiceId: string } | null;
  /** end() was called: no more steps will be appended */
  ended: boolean;
  /** Set if Cartesia failed before anything played: later steps go to the system voice */
  fallbackNarration: StepNarration | null;
}

/** Cartesia plans cap concurrent generations (2 on ours); stay within it. */
const MAX_IN_FLIGHT = 2;

/**
 * Cartesia Sonic over WebSocket, one generation context per narration step.
 * Every audio chunk names its context, so we always know which step it belongs
 * to; StepAudioQueue plays the steps back to back and tells us the exact
 * audio-clock time each one starts. The socket is kept open between answers.
 */
export class CartesiaTTSProvider implements TTSProvider {
  private socket: WebSocket | null = null;
  private socketReady: Promise<WebSocket> | null = null;
  private audioContext: AudioContext | null = null;
  private sources = new Set<AudioBufferSourceNode>();
  private run: CartesiaRun | null = null;
  private fallback = new SystemTTSProvider();

  /** Open the socket (and mint a token) ahead of the answer. Safe to call often. */
  warm(): void {
    this.ensureSocket().catch(() => {});
  }

  speakSteps(steps: string[], handlers: NarrationHandlers): void {
    speakAll(this, steps, handlers);
  }

  /**
   * Start a narration whose steps arrive over time. Each appended step is sent to
   * Cartesia right away (within the concurrency limit), so its audio is usually
   * ready before the step before it finishes playing.
   */
  startSteps(handlers: NarrationHandlers): StepNarration {
    this.stop();
    const ctx = this.getAudioContext();
    void ctx.resume();

    const run: CartesiaRun = {
      id: crypto.randomUUID(),
      steps: [],
      handlers,
      carry: new Map(),
      timers: [],
      started: false,
      endsAt: null,
      unsent: [],
      inFlight: new Set(),
      maxInFlight: MAX_IN_FLIGHT,
      socket: null,
      session: null,
      ended: false,
      fallbackNarration: null,
      queue: new StepAudioQueue(
        [],
        {
          now: () => ctx.currentTime,
          play: (samples, at) => this.playSamples(samples, at),
        },
        {
          onStep: (index, at) => this.atAudioTime(run, at, () => this.stepStarted(run, index)),
          onComplete: (endsAt) => {
            run.endsAt = endsAt;
            this.maybeFinish(run);
          },
        },
        { open: true }
      ),
    };
    this.run = run;
    run.queue.start();

    Promise.all([this.ensureSocket(), getVoiceSession()])
      .then(([socket, session]) => {
        if (this.run !== run) return;
        run.socket = socket;
        run.session = session;
        this.sendMore(run);
      })
      .catch((err) => this.fallBack(run, err));

    return {
      append: (text) => {
        const spoken = clean(text);
        if (run.fallbackNarration) return run.fallbackNarration.append(spoken);
        if (this.run !== run) return;
        run.steps.push(spoken);
        const index = run.queue.addStep(!spoken);
        if (spoken) {
          run.unsent.push(index);
          this.sendMore(run);
        }
      },
      end: () => {
        if (run.fallbackNarration) return run.fallbackNarration.end();
        if (this.run !== run) return;
        run.ended = true;
        run.queue.close();
      },
    };
  }

  /** Send the next steps in order, keeping within the concurrency limit. */
  private sendMore(run: CartesiaRun): void {
    if (this.run !== run || !run.socket || !run.session) return;
    while (run.unsent.length > 0 && run.inFlight.size < run.maxInFlight) {
      const index = run.unsent.shift()!;
      run.inFlight.add(index);
      run.socket.send(
        JSON.stringify({
          model_id: run.session.ttsModel,
          transcript: run.steps[index],
          voice: { mode: 'id', id: run.session.voiceId },
          output_format: { container: 'raw', encoding: 'pcm_f32le', sample_rate: TTS_SAMPLE_RATE },
          context_id: `${run.id}:${index}`,
          continue: false,
        })
      );
    }
  }

  /** A step's generation ended (done or failed): free its slot for the next step. */
  private generationEnded(run: CartesiaRun, index: number): void {
    run.inFlight.delete(index);
    this.sendMore(run);
  }

  private fallBack(run: CartesiaRun, err: unknown): void {
    if (this.run !== run) return;
    console.warn('Cartesia TTS unavailable, falling back to system voice:', err);
    this.stop();
    // Steps already given go to the system voice now; later ones follow them there.
    const narration = this.fallback.startSteps(run.handlers);
    run.steps.forEach((step) => narration.append(step));
    if (run.ended) narration.end();
    run.fallbackNarration = narration;
  }

  private stepStarted(run: CartesiaRun, index: number): void {
    if (this.run !== run) return;
    if (!run.started) {
      run.started = true;
      run.handlers.onStart?.();
    }
    run.handlers.onStep?.(index);
  }

  /** Run `fn` when the audio clock reaches `at` (the moment that audio is heard). */
  private atAudioTime(run: CartesiaRun, at: number, fn: () => void): void {
    const delayMs = Math.max(0, (at - this.getAudioContext().currentTime) * 1000);
    run.timers.push(setTimeout(fn, delayMs));
  }

  private ensureSocket(): Promise<WebSocket> {
    if (this.socket?.readyState === WebSocket.OPEN) return Promise.resolve(this.socket);
    this.socketReady ??= getVoiceSession()
      .then(
        (session) =>
          new Promise<WebSocket>((resolve, reject) => {
            const socket = new WebSocket(cartesiaSocketUrl('/tts/websocket', session));
            socket.onopen = () => {
              this.socket = socket;
              resolve(socket);
            };
            socket.onerror = () => reject(new Error('Cartesia TTS socket failed to open'));
            socket.onmessage = (event) => this.handleMessage(event.data);
            socket.onclose = () => {
              if (this.socket === socket) this.socket = null;
            };
          })
      )
      .finally(() => {
        this.socketReady = null;
      });
    return this.socketReady;
  }

  private handleMessage(data: unknown): void {
    if (typeof data !== 'string') return;
    let msg: {
      type?: string;
      context_id?: string;
      data?: string;
      done?: boolean;
      message?: string;
      status_code?: number;
    };
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }
    const run = this.run;
    if (!run || !msg.context_id?.startsWith(`${run.id}:`)) return;
    const index = Number(msg.context_id.slice(run.id.length + 1));

    if (msg.type === 'chunk' && msg.data) {
      const samples = this.decode(run, index, msg.data);
      if (samples) run.queue.push(index, samples);
    }
    if (msg.type === 'error') {
      if (msg.status_code === 429 && run.inFlight.has(index)) {
        // Over the concurrency limit: retry this step once a slot frees up.
        run.inFlight.delete(index);
        run.unsent.unshift(index);
        run.maxInFlight = Math.max(1, run.inFlight.size);
        if (run.inFlight.size === 0) run.timers.push(setTimeout(() => this.sendMore(run), 250));
        return;
      }
      console.error(`Cartesia TTS error on step ${index}:`, msg.message);
      // Nothing heard yet: the system voice is better than silence.
      if (!run.started && index === 0) return this.fallBack(run, msg.message);
      run.queue.finish(index);
      this.generationEnded(run, index);
    } else if (msg.type === 'done' || msg.done) {
      run.queue.finish(index);
      this.generationEnded(run, index);
    }
  }

  private decode(run: CartesiaRun, index: number, base64: string): Float32Array | null {
    let bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const carry = run.carry.get(index);
    if (carry) {
      const merged = new Uint8Array(carry.length + bytes.length);
      merged.set(carry);
      merged.set(bytes, carry.length);
      bytes = merged;
      run.carry.delete(index);
    }
    const usable = bytes.length - (bytes.length % 4);
    if (usable < bytes.length) run.carry.set(index, bytes.slice(usable));
    if (usable === 0) return null;
    return new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + usable));
  }

  private playSamples(samples: Float32Array, at: number): number {
    const ctx = this.getAudioContext();
    const buffer = ctx.createBuffer(1, samples.length, TTS_SAMPLE_RATE);
    buffer.copyToChannel(samples as Float32Array<ArrayBuffer>, 0); // decode() always builds on an ArrayBuffer
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.start(at);
    this.sources.add(source);
    source.onended = () => {
      this.sources.delete(source);
      if (this.run) this.maybeFinish(this.run);
    };
    return buffer.duration;
  }

  private maybeFinish(run: CartesiaRun): void {
    if (this.run !== run || run.endsAt === null || this.sources.size > 0) return;
    // Every step is scheduled and all audio has played (silent tails end at endsAt).
    this.atAudioTime(run, run.endsAt, () => {
      if (this.run !== run) return;
      this.run = null;
      run.handlers.onEnd?.();
    });
  }

  private getAudioContext(): AudioContext {
    this.audioContext ??= new AudioContext({ sampleRate: TTS_SAMPLE_RATE });
    return this.audioContext;
  }

  stop(): void {
    this.fallback.stop();
    const run = this.run;
    this.run = null;
    if (run) {
      run.timers.forEach(clearTimeout);
      if (this.socket?.readyState === WebSocket.OPEN) {
        for (const index of run.inFlight) {
          this.socket.send(JSON.stringify({ context_id: `${run.id}:${index}`, cancel: true }));
        }
      }
    }
    for (const source of this.sources) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        // not started yet
      }
    }
    this.sources.clear();
  }

  isSpeaking(): boolean {
    return (!!this.run && this.run.started) || this.fallback.isSpeaking();
  }
}

/**
 * No audio (muted): steps advance on a per-step speaking-time estimate, so the
 * pointer and drawings still pace like a narration.
 */
export function startSilentNarration(
  estimateMs: (spoken: string) => number,
  handlers: NarrationHandlers
): StepNarration & { cancel(): void } {
  const timers: ReturnType<typeof setTimeout>[] = [];
  /** When the next step may start (ms, performance clock) */
  let nextAt = performance.now();
  let count = 0;
  const at = (time: number, fn: () => void) => timers.push(setTimeout(fn, Math.max(0, time - performance.now())));
  handlers.onStart?.();
  return {
    append: (spoken) => {
      const index = count++;
      // A step that arrives after the previous one's time is up starts as it arrives.
      const start = Math.max(nextAt, performance.now());
      at(start, () => handlers.onStep?.(index));
      nextAt = start + estimateMs(spoken);
    },
    end: () => at(Math.max(nextAt, performance.now()), () => handlers.onEnd?.()),
    cancel: () => timers.forEach(clearTimeout),
  };
}

export const ttsProvider = new CartesiaTTSProvider();
