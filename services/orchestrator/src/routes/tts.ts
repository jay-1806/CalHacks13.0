import type { FastifyPluginAsync } from 'fastify';
import https from 'node:https';
import { RedactionService, parseCartesiaErrorBody, type SttPreflightResult } from '@screentutor/shared';
import { config } from '../config.js';

/**
 * Probe Cartesia STT WebSocket upgrade without exposing credentials.
 * A successful voice-session mint does NOT imply the STT socket is usable (e.g. 402 quota).
 */
function probeCartesiaSttUpgrade(opts: {
  apiKey: string;
  version: string;
  sttModel: string;
}): Promise<SttPreflightResult> {
  return new Promise((resolve) => {
    const params = new URLSearchParams({
      model: opts.sttModel,
      encoding: 'pcm_f32le',
      sample_rate: '48000',
      cartesia_version: opts.version,
    });
    const req = https.request(
      {
        hostname: 'api.cartesia.ai',
        path: `/stt/turns/websocket?${params.toString()}`,
        method: 'GET',
        headers: {
          Connection: 'Upgrade',
          Upgrade: 'websocket',
          'Sec-WebSocket-Version': '13',
          'Sec-WebSocket-Key': 'cXVpY2t5LXN0dC1wcmVmbGlnaHQ=',
          Authorization: `Bearer ${opts.apiKey}`,
          'Cartesia-Version': opts.version,
        },
        timeout: 6000,
      },
      (res) => {
        let body = '';
        res.on('data', (c) => {
          body += c;
        });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ ok: true, statusCode: res.statusCode });
            return;
          }
          resolve(parseCartesiaErrorBody(body, res.statusCode));
        });
      }
    );
    req.on('upgrade', (_res, socket) => {
      try {
        socket.destroy();
      } catch {
        // ignore
      }
      resolve({ ok: true, statusCode: 101 });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, message: 'Cartesia STT preflight timed out' });
    });
    req.on('error', (err) => {
      resolve({ ok: false, message: RedactionService.redactError(err).message || 'Cartesia STT preflight failed' });
    });
    req.end();
  });
}

export const ttsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/tts/status', async () => {
    const configured = !!(config.CARTESIA_API_KEY && config.CARTESIA_VOICE_ID);
    return {
      provider: 'cartesia',
      enabled: config.CARTESIA_ENABLED && configured,
      configured,
    };
  });

  /**
   * Short-lived Cartesia credentials for the renderer's direct TTS/STT WebSockets.
   * The renderer calls this once per question (it is cached here until near expiry).
   */
  fastify.get('/api/voice/session', async (_request, reply) => {
    try {
      if (!config.CARTESIA_ENABLED) {
        return reply.status(503).send({ error: 'Cartesia voice is disabled' });
      }
      const cartesia = await fastify.getCartesia();
      if (!cartesia.isConfigured()) {
        return reply.status(503).send({ error: 'Cartesia voice is not configured' });
      }
      return await cartesia.getVoiceSession();
    } catch (err: any) {
      fastify.log.error(err);
      const safeError = RedactionService.redactError(err);
      return reply.status(502).send({ error: safeError.message || 'Voice session failed' });
    }
  });

  /**
   * Part 6.6.4 — verify the STT WebSocket path itself (not just token minting).
   * Returns no secrets; used to choose Web Speech fallback when Cartesia is unusable.
   */
  fastify.get('/api/voice/stt-preflight', async () => {
    if (!config.CARTESIA_ENABLED || !config.CARTESIA_API_KEY) {
      return {
        ok: false,
        errorCode: 'not_configured',
        message: 'Cartesia STT is not configured',
      } satisfies SttPreflightResult;
    }
    return probeCartesiaSttUpgrade({
      apiKey: config.CARTESIA_API_KEY,
      version: config.CARTESIA_VERSION,
      sttModel: config.CARTESIA_STT_MODEL,
    });
  });
};
