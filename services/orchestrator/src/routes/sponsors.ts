import type { FastifyPluginAsync } from 'fastify';
import { SponsorRegistry } from '../sponsors/SponsorRegistry.js';
import { RedactionService } from '@screentutor/shared';

export const sponsorRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/sponsors/status', async (request, reply) => {
    try {
      const memory = await fastify.getMemory();
      const observability = await fastify.getObservability();
      // elasticVerified/sentryVerified stay false until a deliberate diagnostic
      // round-trip confirms delivery — credentials alone are "configured".
      const registry = new SponsorRegistry(memory, observability, {
        elasticVerified: false,
        sentryVerified: false,
      });
      const statuses = await registry.getStatus();
      return RedactionService.redactMetadata(statuses);
    } catch (err: any) {
      fastify.log.error(err);
      const safeError = RedactionService.redactError(err);
      return reply.status(500).send({ error: safeError.message || 'Internal Server Error' });
    }
  });
};
