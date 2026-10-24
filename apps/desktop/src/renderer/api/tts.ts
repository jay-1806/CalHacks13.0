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

export interface TTSProvider {
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

/**
 * Browser speech synthesis: one utterance per step, so each step's `onstart`
 * event is the exact moment it is heard.
 */
export class SystemTTSProvider implements TTSProvider {
  private generation = 0;
  private speaking = false;

  speakSteps(steps: string[], handlers: NarrationHandlers): void {
    this.stop();
    const run = ++this.generation;
    const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
    if (!synth) {
      console.warn('System speech synthesis is not supported in this environment.');
      steps.forEach((_s, i) => handlers.onStep?.(i));
      handlers.onEnd?.();
      return;
    }

    const voice = synth.getVoices().find((v) => v.lang.startsWith('en'));
    let started = false;
    let lastSpoken = -1;
    steps.forEach((text, i) => {
      if (clean(text)) lastSpoken = i;
    });

    // Silent steps (no speech) play right after the previous spoken step ends.
    const flushSilentAfter = (index: number) => {
      for (let j = index + 1; j < steps.length && !clean(steps[j]); j++) handlers.onStep?.(j);
    };

    if (lastSpoken === -1) {
      steps.forEach((_s, i) => handlers.onStep?.(i));
      handlers.onEnd?.();
      return;
    }
    // Leading silent steps start immediately.
    for (let j = 0; j < steps.length && !clean(steps[j]); j++) handlers.onStep?.(j);

    steps.forEach((text, i) => {
      const spoken = clean(text);
      if (!spoken) return;
      const utterance = new SpeechSynthesisUtterance(spoken);
      if (voice) utterance.voice = voice;
      utterance.rate = 1.05;
      utterance.onstart = () => {
        if (run !== this.generation) return;
        if (!started) {
          started = true;
          this.speaking = true;
          handlers.onStart?.();
        }
        handlers.onStep?.(i);
      };
      const finished = () => {
        if (run !== this.generation) return;
        flushSilentAfter(i);
        if (i === lastSpoken) {
          this.speaking = false;
          handlers.onEnd?.();
        }
      };
      utterance.onend = finished;
      utterance.onerror = (e) => {
        console.error('Speech synthesis utterance error:', e);
        finished();
      };
      synth.speak(utterance);
    });
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
    this.stop();
    const texts = steps.map(clean);
    const ctx = this.getAudioContext();
    void ctx.resume();

    const runId = crypto.randomUUID();
    const run: CartesiaRun = {
      id: runId,
      steps: texts,
      handlers,
      carry: new Map(),
      timers: [],
      started: false,
      endsAt: null,
      unsent: texts.flatMap((t, i) => (t ? [i] : [])),
      inFlight: new Set(),
      maxInFlight: MAX_IN_FLIGHT,
      socket: null,
      session: null,
      queue: new StepAudioQueue(
        texts.map((t) => !t),
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
        }
      ),
    };
    this.run = run;
    run.queue.start();
    if (texts.every((t) => !t)) return;

    Promise.all([this.ensureSocket(), getVoiceSession()])
      .then(([socket, session]) => {
        if (this.run !== run) return;
        run.socket = socket;
        run.session = session;
        this.sendMore(run);
      })
      .catch((err) => this.fallBack(run, err));
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
    this.fallback.speakSteps(run.steps, run.handlers);
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
export function playSilently(
  steps: string[],
  estimateMs: (spoken: string) => number,
  handlers: NarrationHandlers
): () => void {
  const timers: ReturnType<typeof setTimeout>[] = [];
  let elapsed = 0;
  handlers.onStart?.();
  steps.forEach((spoken, index) => {
    timers.push(setTimeout(() => handlers.onStep?.(index), elapsed));
    elapsed += estimateMs(spoken);
  });
  timers.push(setTimeout(() => handlers.onEnd?.(), elapsed));
  return () => timers.forEach(clearTimeout);
}

export const ttsProvider = new CartesiaTTSProvider();
