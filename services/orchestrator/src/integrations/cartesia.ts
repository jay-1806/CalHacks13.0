/**
 * Cartesia voice (Sonic TTS + Ink STT).
 *
 * The orchestrator never proxies audio. It only mints short-lived access tokens so
 * the desktop renderer can open Cartesia's WebSockets directly — audio streams
 * straight to the speaker / from the mic with no extra hop, and the API key never
 * leaves this process.
 */

export const CARTESIA_API_BASE = 'https://api.cartesia.ai';

export interface VoiceSessionConfig {
  token: string;
  /** Epoch ms after which the token must not be used for new sockets */
  expiresAt: number;
  version: string;
  voiceId: string;
  ttsModel: string;
  sttModel: string;
}

export interface CartesiaIntegration {
  isConfigured(): boolean;
  getVoiceSession(): Promise<VoiceSessionConfig>;
}

interface CartesiaOptions {
  apiKey: string;
  voiceId: string;
  ttsModel: string;
  sttModel: string;
  version: string;
  tokenTtlSeconds: number;
}

export class CartesiaService implements CartesiaIntegration {
  private cached: VoiceSessionConfig | null = null;
  private inflight: Promise<VoiceSessionConfig> | null = null;

  constructor(
    private options: CartesiaOptions,
    private fetchImpl: typeof fetch = fetch
  ) {}

  isConfigured(): boolean {
    return !!this.options.apiKey && !!this.options.voiceId;
  }

  async getVoiceSession(): Promise<VoiceSessionConfig> {
    if (!this.isConfigured()) {
      throw new Error('Cartesia is not configured.');
    }
    // Reuse a token while it has at least 30s left, so warm-up and the real
    // request share one mint.
    if (this.cached && this.cached.expiresAt - Date.now() > 30_000) {
      return this.cached;
    }
    this.inflight ??= this.mint().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async mint(): Promise<VoiceSessionConfig> {
    const { apiKey, version, tokenTtlSeconds } = this.options;
    const res = await this.fetchImpl(`${CARTESIA_API_BASE}/access-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cartesia-Version': version,
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ grants: { tts: true, stt: true }, expires_in: tokenTtlSeconds }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Cartesia access-token request failed (${res.status}): ${body}`);
    }

    const { token } = (await res.json()) as { token?: string };
    if (!token) {
      throw new Error('Cartesia access-token response did not include a token.');
    }

    this.cached = {
      token,
      expiresAt: Date.now() + tokenTtlSeconds * 1000,
      version,
      voiceId: this.options.voiceId,
      ttsModel: this.options.ttsModel,
      sttModel: this.options.sttModel,
    };
    return this.cached;
  }
}

export class MockCartesiaService implements CartesiaIntegration {
  isConfigured(): boolean {
    return false;
  }

  async getVoiceSession(): Promise<VoiceSessionConfig> {
    throw new Error('Cartesia voice is not configured.');
  }
}
