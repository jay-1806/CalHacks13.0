import type { FastifyPluginAsync } from 'fastify';
import { LearnerProfile, RedactionService } from '@screentutor/shared';

export const memoryRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/api/memory/:userId', async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const memory = await fastify.getMemory();
    const profile = await memory.getLearnerProfile(userId);
    return profile;
  });

  fastify.patch('/api/memory/:userId', async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const patch = request.body as Partial<LearnerProfile>;
    const memory = await fastify.getMemory();
    await memory.updateLearnerProfile(userId, patch);
    const profile = await memory.getLearnerProfile(userId);
    return profile;
  });

  fastify.delete('/api/memory/:userId', async (request, reply) => {
    const { userId } = request.params as { userId: string };
    const memory = await fastify.getMemory();
    await memory.clearUserMemory(userId);
    return { success: true };
  });
};
