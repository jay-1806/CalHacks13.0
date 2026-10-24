import type { FastifyPluginAsync } from 'fastify';
import { SponsorRegistry } from '../sponsors/SponsorRegistry.js';
import { RedactionService } from '@screentutor/shared';

export const sponsorRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/sponsors/status', async (request, reply) => {
    try {
      const memory = await fastify.getMemory();
      const registry = new SponsorRegistry(memory);
      const statuses = await registry.getStatus();
      return RedactionService.redactMetadata(statuses);
    } catch (err: any) {
      fastify.log.error(err);
      const safeError = RedactionService.redactError(err);
      return reply.status(500).send({ error: safeError.message || 'Internal Server Error' });
    }
  });
};
