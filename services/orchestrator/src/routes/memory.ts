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

  fastify.post('/api/memory/:userId/quiz', async (request, reply) => {
    try {
      const { userId } = request.params as { userId: string };
      const { concept, correct } = request.body as { concept: string; correct: boolean };
      const memory = await fastify.getMemory();
      const profile = await memory.getLearnerProfile(userId);

      if (!profile.strongConcepts) profile.strongConcepts = [];
      if (!profile.weakConcepts) profile.weakConcepts = [];
      if (!profile.quizOutcomes) profile.quizOutcomes = [];

      // Log quiz outcome
      profile.quizOutcomes.push({
        concept,
        correct,
        timestamp: new Date().toISOString()
      });

      if (correct) {
        const existing = profile.weakConcepts.find((c: any) => c.concept === concept);
        if (existing) {
          existing.confidence = Math.max(0, existing.confidence - 0.2);
          existing.lastSeenAt = new Date().toISOString();
          if (existing.confidence <= 0) {
            profile.weakConcepts = profile.weakConcepts.filter((c: any) => c.concept !== concept);
            if (!profile.strongConcepts.includes(concept)) {
              profile.strongConcepts.push(concept);
            }
          }
        } else {
          if (!profile.strongConcepts.includes(concept)) {
            profile.strongConcepts.push(concept);
          }
        }
      } else {
        profile.strongConcepts = profile.strongConcepts.filter((c: string) => c !== concept);
        const existing = profile.weakConcepts.find((c: any) => c.concept === concept);
        const now = new Date().toISOString();
        if (existing) {
          existing.confidence = Math.min(1.0, existing.confidence + 0.2);
          existing.lastSeenAt = now;
          existing.timesSeen += 1;
        } else {
          profile.weakConcepts.push({
            concept,
            evidence: 'Incorrect quiz answer',
            confidence: 0.5,
            timesSeen: 1,
            firstSeenAt: now,
            lastSeenAt: now,
          });
        }
      }

      await memory.updateLearnerProfile(userId, profile);
      return { success: true, profile };
    } catch (err: any) {
      fastify.log.error(err);
      const safeError = RedactionService.redactError(err);
      return reply.status(500).send({ error: safeError.message || 'Internal server error' });
    }
  });
};
