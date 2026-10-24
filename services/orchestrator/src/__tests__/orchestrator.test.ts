import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TutorOrchestrator } from '../orchestrator/tutor-orchestrator.js';
import { InMemoryService } from '../memory/in-memory.js';
import { AgentRouter } from '../agents/agent-router.js';
import { MockResearchService } from '../integrations/research.js';
import { MockCoDriveService } from '../integrations/codrive.js';
import { NoopObservabilityService } from '../observability/observability-service.js';
import { FakeTutorProvider } from './fake-provider.js';
import type { TutorInput } from '@screentutor/shared';

describe('TutorOrchestrator Integration Tests', () => {
  let orchestrator: TutorOrchestrator;
  let memory: InMemoryService;
  let research: MockResearchService;
  let ai: FakeTutorProvider;

  const ask = (overrides: Partial<TutorInput>): Promise<ReturnType<TutorOrchestrator['handleQuestion']> extends Promise<infer R> ? R : never> =>
    orchestrator.handleQuestion({ userId: 'u1', sessionId: 's1', mode: 'explain', question: 'Explain this step.', ...overrides });

  beforeEach(() => {
    memory = new InMemoryService();
    research = new MockResearchService();
    ai = new FakeTutorProvider('sqrt_distribution_error');
    orchestrator = new TutorOrchestrator(
      ai,
      memory,
      new AgentRouter(ai, memory, research),
      research,
      new MockCoDriveService(),
      new NoopObservabilityService()
    );
  });

  // ── 1. TUTOR MODES ────────────────────────────────────────────────────────
  describe('Tutor Modes', () => {
    it('returns the requested mode with the model answer and evaluations', async () => {
      const response = await ask({ mode: 'explain' });
      expect(response.mode).toBe('explain');
      expect(response.spokenText).toContain('Multiply the outside factor');
      expect(response.observability?.evaluations.point_tag_valid.passed).toBe(true);
    });

    it('hint mode does not reveal the answer phrase', async () => {
      const response = await ask({ mode: 'hint', question: 'Give me a hint.' });
      expect(response.mode).toBe('hint');
      expect(response.observability?.evaluations.hint_did_not_reveal_full_answer.passed).toBe(true);
    });

    it('quiz keeps the answer out of the spoken text', async () => {
      const response = await ask({ mode: 'quiz', question: 'Quiz me.' });
      expect(response.quiz?.[0].answer).toBe('3x + 15');
      expect(response.spokenText).not.toContain('3x + 15');
    });

    it('review builds the plan from weak concepts in memory', async () => {
      await memory.rememberWeakConcept('u1', 'calculus_chain_rule', 'trouble finding inner function');
      const response = await ask({ mode: 'review', question: 'Let us do a review.' });
      expect(response.mode).toBe('review');
      expect(response.spokenText).toContain('calculus chain rule');
    });

    it('calls web research only in Research mode', async () => {
      const spy = vi.spyOn(research, 'researchConcept');
      await ask({ mode: 'explain', question: 'Explain this' });
      expect(spy).not.toHaveBeenCalled();
      await ask({ mode: 'research', question: 'Research this topic' });
      expect(spy).toHaveBeenCalled();
    });

    it('Co-drive returns proposed actions requiring approval', async () => {
      const response = await ask({ mode: 'codrive', question: 'What action should I take next?' });
      expect(response.proposedActions?.[0].requiresApproval).toBe(true);
    });
  });

  // ── 2. MEMORY ─────────────────────────────────────────────────────────────
  describe('Memory Operations', () => {
    it('stores the question, weak concept and session turn, and clears them', async () => {
      await ask({ mode: 'mistake', question: 'What mistake did I make?', devOverrideRedaction: true });
      await orchestrator.flushMemoryWrites();

      const profile = await memory.getLearnerProfile('u1');
      expect(profile.recentQuestions[0].question).toBe('What mistake did I make?');
      expect(profile.weakConcepts[0].concept).toBe('sqrt_distribution_error');
      expect(await memory.getRecentTurns('s1')).toHaveLength(1);

      await memory.clearUserMemory('u1');
      const cleared = await memory.getLearnerProfile('u1');
      expect(cleared.recentQuestions).toHaveLength(0);
      expect(cleared.weakConcepts).toHaveLength(0);
      expect(await memory.getRecentTurns('s1')).toHaveLength(0);
    });

    it('stores only a hash of the screenshot, never the image', async () => {
      await ask({ screenshotBase64: 'data:image/png;base64,iVBORw0KGgoAAAANS...', devOverrideRedaction: true });
      await orchestrator.flushMemoryWrites();

      const [turn] = await memory.getRecentTurns('s1');
      expect((turn as any).screenshotBase64).toBeUndefined();
      expect(turn.screenshotHash).toHaveLength(32);
    });
  });

  // ── 3. PRIVACY ────────────────────────────────────────────────────────────
  describe('Privacy Controls', () => {
    it('privacy mode blocks the model, Co-drive and memory writes', async () => {
      const response = await ask({
        mode: 'codrive',
        question: 'What is next?',
        privacyMode: true,
        screenshotBase64: 'data:image/png;base64,iVBORw0KGgoAAAANS...',
      });
      await orchestrator.flushMemoryWrites();

      expect(response.concept).toBe('privacy_block');
      expect(response.spokenText).toContain('blocked for privacy');
      expect(response.proposedActions).toBeUndefined();
      expect(ai.calls).toHaveLength(0);
      expect(await memory.getRecentTurns('s1')).toHaveLength(0);
    });

    it('a denylisted window title triggers the privacy block', async () => {
      const response = await ask({ appMetadata: { windowTitle: 'Chase Online Banking - Chrome' } });
      expect(response.concept).toBe('privacy_block');
      expect(ai.calls).toHaveLength(0);
    });

    it('memory turned off blocks writes', async () => {
      await memory.updateLearnerProfile('u1', { memoryEnabled: false });
      await ask({});
      await orchestrator.flushMemoryWrites();

      expect((await memory.getLearnerProfile('u1')).recentQuestions).toHaveLength(0);
      expect(await memory.getRecentTurns('s1')).toHaveLength(0);
    });
  });
});
