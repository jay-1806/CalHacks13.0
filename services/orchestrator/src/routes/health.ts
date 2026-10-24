import type { FastifyPluginAsync } from 'fastify';

export const healthRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/health', async () => {
    const memory = await fastify.getMemory();
    const memoryHealth = await memory.healthCheck();
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      memory: memoryHealth
    };
  });
};
