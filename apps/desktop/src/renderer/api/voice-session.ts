const API_BASE = 'http://localhost:4317';

export const CARTESIA_WS_BASE = 'wss://api.cartesia.ai';

export interface VoiceSession {
  token: string;
  expiresAt: number;
  version: string;
  voiceId: string;
  ttsModel: string;
  sttModel: string;
}

let cached: VoiceSession | null = null;
let inflight: Promise<VoiceSession> | null = null;

/**
 * Short-lived Cartesia credentials minted by the orchestrator. Shared by TTS and STT
 * so a push-to-talk press warms the token the answer's speech will use.
 */
export function getVoiceSession(): Promise<VoiceSession> {
  if (cached && cached.expiresAt - Date.now() > 30_000) {
    return Promise.resolve(cached);
  }
  inflight ??= fetch(`${API_BASE}/api/voice/session`)
    .then(async (res) => {
      if (!res.ok) throw new Error(`Voice session unavailable (${res.status})`);
      cached = (await res.json()) as VoiceSession;
      return cached;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function cartesiaSocketUrl(path: string, session: VoiceSession, params: Record<string, string> = {}): string {
  const query = new URLSearchParams({
    ...params,
    cartesia_version: session.version,
    access_token: session.token,
  });
  return `${CARTESIA_WS_BASE}${path}?${query.toString()}`;
}
