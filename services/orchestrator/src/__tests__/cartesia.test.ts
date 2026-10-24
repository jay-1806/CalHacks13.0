import { describe, it, expect, vi } from 'vitest';
import { CartesiaService, MockCartesiaService } from '../integrations/cartesia.js';

const options = {
  apiKey: 'sk_car_test',
  voiceId: 'voice-1',
  ttsModel: 'sonic-3.6',
  sttModel: 'ink-2',
  version: '2026-08-14',
  tokenTtlSeconds: 300,
};

function okFetch(token = 'jwt-1') {
  return vi.fn(async () => new Response(JSON.stringify({ token }), { status: 200 }));
}

describe('CartesiaService', () => {
  it('mints a TTS+STT access token with the API key and version headers', async () => {
    const fetchImpl = okFetch();
    const service = new CartesiaService(options, fetchImpl as unknown as typeof fetch);

    const session = await service.getVoiceSession();

    expect(session).toMatchObject({ token: 'jwt-1', voiceId: 'voice-1', ttsModel: 'sonic-3.6', sttModel: 'ink-2' });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.cartesia.ai/access-token');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer sk_car_test');
    expect(headers['Cartesia-Version']).toBe('2026-08-14');
    expect(JSON.parse(init.body as string)).toEqual({ grants: { tts: true, stt: true }, expires_in: 300 });
  });

  it('reuses one token for concurrent and repeated requests', async () => {
    const fetchImpl = okFetch();
    const service = new CartesiaService(options, fetchImpl as unknown as typeof fetch);

    await Promise.all([service.getVoiceSession(), service.getVoiceSession()]);
    await service.getVoiceSession();

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('mints a new token once the cached one is close to expiry', async () => {
    const fetchImpl = okFetch();
    const service = new CartesiaService({ ...options, tokenTtlSeconds: 20 }, fetchImpl as unknown as typeof fetch);

    await service.getVoiceSession();
    await service.getVoiceSession();

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('surfaces Cartesia errors without leaking the key', async () => {
    const fetchImpl = vi.fn(async () => new Response('bad key', { status: 401 }));
    const service = new CartesiaService(options, fetchImpl as unknown as typeof fetch);

    await expect(service.getVoiceSession()).rejects.toThrow(/401/);
    await expect(service.getVoiceSession()).rejects.not.toThrow(/sk_car_test/);
  });

  it('is unconfigured without a voice id, and the mock always is', async () => {
    expect(new CartesiaService({ ...options, voiceId: '' }).isConfigured()).toBe(false);
    expect(new MockCartesiaService().isConfigured()).toBe(false);
    await expect(new MockCartesiaService().getVoiceSession()).rejects.toThrow();
  });
});
