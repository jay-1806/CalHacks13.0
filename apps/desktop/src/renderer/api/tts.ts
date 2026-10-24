export interface TTSProvider {
  speak(text: string, onStart?: () => void, onEnd?: () => void): void;
  stop(): void;
  isSpeaking(): boolean;
  /** Optional: prepare the voice connection before an answer arrives */
  warm?(): void;
}

import { stripStreamTags } from '@screentutor/shared';
import { cartesiaSocketUrl, getVoiceSession } from './voice-session';

function stripPointTags(text: string): string {
  return stripStreamTags(text);
}

export class MockTTSProvider implements TTSProvider {
  private activeTimeout: ReturnType<typeof setTimeout> | null = null;
  private speaking = false;
  private onEndCallback: (() => void) | undefined = undefined;

  speak(text: string, onStart?: () => void, onEnd?: () => void): void {
    this.stop();
    const cleanText = stripPointTags(text);
    if (!cleanText) {
      onEnd?.();
      return;
    }

    this.speaking = true;
    this.onEndCallback = onEnd;
    onStart?.();

    const duration = Math.min(6000, Math.max(1500, cleanText.length * 40));
    this.activeTimeout = setTimeout(() => {
      this.speaking = false;
      onEnd?.();
      this.activeTimeout = null;
    }, duration);
  }

  stop(): void {
    if (this.activeTimeout) {
      clearTimeout(this.activeTimeout);
      this.activeTimeout = null;
    }
    if (this.speaking) {
      this.speaking = false;
      this.onEndCallback?.();
    }
  }

  isSpeaking(): boolean {
    return this.speaking;
  }
}

export class SystemTTSProvider implements TTSProvider {
  private activeUtterance: SpeechSynthesisUtterance | null = null;

  speak(text: string, onStart?: () => void, onEnd?: () => void): void {
    this.stop();

    if (typeof window === 'undefined' || !window.speechSynthesis) {
      console.warn('System speech synthesis is not supported in this environment.');
      onEnd?.();
      return;
    }

    const cleanText = stripPointTags(text);
    if (!cleanText) {
      onEnd?.();
      return;
    }

    try {
      const utterance = new SpeechSynthesisUtterance(cleanText);
      this.activeUtterance = utterance;

      utterance.onstart = () => {
        onStart?.();
      };

      const handleEnd = () => {
        if (this.activeUtterance === utterance) {
          this.activeUtterance = null;
        }
        onEnd?.();
      };

      utterance.onend = handleEnd;
      utterance.onerror = (e) => {
        console.error('Speech synthesis utterance error:', e);
        handleEnd();
      };

      const voices = window.speechSynthesis.getVoices();
      const englishVoice = voices.find(v => v.lang.startsWith('en'));
      if (englishVoice) {
        utterance.voice = englishVoice;
      }

      utterance.rate = 1.05;
      utterance.pitch = 1.0;

      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.error('Error starting system speech synthesis:', err);
      onEnd?.();
    }
  }

  stop(): void {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch (err) {
        console.error('Error canceling speech synthesis:', err);
      }
    }
    this.activeUtterance = null;
  }

  isSpeaking(): boolean {
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      return window.speechSynthesis.speaking;
    }
    return false;
  }
}

const TTS_SAMPLE_RATE = 24000;
/** Small lead so the first chunk never starts in the past */
const PLAYBACK_LEAD_S = 0.05;

/**
 * Cartesia Sonic over WebSocket. Audio chunks are scheduled on a Web Audio clock
 * as they arrive, so speech starts on the first chunk rather than after a whole
 * file is synthesized and downloaded. The socket is kept open between answers.
 */
export class CartesiaTTSProvider implements TTSProvider {
  private socket: WebSocket | null = null;
  private socketReady: Promise<WebSocket> | null = null;
  private audioContext: AudioContext | null = null;
  private sources = new Set<AudioBufferSourceNode>();
  private nextStartTime = 0;
  private contextId: string | null = null;
  private generationDone = false;
  private carry: Uint8Array | null = null;
  private started = false;
  private pendingText = '';
  private onStart?: () => void;
  private onEnd?: () => void;
  private fallback = new SystemTTSProvider();

  /** Open the socket (and mint a token) ahead of the answer. Safe to call often. */
  warm(): void {
    this.ensureSocket().catch(() => {});
  }

  speak(text: string, onStart?: () => void, onEnd?: () => void): void {
    this.stop();

    const cleanText = stripPointTags(text);
    if (!cleanText) {
      onEnd?.();
      return;
    }

    const contextId = crypto.randomUUID();
    this.contextId = contextId;
    this.generationDone = false;
    this.started = false;
    this.carry = null;
    this.onStart = onStart;
    this.onEnd = onEnd;
    this.pendingText = text;

    const ctx = this.getAudioContext();
    void ctx.resume();
    this.nextStartTime = ctx.currentTime + PLAYBACK_LEAD_S;

    Promise.all([this.ensureSocket(), getVoiceSession()])
      .then(([socket, session]) => {
        if (this.contextId !== contextId) return;
        socket.send(
          JSON.stringify({
            model_id: session.ttsModel,
            transcript: cleanText,
            voice: { mode: 'id', id: session.voiceId },
            output_format: { container: 'raw', encoding: 'pcm_f32le', sample_rate: TTS_SAMPLE_RATE },
            context_id: contextId,
            continue: false,
          })
        );
      })
      .catch((err) => {
        if (this.contextId !== contextId) return;
        console.warn('Cartesia TTS unavailable, falling back to system voice:', err);
        this.contextId = null;
        this.fallback.speak(text, onStart, onEnd);
      });
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
    let msg: { type?: string; context_id?: string; data?: string; done?: boolean; message?: string };
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }
    if (!msg.context_id || msg.context_id !== this.contextId) return;

    if (msg.type === 'chunk' && msg.data) {
      this.schedule(msg.data);
    }
    if (msg.type === 'done' || msg.done) {
      this.generationDone = true;
      this.maybeFinish();
    } else if (msg.type === 'error') {
      console.error('Cartesia TTS error:', msg.message);
      if (!this.started && this.pendingText) {
        // Nothing played yet: the system voice is better than silence.
        const { text, onStart, onEnd } = { text: this.pendingText, onStart: this.onStart, onEnd: this.onEnd };
        this.contextId = null;
        this.onStart = this.onEnd = undefined;
        this.fallback.speak(text, onStart, onEnd);
        return;
      }
      this.generationDone = true;
      this.maybeFinish();
    }
  }

  private schedule(base64: string): void {
    const ctx = this.getAudioContext();
    let bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    if (this.carry) {
      const merged = new Uint8Array(this.carry.length + bytes.length);
      merged.set(this.carry);
      merged.set(bytes, this.carry.length);
      bytes = merged;
      this.carry = null;
    }
    // Chunks are not guaranteed to end on a 4-byte sample boundary.
    const usable = bytes.length - (bytes.length % 4);
    if (usable < bytes.length) this.carry = bytes.slice(usable);
    if (usable === 0) return;

    const samples = new Float32Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + usable));
    const buffer = ctx.createBuffer(1, samples.length, TTS_SAMPLE_RATE);
    buffer.copyToChannel(samples, 0);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    const startAt = Math.max(this.nextStartTime, ctx.currentTime + PLAYBACK_LEAD_S);
    source.start(startAt);
    this.nextStartTime = startAt + buffer.duration;
    this.sources.add(source);
    source.onended = () => {
      this.sources.delete(source);
      this.maybeFinish();
    };

    if (!this.started) {
      this.started = true;
      this.onStart?.();
    }
  }

  private maybeFinish(): void {
    if (!this.generationDone || this.sources.size > 0 || !this.contextId) return;
    this.contextId = null;
    const onEnd = this.onEnd;
    this.onStart = this.onEnd = undefined;
    onEnd?.();
  }

  private getAudioContext(): AudioContext {
    this.audioContext ??= new AudioContext({ sampleRate: TTS_SAMPLE_RATE });
    return this.audioContext;
  }

  stop(): void {
    this.fallback.stop();
    const contextId = this.contextId;
    this.contextId = null;
    if (contextId && this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ context_id: contextId, cancel: true }));
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
    this.onStart = this.onEnd = undefined;
    this.started = false;
  }

  isSpeaking(): boolean {
    return (!!this.contextId && this.started) || this.fallback.isSpeaking();
  }
}

export const ttsProvider = new CartesiaTTSProvider();
