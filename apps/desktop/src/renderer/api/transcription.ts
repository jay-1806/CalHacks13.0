import { cartesiaSocketUrl, getVoiceSession } from './voice-session';

export interface TranscriptionProvider {
  startSession(): Promise<void>;
  pushAudioChunk(chunk: Blob): void;
  stopSession(): Promise<void>;
  /** What the learner said, or '' if nothing was heard (never a made-up question). */
  getFinalTranscript(activeLessonId?: string): Promise<string>;
}

export class WebAudioTranscriptionProvider implements TranscriptionProvider {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private recognition: any = null;
  private transcript = '';
  private isRecognitionActive = false;

  async startSession(): Promise<void> {
    this.audioChunks = [];
    this.transcript = '';
    
    // Start standard media recording to keep system mic active
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.mediaRecorder = new MediaRecorder(this.stream);
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.pushAudioChunk(event.data);
        }
      };
      this.mediaRecorder.start();
    } catch (err) {
      console.error('Microphone access denied or failed:', err);
      throw err;
    }

    // Start Web Speech API Recognition in parallel
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      try {
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = true;
        this.recognition.interimResults = false;
        this.recognition.lang = 'en-US';

        this.recognition.onresult = (event: any) => {
          let finalTranscript = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) {
              finalTranscript += event.results[i][0].transcript + ' ';
            }
          }
          if (finalTranscript) {
            this.transcript += finalTranscript;
          }
        };

        this.recognition.onerror = (event: any) => {
          console.error('Speech recognition error:', event.error);
        };

        this.recognition.onend = () => {
          this.isRecognitionActive = false;
        };

        this.isRecognitionActive = true;
        this.recognition.start();
      } catch (err) {
        console.error('Speech recognition failed to start:', err);
      }
    } else {
      console.warn('SpeechRecognition not supported in this browser environment.');
    }
  }

  pushAudioChunk(chunk: Blob): void {
    this.audioChunks.push(chunk);
  }

  async stopSession(): Promise<void> {
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
          this.cleanupStream();
          resolve();
        };
        this.mediaRecorder.stop();
      } else {
        this.cleanupStream();
        resolve();
      }
    });
  }

  private cleanupStream() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => {
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
    const trimmed = this.transcript.trim();
    if (trimmed) console.log('Speech recognition transcript:', trimmed);
    else console.warn('Speech recognition heard nothing.');
    return trimmed;
  }
}

const STT_SAMPLE_RATE = 16000;
/** ~100 ms of 16 kHz audio per WebSocket frame, as Cartesia recommends */
const STT_FRAME_SAMPLES = 1600;
const FINALIZE_TIMEOUT_MS = 2500;

/** Converts mic audio to 16-bit PCM frames off the main thread. */
const PCM_WORKLET_SOURCE = `
class PcmFramer extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Int16Array(${STT_FRAME_SAMPLES}); this.len = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      const s = Math.max(-1, Math.min(1, ch[i]));
      this.buf[this.len++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      if (this.len === this.buf.length) {
        this.port.postMessage(this.buf.buffer, [this.buf.buffer]);
        this.buf = new Int16Array(${STT_FRAME_SAMPLES});
        this.len = 0;
      }
    }
    return true;
  }
}
registerProcessor('pcm-framer', PcmFramer);
`;

/**
 * Cartesia Ink streaming speech-to-text. Audio is sent while push-to-talk is held,
 * so the transcript is ready almost immediately after release instead of after a
 * full upload + batch transcription.
 */
export class CartesiaTranscriptionProvider implements TranscriptionProvider {
  private socket: WebSocket | null = null;
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private pending: ArrayBuffer[] = [];
  private transcript = '';
  private flushed: (() => void) | null = null;
  private fallback = new WebAudioTranscriptionProvider();
  private usingFallback = false;

  async startSession(): Promise<void> {
    this.transcript = '';
    this.pending = [];
    this.usingFallback = false;

    let session;
    try {
      session = await getVoiceSession();
    } catch (err) {
      console.warn('Cartesia STT unavailable, using browser speech recognition:', err);
      this.usingFallback = true;
      return this.fallback.startSession();
    }

    // Mic first: the socket handshake overlaps with the user starting to talk,
    // and frames captured meanwhile are queued, not dropped.
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
    });
    this.audioContext = new AudioContext({ sampleRate: STT_SAMPLE_RATE });
    const workletUrl = URL.createObjectURL(new Blob([PCM_WORKLET_SOURCE], { type: 'application/javascript' }));
    try {
      await this.audioContext.audioWorklet.addModule(workletUrl);
    } finally {
      URL.revokeObjectURL(workletUrl);
    }
    const source = this.audioContext.createMediaStreamSource(this.stream);
    const framer = new AudioWorkletNode(this.audioContext, 'pcm-framer');
    framer.port.onmessage = (event: MessageEvent<ArrayBuffer>) => this.pushFrame(event.data);
    source.connect(framer);

    const socket = new WebSocket(
      cartesiaSocketUrl('/stt/websocket', session, {
        model: session.sttModel,
        encoding: 'pcm_s16le',
        sample_rate: String(STT_SAMPLE_RATE),
      })
    );
    socket.binaryType = 'arraybuffer';
    socket.onopen = () => {
      for (const frame of this.pending) socket.send(frame);
      this.pending = [];
    };
    socket.onmessage = (event) => this.handleMessage(event.data);
    socket.onerror = (event) => console.error('Cartesia STT socket error:', event);
    socket.onclose = () => {
      this.flushed?.();
    };
    this.socket = socket;
  }

  pushAudioChunk(_chunk: Blob): void {
    // Audio is framed by the worklet and sent as PCM; Blob chunks are not used.
  }

  private pushFrame(frame: ArrayBuffer): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(frame);
    } else {
      this.pending.push(frame);
    }
  }

  private handleMessage(data: unknown): void {
    if (typeof data !== 'string') return;
    let msg: { type?: string; text?: string; is_final?: boolean; message?: string };
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }
    if (msg.type === 'transcript' && msg.is_final && msg.text) {
      // Final texts are deltas; concatenate without touching whitespace.
      this.transcript += msg.text;
    } else if (msg.type === 'flush_done' || msg.type === 'done') {
      this.flushed?.();
    } else if (msg.type === 'error') {
      console.error('Cartesia STT error:', msg.message);
      this.flushed?.();
    }
  }

  async stopSession(): Promise<void> {
    if (this.usingFallback) {
      return this.fallback.stopSession();
    }

    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    await this.audioContext?.close().catch(() => {});
    this.audioContext = null;

    const socket = this.socket;
    this.socket = null;
    if (!socket) return;

    if (socket.readyState === WebSocket.CONNECTING) {
      // Released before the handshake finished: wait for it so queued audio is sent.
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
        socket.send('finalize');
      });
      this.flushed = null;
      try {
        socket.send('close');
      } catch {
        // already closing
      }
    }
    socket.close();
  }

  async getFinalTranscript(activeLessonId?: string): Promise<string> {
    if (this.usingFallback) {
      return this.fallback.getFinalTranscript(activeLessonId);
    }
    const trimmed = this.transcript.trim();
    if (trimmed) console.log('Cartesia transcript:', trimmed);
    else console.warn('Cartesia STT heard nothing.');
    return trimmed;
  }
}

export const transcriptionProvider = new CartesiaTranscriptionProvider();
