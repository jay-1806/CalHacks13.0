import { describe, it, expect, beforeEach } from 'vitest';
import { TutorOrchestrator } from '../orchestrator/tutor-orchestrator.js';
import { InMemoryService } from '../memory/in-memory.js';
import { AgentRouter } from '../agents/agent-router.js';
import { MockResearchService } from '../integrations/research.js';
import { MockCoDriveService } from '../integrations/codrive.js';
import { NoopObservabilityService } from '../observability/observability-service.js';
import type { AIProvider } from '../providers/ai-provider.js';
import type { TutorInput, TutorResponse } from '@screentutor/shared';

describe('TutorOrchestrator session history', () => {
  let memory: InMemoryService;
  let capturedInputs: TutorInput[] = [];
  let orchestrator: TutorOrchestrator;

  const mockResponse: TutorResponse = {
    summary: 'Explained the step.',
    spokenText: 'Here is how to continue from before.',
    concept: 'algebra',
    confidence: 0.9,
    provider: 'mock',
    timestamp: new Date().toISOString(),
  };

  const aiProvider: AIProvider = {
    name: 'mock',
    async analyzeScreenAndQuestion(input) {
      capturedInputs.push(structuredClone(input));
      return { ...mockResponse, mode: input.mode };
    },
  };

  beforeEach(() => {
    memory = new InMemoryService();
    capturedInputs = [];
    orchestrator = new TutorOrchestrator(
      aiProvider,
      memory,
      new AgentRouter(aiProvider, memory, new MockResearchService()),
      new MockResearchService(),
      new MockCoDriveService(),
      new NoopObservabilityService()
    );
  });

  it('loads prior session turns from Redis memory and passes them to the model', async () => {
    await orchestrator.handleQuestion({
      userId: 'u1',
      sessionId: 's1',
      mode: 'explain',
      question: 'What is the distributive property?',
      devOverrideRedaction: true,
    });

    await orchestrator.handleQuestion({
      userId: 'u1',
      sessionId: 's1',
      mode: 'hint',
      question: 'Can you remind me what we did before?',
      devOverrideRedaction: true,
    });

    expect(capturedInputs).toHaveLength(2);
    expect(capturedInputs[0].recentTurns).toBeUndefined();
    expect(capturedInputs[1].recentTurns).toHaveLength(1);
    expect(capturedInputs[1].recentTurns![0].question).toBe('What is the distributive property?');
    expect(capturedInputs[1].recentTurns![0].mode).toBe('explain');
  });
});
