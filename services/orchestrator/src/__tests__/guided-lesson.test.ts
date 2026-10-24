import { describe, it, expect, beforeEach } from 'vitest';
import { TutorInput } from '@screentutor/shared';
import { buildUserPrompt, TUTOR_SYSTEM_PROMPT } from '../prompts/tutor-system-prompt.js';
import { TUTOR_OUTPUT_SCHEMA } from '../providers/anthropic-provider.js';
import { TutorOrchestrator } from '../orchestrator/tutor-orchestrator.js';
import { InMemoryService } from '../memory/in-memory.js';
import { NoopObservabilityService } from '../observability/observability-service.js';
import { FakeTutorProvider } from './fake-provider.js';

const guide = { goal: 'How do I crop this photo?', step: 1, lastInstruction: 'Click the Crop tool' };

describe('guided lessons', () => {
  it('asks Claude whether to wait for the learner, and what they should do', () => {
    expect(TUTOR_OUTPUT_SCHEMA.properties.nextAction.enum).toEqual(['wait', 'done']);
    expect(TUTOR_OUTPUT_SCHEMA.required).toEqual(expect.arrayContaining(['nextAction', 'awaiting']));
    expect(TUTOR_SYSTEM_PROMPT).toContain('Guided lessons');
  });

  it('tells Claude what the learner was asked to do when their screen changes', () => {
    const prompt = buildUserPrompt({ question: "I've done that.", guide });
    expect(prompt).toContain('GUIDED LESSON IN PROGRESS');
    expect(prompt).toContain('Goal: "How do I crop this photo?"');
    expect(prompt).toContain('guided turn 2');
    expect(prompt).toContain('"Click the Crop tool"');
  });

  it('leaves the lesson out of ordinary questions', () => {
    expect(buildUserPrompt({ question: 'Find x.' })).not.toContain('GUIDED LESSON');
  });

  it('accepts the lesson context on a request', () => {
    const input = TutorInput.parse({ userId: 'u', sessionId: 's', question: 'Next?', guide });
    expect(input.guide).toEqual(guide);
  });

  describe('response cache', () => {
    let ai: FakeTutorProvider;
    let orchestrator: TutorOrchestrator;
    beforeEach(() => {
      ai = new FakeTutorProvider();
      orchestrator = new TutorOrchestrator(ai, new InMemoryService(), new NoopObservabilityService());
    });

    it('never answers a guided turn from the cache: it depends on what the learner just did', async () => {
      const ask = (sessionId: string) =>
        orchestrator.handleQuestion(TutorInput.parse({ userId: 'u', sessionId, question: 'Next?', guide }));
      await ask('s1');
      await orchestrator.flushMemoryWrites();
      await ask('s2'); // a fresh session, identical question and screen
      expect(ai.calls).toHaveLength(2);
    });
  });
});
