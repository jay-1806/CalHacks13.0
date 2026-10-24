import { describe, it, expect } from 'vitest';
import { TutorOrchestrator } from '../orchestrator/tutor-orchestrator.js';
import { InMemoryService } from '../memory/in-memory.js';
import { AgentRouter } from '../agents/agent-router.js';
import { MockResearchService } from '../integrations/research.js';
import { MockCoDriveService } from '../integrations/codrive.js';
import { NoopObservabilityService } from '../observability/observability-service.js';
import type { AIProvider } from '../providers/ai-provider.js';
import type { SessionTurn, TutorInput } from '@screentutor/shared';

const aiProvider: AIProvider = {
  name: 'mock',
  async analyzeScreenAndQuestion(input) {
    return {
      mode: input.mode,
      summary: 'Explained.',
      spokenText: 'Here is the step.',
      concept: 'algebra',
      confidence: 0.9,
      provider: 'mock',
      timestamp: new Date().toISOString(),
    };
  },
};

const question = (q: string): TutorInput => ({
  userId: 'u1',
  sessionId: 's1',
  mode: 'explain',
  question: q,
  devOverrideRedaction: true,
});

/** Memory whose session-turn writes block until released. */
class GatedMemory extends InMemoryService {
  release!: () => void;
  gate = new Promise<void>((resolve) => {
    this.release = resolve;
  });
  readsInFlight = 0;
  maxConcurrentReads = 0;

  override async appendSessionTurn(sessionId: string, turn: SessionTurn): Promise<void> {
    await this.gate;
    return super.appendSessionTurn(sessionId, turn);
  }

  private async trackRead<T>(read: () => Promise<T>): Promise<T> {
    this.readsInFlight++;
    this.maxConcurrentReads = Math.max(this.maxConcurrentReads, this.readsInFlight);
    await new Promise((r) => setTimeout(r, 5));
    try {
      return await read();
    } finally {
      this.readsInFlight--;
    }
  }

  override getLearnerProfile(userId: string) {
    return this.trackRead(() => super.getLearnerProfile(userId));
  }

  override getRecentTurns(sessionId: string, limit?: number) {
    return this.trackRead(() => super.getRecentTurns(sessionId, limit));
  }
}

function build(memory: InMemoryService) {
  return new TutorOrchestrator(
    aiProvider,
    memory,
    new AgentRouter(aiProvider, memory, new MockResearchService()),
    new MockResearchService(),
    new MockCoDriveService(),
    new NoopObservabilityService()
  );
}

describe('TutorOrchestrator latency', () => {
  it('returns the answer without waiting for memory writes', async () => {
    const memory = new GatedMemory();
    const orchestrator = build(memory);

    const response = await orchestrator.handleQuestion(question('Explain this step'));
    expect(response.spokenText).toBe('Here is the step.');
    expect(await memory.getRecentTurns('s1')).toHaveLength(0);

    memory.release();
    await orchestrator.flushMemoryWrites();
    expect(await memory.getRecentTurns('s1')).toHaveLength(1);
  });

  it('fetches the learner profile and session history concurrently', async () => {
    const memory = new GatedMemory();
    memory.release();
    const orchestrator = build(memory);

    await orchestrator.handleQuestion(question('Explain this step'));

    expect(memory.maxConcurrentReads).toBeGreaterThanOrEqual(2);
  });

  it('lets a quick follow-up see the previous turn even if its write was still pending', async () => {
    const memory = new GatedMemory();
    const seen: TutorInput[] = [];
    const recordingProvider: AIProvider = {
      name: 'mock',
      async analyzeScreenAndQuestion(input, onDelta, override) {
        seen.push(structuredClone(input));
        return aiProvider.analyzeScreenAndQuestion(input, onDelta, override);
      },
    };
    const orchestrator = new TutorOrchestrator(
      recordingProvider,
      memory,
      new AgentRouter(recordingProvider, memory, new MockResearchService()),
      new MockResearchService(),
      new MockCoDriveService(),
      new NoopObservabilityService()
    );

    await orchestrator.handleQuestion(question('Explain this step'));
    const followUp = orchestrator.handleQuestion(question('And the next one?'));
    memory.release();
    await followUp;

    expect(seen[1].recentTurns).toHaveLength(1);
  });
});
