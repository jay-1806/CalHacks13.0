import { describe, it, expect, beforeEach } from 'vitest';
import { TutorOrchestrator } from '../orchestrator/tutor-orchestrator.js';
import { InMemoryService } from '../memory/in-memory.js';
import { NoopObservabilityService } from '../observability/observability-service.js';
import { MATH_LESSON_PROMPT } from '../prompts/tutor-system-prompt.js';
import { FakeTutorProvider } from './fake-provider.js';
import { TutorInput } from '@screentutor/shared';

describe('TutorOrchestrator', () => {
  let orchestrator: TutorOrchestrator;
  let memory: InMemoryService;
  let ai: FakeTutorProvider;

  const ask = (overrides: Partial<TutorInput> = {}) =>
    orchestrator.handleQuestion(
      TutorInput.parse({ userId: 'u1', sessionId: 's1', question: 'How do I solve this?', ...overrides })
    );

  beforeEach(() => {
    memory = new InMemoryService();
    ai = new FakeTutorProvider('pythagorean_theorem');
    orchestrator = new TutorOrchestrator(ai, memory, new NoopObservabilityService());
  });

  // ── 1. MATH EXPLANATION ───────────────────────────────────────────────────
  describe('Math explanation', () => {
    it('defaults to the explain mode and sends the math lesson prompt', async () => {
      const response = await ask();
      expect(response.mode).toBe('explain');
      expect(ai.calls[0].mode).toBe('explain');
      expect(ai.prompts[0]).toBe(MATH_LESSON_PROMPT);
      expect(response.spokenText).toContain('Multiply the outside factor');
    });

    it('records quality checks for drawings and step alignment', async () => {
      const evals = (await ask()).observability!.evaluations;
      expect(evals.point_tag_valid.passed).toBe(true);
      expect(evals.has_drawings.passed).toBe(true);
      expect(evals.steps_aligned.passed).toBe(true);
    });

    it('passes weak concepts from memory to Claude', async () => {
      await memory.rememberWeakConcept('u1', 'factoring_quadratics', 'struggled before');
      await ask();
      expect(ai.calls[0].learnerMemory.weakConcepts[0].concept).toBe('factoring_quadratics');
    });

    it('rejects modes other than explain', () => {
      expect(() => TutorInput.parse({ userId: 'u', sessionId: 's', question: 'q', mode: 'quiz' })).toThrow();
    });
  });

  // ── 2. MEMORY ─────────────────────────────────────────────────────────────
  describe('Memory', () => {
    it('stores the question, concept and session turn, and clears them', async () => {
      await ask({ question: 'Find x in this triangle', devOverrideRedaction: true });
      await orchestrator.flushMemoryWrites();

      const profile = await memory.getLearnerProfile('u1');
      expect(profile.recentQuestions[0].question).toBe('Find x in this triangle');
      expect(profile.weakConcepts[0].concept).toBe('pythagorean_theorem');
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
  describe('Privacy', () => {
    it('privacy mode blocks the model and memory writes', async () => {
      const response = await ask({ privacyMode: true, screenshotBase64: 'data:image/png;base64,iVBORw0KGgoAAAANS...' });
      await orchestrator.flushMemoryWrites();

      expect(response.concept).toBe('privacy_block');
      expect(response.spokenText).toContain('blocked for privacy');
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
      await ask();
      await orchestrator.flushMemoryWrites();

      expect((await memory.getLearnerProfile('u1')).recentQuestions).toHaveLength(0);
      expect(await memory.getRecentTurns('s1')).toHaveLength(0);
    });
  });
});
