import type { FastifyPluginAsync } from 'fastify';
import { TutorInput, RedactionService } from '@screentutor/shared';

export const tutorRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/api/tutor/ask', async (request, reply) => {
    try {
      const input = TutorInput.parse(request.body);
      const orchestrator = await fastify.getOrchestrator();

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });

      const response = await orchestrator.handleQuestion(input, (delta: string) => {
        reply.raw.write(`data: ${JSON.stringify({ type: 'delta', text: delta })}\n\n`);
      });

      reply.raw.write(`data: ${JSON.stringify({ type: 'done', fullText: JSON.stringify(response) })}\n\n`);
      reply.raw.end();
    } catch (err: any) {
      fastify.log.error(err);
      const safeError = RedactionService.redactError(err);
      if (reply.raw.headersSent) {
        reply.raw.end();
      } else {
        reply.status(400).send({ error: safeError.message || 'Invalid Request' });
      }
    }
  });
};
