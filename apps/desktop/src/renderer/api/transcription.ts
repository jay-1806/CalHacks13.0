import {
  shouldFinalizeFromSilence,
  shouldRecoverFromNoSpeech,
  VOICE_ENDPOINT_SILENCE_MS,
  VOICE_MAX_RECORDING_MS,
  VOICE_NO_SPEECH_MS,
  reduceCartesiaTurnEvent,
  createVoiceTranscriptDraft,
  displayedVoiceTranscript,
  float32Peak,
  float32Rms,
  isCartesiaQuotaFailure,
  packPcmF32le,
  shouldUseWebSpeechFallback,
  type SttPreflightResult,
  type VoiceTranscriptDraft,
} from '@screentutor/shared';
import { cartesiaSocketUrl, getVoiceSession } from './voice-session';

export interface VoiceTranscriptUpdate {
  text: string;
  isFinal: boolean;
  revision: number;
}

export interface VoiceAudioDiagnostics {
  permission: 'granted' | 'denied' | 'unknown';
  trackReadyState?: string;
  trackMuted?: boolean;
  trackEnabled?: boolean;
  audioContextState?: string;
  sampleRate?: number;
  frameCount: number;
  framesSent?: number;
  rms: number;
  peak?: number;
  hasSpoken: boolean;
  silenceMs: number;
  waitingMs: number;
  socketState?: number;
  usingFallback: boolean;
  /** High-level pipeline stage for safe logs (never includes transcript text). */
  stage: string;
  cartesiaErrorCode?: string;
}

export interface TranscriptionSessionOptions {
  onEndpoint?: (reason: 'silence' | 'turn_end' | 'no_speech' | 'max_duration' | 'manual') => void;
  onTranscript?: (update: VoiceTranscriptUpdate) => void;
  onDiagnostics?: (diag: VoiceAudioDiagnostics) => void;
}

export interface TranscriptionProvider {
  startSession(options?: TranscriptionSessionOptions): Promise<void>;
  pushAudioChunk(chunk: Blob): void;
  stopSession(): Promise<void>;
  /** Discard mic/socket without waiting for provider finalize (Escape / Cancel). */
  cancelSession(): Promise<void>;
  /** What the learner said, or '' if nothing was heard (never a made-up question). */
  getFinalTranscript(activeLessonId?: string): Promise<string>;
}

const VAD_RMS_SPEECH = 0.012;
const VAD_POLL_MS = 80;
const FINALIZE_TIMEOUT_MS = 2500;
/**
 * Cartesia Auto turn end timeout. Docs: 640–11200ms (default 5600).
 * Use a responsive but safe value — do not invent unsupported parameters.
 */
const CARTESIA_TURN_END_TIMEOUT_MS = 2000;

/**
 * Capture mono Float32 at the AudioContext native rate and emit ~100ms chunks.
 * Continuous frames (including silence) keep Cartesia Auto turn detection alive.
 */
const PCM_WORKLET_SOURCE = `
class PcmFramer extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chunk = Math.max(160, Math.round(sampleRate * 0.1));
    this.buf = new Float32Array(this.chunk);
    this.len = 0;
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    const src = ch && ch.length ? ch : new Float32Array(128); // silence if graph glitch
    for (let i = 0; i < src.length; i++) {
      this.buf[this.len++] = src[i];
      if (this.len === this.buf.length) {
        const out = this.buf;
        this.buf = new Float32Array(this.chunk);
        this.len = 0;
        this.port.postMessage(out.buffer, [out.buffer]);
      }
    }
    return true;
  }
}
registerProcessor('pcm-framer', PcmFramer);
`;

async function fetchSttPreflight(): Promise<SttPreflightResult> {
  try {
    const res = await fetch('http://localhost:4317/api/voice/stt-preflight');
    if (!res.ok) {
      return { ok: false, statusCode: res.status, message: `STT preflight HTTP ${res.status}` };
    }
    return (await res.json()) as SttPreflightResult;
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'STT preflight failed',
    };
  }
}

function logVoiceDiag(message: string, extra?: Record<string, string | number | boolean | undefined>) {
  // Safe diagnostics only — never log transcript content or raw audio.
  if (extra) {
    console.info(`[VoiceSTT] ${message}`, extra);
  } else {
    console.info(`[VoiceSTT] ${message}`);
  }
}

/**
 * Browser Web Speech fallback when Cartesia session mint fails.
 * Supports interim results + local VAD endpointing (Part 6.6.3).
 */
export class WebAudioTranscriptionProvider implements TranscriptionProvider {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private recognition: any = null;
  private draft: VoiceTranscriptDraft = createVoiceTranscriptDraft(0);
  private isRecognitionActive = false;
  private onEndpoint: TranscriptionSessionOptions["onEndpoint"] = undefined;
  private onTranscript: TranscriptionSessionOptions["onTranscript"] = undefined;
  private onDiagnostics: TranscriptionSessionOptions["onDiagnostics"] = undefined;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private vadTimer: ReturnType<typeof setInterval> | null = null;
  private maxTimer: ReturnType<typeof setTimeout> | null = null;
  private hasSpoken = false;
  private silenceMs = 0;
  private waitingMs = 0;
  private endpointFired = false;
  private frameCount = 0;
  private lastRms = 0;
  private sessionGen = 0;

  async startSession(options?: TranscriptionSessionOptions): Promise<void> {
    this.sessionGen += 1;
    const gen = this.sessionGen;
    this.audioChunks = [];
    this.draft = createVoiceTranscriptDraft(gen);
    this.onEndpoint = options?.onEndpoint;
    this.onTranscript = options?.onTranscript;
    this.onDiagnostics = options?.onDiagnostics;
    this.hasSpoken = false;
    this.silenceMs = 0;
    this.waitingMs = 0;
    this.endpointFired = false;
    this.frameCount = 0;
    this.clearVad();

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      console.error('Microphone access denied or failed:', err);
      this.emitDiag('mic_denied');
      throw err;
    }

    const track = this.stream.getAudioTracks()[0];
    logVoiceDiag('fallback mic acquired', {
      trackReadyState: track?.readyState,
      trackMuted: track?.muted,
    });

    try {
      this.mediaRecorder = new MediaRecorder(this.stream);
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) this.pushAudioChunk(event.data);
      };
      this.mediaRecorder.start(250);
    } catch (err) {
      console.error('MediaRecorder failed:', err);
      this.cleanupStream();
      throw err;
    }

    this.audioContext = new AudioContext();
    await this.audioContext.resume().catch(() => {});
    const source = this.audioContext.createMediaStreamSource(this.stream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 2048;
    source.connect(this.analyser);
    this.startVad(gen);

    const SpeechRecognitionCtor =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognitionCtor) {
      try {
        this.recognition = new SpeechRecognitionCtor();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';

        this.recognition.onresult = (event: any) => {
          if (gen !== this.sessionGen) return;
          let interim = '';
          let finalChunk = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            const result = event.results[i];
            const piece = result[0]?.transcript ?? '';
            if (result.isFinal) finalChunk += piece;
            else interim += piece;
          }
          if (finalChunk) {
            this.draft = {
              ...this.draft,
              finalized: `${this.draft.finalized}${finalChunk}`,
              interim: '',
              revision: this.draft.revision + 1,
            };
            this.emitTranscript(false);
          }
          if (interim) {
            this.draft = {
              ...this.draft,
              interim,
              revision: this.draft.revision + 1,
            };
            this.emitTranscript(false);
          }
        };

        this.recognition.onerror = (event: any) => {
          console.error('Speech recognition error:', event.error);
          this.emitDiag(`recognition_error:${event.error}`);
          if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
            this.fireEndpoint('no_speech');
          }
        };

        this.recognition.onend = () => {
          this.isRecognitionActive = false;
          // Chromium often ends continuous recognition early — restart while session live.
          if (gen === this.sessionGen && !this.endpointFired && this.recognition) {
            try {
              this.recognition.start();
              this.isRecognitionActive = true;
            } catch {
              // ignore duplicate-start races
            }
          }
        };

        this.isRecognitionActive = true;
        this.recognition.start();
      } catch (err) {
        console.error('Speech recognition failed to start:', err);
      }
    } else {
      console.warn('SpeechRecognition not supported in this browser environment.');
      this.emitDiag('recognition_unsupported');
    }

    this.emitDiag('listening');
  }

  private emitTranscript(isFinal: boolean) {
    const text = displayedVoiceTranscript(this.draft);
    this.onTranscript?.({
      text,
      isFinal: isFinal || this.draft.finalizedOnce,
      revision: this.draft.revision,
    });
  }

  private emitDiag(stage: string) {
    const track = this.stream?.getAudioTracks()[0];
    this.onDiagnostics?.({
      permission: this.stream ? 'granted' : 'unknown',
      trackReadyState: track?.readyState,
      trackMuted: track?.muted,
      audioContextState: this.audioContext?.state,
      frameCount: this.frameCount,
      rms: this.lastRms,
      hasSpoken: this.hasSpoken,
      silenceMs: this.silenceMs,
      waitingMs: this.waitingMs,
      usingFallback: true,
      stage,
    });
  }

  private startVad(gen: number) {
    this.maxTimer = setTimeout(() => this.fireEndpoint('max_duration'), VOICE_MAX_RECORDING_MS);
    this.vadTimer = setInterval(() => {
      if (gen !== this.sessionGen || !this.analyser || this.endpointFired) return;
      const data = new Float32Array(this.analyser.fftSize);
      this.analyser.getFloatTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
      const rms = Math.sqrt(sum / data.length);
      this.lastRms = rms;
      this.frameCount += 1;
      this.waitingMs += VAD_POLL_MS;

      if (rms >= VAD_RMS_SPEECH) {
        this.hasSpoken = true;
        this.silenceMs = 0;
      } else if (this.hasSpoken) {
        this.silenceMs += VAD_POLL_MS;
        if (
          shouldFinalizeFromSilence({
            hasSpoken: this.hasSpoken,
            silenceMs: this.silenceMs,
            thresholdMs: VOICE_ENDPOINT_SILENCE_MS,
          })
        ) {
          this.fireEndpoint('silence');
          return;
        }
      } else if (
        shouldRecoverFromNoSpeech({
          hasSpoken: this.hasSpoken,
          waitingMs: this.waitingMs,
          thresholdMs: VOICE_NO_SPEECH_MS,
        })
      ) {
        this.fireEndpoint('no_speech');
        return;
      }

      if (this.frameCount % 12 === 0) this.emitDiag('vad');
    }, VAD_POLL_MS);
  }

  private fireEndpoint(reason: 'silence' | 'turn_end' | 'no_speech' | 'max_duration' | 'manual') {
    if (this.endpointFired) return;
    this.endpointFired = true;
    this.clearVad();
    logVoiceDiag('fallback endpoint', { reason });
    this.onEndpoint?.(reason);
  }

  private clearVad() {
    if (this.vadTimer) {
      clearInterval(this.vadTimer);
      this.vadTimer = null;
    }
    if (this.maxTimer) {
      clearTimeout(this.maxTimer);
      this.maxTimer = null;
    }
    this.analyser = null;
  }

  pushAudioChunk(chunk: Blob): void {
    this.audioChunks.push(chunk);
  }

  async stopSession(): Promise<void> {
    this.clearVad();
    this.onEndpoint = undefined;
    if (this.recognition && this.isRecognitionActive) {
      try {
        this.recognition.stop();
      } catch (e) {
        console.error('Error stopping speech recognition:', e);
      }
      this.isRecognitionActive = false;
    }

    return new Promise((resolve) => {
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.onstop = () => {
          void this.audioContext?.close().catch(() => {});
          this.audioContext = null;
          this.cleanupStream();
          resolve();
        };
        this.mediaRecorder.stop();
      } else {
        void this.audioContext?.close().catch(() => {});
        this.audioContext = null;
        this.cleanupStream();
        resolve();
      }
    });
  }

  async cancelSession(): Promise<void> {
    this.sessionGen += 1;
    this.clearVad();
    this.onEndpoint = undefined;
    this.onTranscript = undefined;
    this.draft = createVoiceTranscriptDraft(0);
    this.audioChunks = [];
    if (this.recognition && this.isRecognitionActive) {
      try {
        this.recognition.abort?.() ?? this.recognition.stop();
      } catch {
        // ignore
      }
      this.isRecognitionActive = false;
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      try {
        this.mediaRecorder.onstop = null;
        this.mediaRecorder.stop();
      } catch {
        // ignore
      }
    }
    await this.audioContext?.close().catch(() => {});
    this.audioContext = null;
    this.cleanupStream();
  }

  private cleanupStream() {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (e) {
          console.error('Error stopping track:', e);
        }
      });
      this.stream = null;
    }
    this.mediaRecorder = null;
  }

  async getFinalTranscript(_activeLessonId?: string): Promise<string> {
    const trimmed = displayedVoiceTranscript(this.draft).trim() || this.draft.finalized.trim();
    if (trimmed) logVoiceDiag('fallback transcript ready', { chars: trimmed.length });
    else console.warn('Speech recognition heard nothing.');
    return trimmed;
  }
}

/**
 * Cartesia Ink streaming STT via Auto turn detection (`/stt/turns/websocket`).
 * Emits live turn.update transcripts and ends on turn.end (~1.5s silence).
 * Local VAD is a backup for no-speech / max-duration / silence recovery.
 */
export class CartesiaTranscriptionProvider implements TranscriptionProvider {
  private socket: WebSocket | null = null;
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private workletNode: AudioWorkletNode | null = null;
  private pending: ArrayBuffer[] = [];
  private draft: VoiceTranscriptDraft = createVoiceTranscriptDraft(0);
  private flushed: (() => void) | null = null;
  private fallback = new WebAudioTranscriptionProvider();
  private usingFallback = false;
  private vadTimer: ReturnType<typeof setInterval> | null = null;
  private maxTimer: ReturnType<typeof setTimeout> | null = null;
  private analyser: AnalyserNode | null = null;
  private onEndpoint: TranscriptionSessionOptions["onEndpoint"] = undefined;
  private onTranscript: TranscriptionSessionOptions["onTranscript"] = undefined;
  private onDiagnostics: TranscriptionSessionOptions["onDiagnostics"] = undefined;
  private hasSpoken = false;
  private silenceMs = 0;
  private waitingMs = 0;
  private endpointFired = false;
  private frameCount = 0;
  private framesSent = 0;
  private lastRms = 0;
  private lastPeak = 0;
  private sessionGen = 0;
  private socketConnected = false;
  private silentGain: GainNode | null = null;
  private cartesiaErrorCode?: string;

  async startSession(options?: TranscriptionSessionOptions): Promise<void> {
    this.sessionGen += 1;
    const gen = this.sessionGen;
    this.draft = createVoiceTranscriptDraft(gen);
    this.pending = [];
    this.usingFallback = false;
    this.onEndpoint = options?.onEndpoint;
    this.onTranscript = options?.onTranscript;
    this.onDiagnostics = options?.onDiagnostics;
    this.hasSpoken = false;
    this.silenceMs = 0;
    this.waitingMs = 0;
    this.endpointFired = false;
    this.frameCount = 0;
    this.framesSent = 0;
    this.socketConnected = false;
    this.cartesiaErrorCode = undefined;
    this.clearVad();

    // Gate: token mint ≠ usable STT socket (Part 6.6.4 — confirmed 402 quota_exceeded).
    const preflight = await fetchSttPreflight();
    logVoiceDiag('stt_preflight', {
      ok: preflight.ok,
      statusCode: preflight.statusCode,
      errorCode: preflight.errorCode,
    });
    if (shouldUseWebSpeechFallback(preflight)) {
      this.cartesiaErrorCode = preflight.errorCode;
      this.usingFallback = true;
      this.emitDiag(
        isCartesiaQuotaFailure(preflight) ? 'cartesia_quota_exceeded' : 'cartesia_unavailable'
      );
      console.warn(
        '[VoiceSTT] Cartesia STT socket unusable — falling back to browser speech recognition',
        { errorCode: preflight.errorCode, statusCode: preflight.statusCode }
      );
      return this.fallback.startSession(options);
    }
    if (gen !== this.sessionGen) return;

    // Acquire mic BEFORE awaiting the token so the user-gesture chain stays valid.
    let stream: MediaStream;
    try {
      // Prefer the OS default input; avoid Continuity/iPhone picks unless chosen by the user.
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (err) {
      console.error('Microphone access denied or failed:', err);
      this.emitDiag('mic_denied');
      throw err;
    }
    if (gen !== this.sessionGen) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    this.stream = stream;
    const track = stream.getAudioTracks()[0];
    const settings = track?.getSettings?.() ?? {};
    logVoiceDiag('mic_acquired', {
      trackReadyState: track?.readyState,
      trackMuted: !!track?.muted,
      trackEnabled: track?.enabled !== false,
      // Device label may be blank until permission; never log full IDs in production paths.
      hasDeviceId: Boolean(settings.deviceId),
    });

    // Native hardware rate (commonly 48000). Cartesia browser path: pcm_f32le + this rate.
    this.audioContext = new AudioContext();
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume().catch((err) => {
        console.warn('AudioContext resume failed:', err);
      });
    }
    logVoiceDiag('audio_context', {
      state: this.audioContext.state,
      sampleRate: this.audioContext.sampleRate,
    });

    const workletUrl = URL.createObjectURL(new Blob([PCM_WORKLET_SOURCE], { type: 'application/javascript' }));
    try {
      await this.audioContext.audioWorklet.addModule(workletUrl);
    } finally {
      URL.revokeObjectURL(workletUrl);
    }
    if (gen !== this.sessionGen) {
      await this.teardownAudio();
      return;
    }

    const source = this.audioContext.createMediaStreamSource(this.stream);
    const framer = new AudioWorkletNode(this.audioContext, 'pcm-framer');
    framer.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      if (gen !== this.sessionGen) return;
      this.frameCount += 1;
      const floats = new Float32Array(event.data);
      this.lastRms = float32Rms(floats);
      this.lastPeak = float32Peak(floats);
      // Always send continuous audio (including silence) — Cartesia Auto waits if frames stop.
      this.pushFrame(packPcmF32le(floats));
      if (this.frameCount === 1 || this.frameCount % 10 === 0) {
        logVoiceDiag('pcm_frames_received', {
          count: this.frameCount,
          rms: Number(this.lastRms.toFixed(4)),
          peak: Number(this.lastPeak.toFixed(4)),
          sent: this.framesSent,
        });
      }
    };
    source.connect(framer);
    // Keep the worklet graph pulled: muted destination tap (no audible feedback).
    this.silentGain = this.audioContext.createGain();
    this.silentGain.gain.value = 0;
    framer.connect(this.silentGain);
    this.silentGain.connect(this.audioContext.destination);
    this.workletNode = framer;

    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 2048;
    source.connect(this.analyser);
    this.startVad(gen);

    let session;
    try {
      session = await getVoiceSession();
    } catch (err) {
      console.warn('Cartesia session mint failed, using browser speech recognition:', err);
      this.usingFallback = true;
      await this.teardownAudio();
      return this.fallback.startSession(options);
    }
    if (gen !== this.sessionGen) {
      await this.teardownAudio();
      return;
    }

    const sampleRate = String(Math.round(this.audioContext.sampleRate));
    const socket = new WebSocket(
      cartesiaSocketUrl('/stt/turns/websocket', session, {
        model: session.sttModel,
        encoding: 'pcm_f32le',
        sample_rate: sampleRate,
        turn_end_timeout_ms: String(CARTESIA_TURN_END_TIMEOUT_MS),
      })
    );
    socket.binaryType = 'arraybuffer';
    socket.onopen = () => {
      this.socketConnected = true;
      logVoiceDiag('socket_open', {
        pendingFrames: this.pending.length,
        sampleRate: this.audioContext?.sampleRate,
      });
      for (const frame of this.pending) {
        socket.send(frame);
        this.framesSent += 1;
      }
      this.pending = [];
      this.emitDiag('socket_open');
    };
    socket.onmessage = (event) => {
      if (gen !== this.sessionGen) return;
      this.handleMessage(event.data);
    };
    socket.onerror = () => {
      console.error('[VoiceSTT] Cartesia STT socket error');
      this.emitDiag('socket_error');
    };
    socket.onclose = (ev) => {
      logVoiceDiag('socket_close', { code: ev.code, wasConnected: this.socketConnected });
      this.flushed?.();
      this.flushed = null;
      // If the socket dies before `connected`, fall back so Listening is not a dead end.
      if (gen === this.sessionGen && !this.socketConnected && !this.endpointFired && !this.usingFallback) {
        console.warn('[VoiceSTT] Cartesia socket closed before connect — switching to Web Speech');
        this.usingFallback = true;
        void this.teardownAudio().then(() => this.fallback.startSession(options));
      }
    };
    this.socket = socket;
    this.emitDiag('listening');
  }

  pushAudioChunk(_chunk: Blob): void {
    // Audio is framed by the worklet and sent as PCM; Blob chunks are not used.
  }

  private pushFrame(frame: ArrayBuffer): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(frame);
      this.framesSent += 1;
    } else {
      // Queue briefly while connecting; cap to avoid unbounded memory if socket never opens.
      if (this.pending.length < 50) this.pending.push(frame);
    }
  }

  private handleMessage(data: unknown): void {
    if (typeof data !== 'string') return;
    let msg: { type?: string; transcript?: string; message?: string };
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }

    if (msg.type === 'error') {
      console.error('Cartesia STT error:', msg.message);
      this.emitDiag('provider_error');
      this.fireEndpoint('no_speech');
      this.flushed?.();
      return;
    }

    if (msg.type === 'connected') {
      this.socketConnected = true;
      logVoiceDiag('server_event', { type: 'connected' });
      this.emitDiag('connected');
      return;
    }

    const reduced = reduceCartesiaTurnEvent(this.draft, msg);
    this.draft = reduced.draft;

    if (msg.type === 'turn.start') {
      this.hasSpoken = true;
      this.silenceMs = 0;
      logVoiceDiag('server_event', { type: 'turn.start' });
      this.emitDiag('turn_start');
      return;
    }

    if (msg.type === 'turn.update' || msg.type === 'turn.eager_end') {
      this.hasSpoken = true;
      this.silenceMs = 0;
      logVoiceDiag('server_event', {
        type: msg.type,
        chars: displayedVoiceTranscript(this.draft).length,
      });
      this.onTranscript?.({
        text: displayedVoiceTranscript(this.draft),
        isFinal: false,
        revision: this.draft.revision,
      });
      return;
    }

    if (msg.type === 'turn.resume') {
      logVoiceDiag('server_event', { type: 'turn.resume' });
      return;
    }

    if (msg.type === 'turn.end' || reduced.endpoint) {
      this.hasSpoken = true;
      logVoiceDiag('server_event', {
        type: 'turn.end',
        chars: displayedVoiceTranscript(this.draft).length,
      });
      this.onTranscript?.({
        text: displayedVoiceTranscript(this.draft),
        isFinal: true,
        revision: this.draft.revision,
      });
      this.fireEndpoint('turn_end');
      return;
    }
  }

  private emitDiag(stage: string) {
    const track = this.stream?.getAudioTracks()[0];
    this.onDiagnostics?.({
      permission: this.stream ? 'granted' : 'unknown',
      trackReadyState: track?.readyState,
      trackMuted: track?.muted,
      trackEnabled: track?.enabled,
      audioContextState: this.audioContext?.state,
      sampleRate: this.audioContext?.sampleRate,
      frameCount: this.frameCount,
      framesSent: this.framesSent,
      rms: this.lastRms,
      peak: this.lastPeak,
      hasSpoken: this.hasSpoken,
      silenceMs: this.silenceMs,
      waitingMs: this.waitingMs,
      socketState: this.socket?.readyState,
      usingFallback: this.usingFallback,
      stage,
      cartesiaErrorCode: this.cartesiaErrorCode,
    });
  }

  private startVad(gen: number) {
    this.maxTimer = setTimeout(() => this.fireEndpoint('max_duration'), VOICE_MAX_RECORDING_MS);
    this.vadTimer = setInterval(() => {
      if (gen !== this.sessionGen || !this.analyser || this.endpointFired) return;
      const data = new Float32Array(this.analyser.fftSize);
      this.analyser.getFloatTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
      const rms = Math.sqrt(sum / data.length);
      this.lastRms = rms;
      this.waitingMs += VAD_POLL_MS;

      if (rms >= VAD_RMS_SPEECH) {
        this.hasSpoken = true;
        this.silenceMs = 0;
      } else if (this.hasSpoken) {
        this.silenceMs += VAD_POLL_MS;
        // Backup silence finalize if Cartesia turn.end is delayed.
        if (
          shouldFinalizeFromSilence({
            hasSpoken: this.hasSpoken,
            silenceMs: this.silenceMs,
            thresholdMs: VOICE_ENDPOINT_SILENCE_MS + 400,
          })
        ) {
          this.fireEndpoint('silence');
          return;
        }
      } else if (
        shouldRecoverFromNoSpeech({
          hasSpoken: this.hasSpoken,
          waitingMs: this.waitingMs,
          thresholdMs: VOICE_NO_SPEECH_MS,
        })
      ) {
        this.fireEndpoint('no_speech');
        return;
      }

      if (this.frameCount > 0 && this.frameCount % 25 === 0) {
        this.emitDiag('vad');
      }
    }, VAD_POLL_MS);
  }

  private fireEndpoint(reason: 'silence' | 'turn_end' | 'no_speech' | 'max_duration' | 'manual') {
    if (this.endpointFired) return;
    this.endpointFired = true;
    this.clearVad();
    logVoiceDiag('endpoint', {
      reason,
      frames: this.frameCount,
      hasSpoken: this.hasSpoken,
    });
    this.onEndpoint?.(reason);
  }

  private clearVad() {
    if (this.vadTimer) {
      clearInterval(this.vadTimer);
      this.vadTimer = null;
    }
    if (this.maxTimer) {
      clearTimeout(this.maxTimer);
      this.maxTimer = null;
    }
    this.analyser = null;
  }

  private async teardownAudio() {
    this.clearVad();
    try {
      this.workletNode?.disconnect();
    } catch {
      // ignore
    }
    try {
      this.silentGain?.disconnect();
    } catch {
      // ignore
    }
    this.silentGain = null;
    this.workletNode?.port.close();
    this.workletNode = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    await this.audioContext?.close().catch(() => {});
    this.audioContext = null;
  }

  async stopSession(): Promise<void> {
    this.clearVad();
    this.onEndpoint = undefined;
    if (this.usingFallback) {
      return this.fallback.stopSession();
    }

    const socket = this.socket;
    this.socket = null;
    await this.teardownAudio();
    if (!socket) return;

    if (socket.readyState === WebSocket.CONNECTING) {
      await new Promise<void>((resolve) => {
        socket.addEventListener('open', () => resolve(), { once: true });
        socket.addEventListener('close', () => resolve(), { once: true });
      });
    }

    if (socket.readyState === WebSocket.OPEN) {
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, FINALIZE_TIMEOUT_MS);
        this.flushed = () => {
          clearTimeout(timer);
          resolve();
        };
        try {
          socket.send(JSON.stringify({ type: 'close' }));
        } catch {
          clearTimeout(timer);
          resolve();
        }
      });
      this.flushed = null;
    }
    try {
      socket.close();
    } catch {
      // already closing
    }
  }

  async cancelSession(): Promise<void> {
    this.sessionGen += 1;
    this.clearVad();
    this.onEndpoint = undefined;
    this.onTranscript = undefined;
    this.draft = createVoiceTranscriptDraft(0);
    this.pending = [];
    if (this.usingFallback) {
      return this.fallback.cancelSession();
    }

    const socket = this.socket;
    this.socket = null;
    this.flushed = null;
    await this.teardownAudio();
    if (socket) {
      try {
        socket.close();
      } catch {
        // ignore
      }
    }
  }

  async getFinalTranscript(activeLessonId?: string): Promise<string> {
    if (this.usingFallback) {
      return this.fallback.getFinalTranscript(activeLessonId);
    }
    const trimmed = displayedVoiceTranscript(this.draft).trim();
    if (trimmed) logVoiceDiag('transcript ready', { chars: trimmed.length });
    else console.warn('Cartesia STT heard nothing.');
    return trimmed;
  }
}

export const transcriptionProvider = new CartesiaTranscriptionProvider();
