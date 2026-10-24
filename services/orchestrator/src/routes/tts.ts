import type { FastifyPluginAsync } from 'fastify';
import { RedactionService } from '@screentutor/shared';
import { config } from '../config.js';

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
};
