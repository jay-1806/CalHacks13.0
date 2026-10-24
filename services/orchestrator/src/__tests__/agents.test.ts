import { describe, it, expect, beforeEach } from 'vitest';
import { AgentRouter } from '../agents/agent-router.js';
import { InMemoryService } from '../memory/in-memory.js';
import { MockResearchService } from '../integrations/research.js';
import { FetchAgentverseProvider } from '../agents/fetch-provider.js';
import { FakeTutorProvider } from './fake-provider.js';
import type { TutorInput } from '@screentutor/shared';

const ask = (question: string, mode: TutorInput['mode'] = 'explain'): TutorInput => ({
  userId: 'u1',
  sessionId: 's1',
  mode,
  question,
});

describe('AgentRouter Routing Rules', () => {
  let router: AgentRouter;

  beforeEach(() => {
    const ai = new FakeTutorProvider();
    router = new AgentRouter(ai, new InMemoryService(), new MockResearchService());
  });

  it('routes misconception keywords to MisconceptionDetectorAgent', async () => {
    const decision = await router.route(ask('What mistake did I make here?'));
    expect(decision.selectedAgent).toBe('MisconceptionDetectorAgent');
    expect(decision.reason).toContain('misconception');
  });

  it('routes quiz keywords or mode to QuizGeneratorAgent', async () => {
    expect((await router.route(ask('Quiz me on derivatives', 'quiz'))).selectedAgent).toBe('QuizGeneratorAgent');
  });

  it('routes research keywords or mode to ResourceFinderAgent', async () => {
    expect((await router.route(ask('Find simpler explanation of limits', 'research'))).selectedAgent).toBe('ResourceFinderAgent');
  });

  it('routes review keywords or mode to LearningPlanAgent', async () => {
    expect((await router.route(ask('What should I study next?', 'review'))).selectedAgent).toBe('LearningPlanAgent');
  });

  it('defaults to MathTutorAgent', async () => {
    expect((await router.route(ask('Calculate the integral of 2x'))).selectedAgent).toBe('MathTutorAgent');
  });
});

describe('FetchAgentverseProvider without an agent URL', () => {
  it('reports unconfigured and still routes locally', async () => {
    const provider = new FetchAgentverseProvider({ baseUrl: '', timeoutMs: 100 }, {}, (async () => {
      throw new Error('no agent');
    }) as unknown as typeof fetch);
    expect(provider.isConfigured()).toBe(false);

    const routing = await provider.route(ask('Explain'));
    expect(routing.selectedAgent).toBe('MathTutorAgent');
    expect(routing.provider).toContain('fallback');
  });
});
