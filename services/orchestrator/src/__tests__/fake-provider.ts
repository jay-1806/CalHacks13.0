import type { TutorInput, TutorResponse } from '@screentutor/shared';
import type { AIProvider } from '../providers/ai-provider.js';

/**
 * Deterministic stand-in for Claude in tests. Answers depend only on the mode,
 * and every call is recorded so tests can inspect what the model was sent.
 */
export class FakeTutorProvider implements AIProvider {
  readonly name = 'fake';
  calls: TutorInput[] = [];

  constructor(private concept = 'distributive_property') {}

  async analyzeScreenAndQuestion(input: TutorInput): Promise<TutorResponse> {
    this.calls.push(structuredClone(input));
    const base = {
      mode: input.mode,
      concept: this.concept,
      confidence: 0.9,
      provider: 'fake',
      drawings: [],
      timestamp: new Date().toISOString(),
    };
    switch (input.mode) {
      case 'hint':
        return { ...base, summary: 'Hint', spokenText: 'Look at what multiplies the parentheses.' };
      case 'quiz':
        return {
          ...base,
          summary: 'Quiz',
          spokenText: 'Try this one.',
          quiz: [{ id: 'q1', difficulty: 'easy', question: 'Expand 3(x + 5)', answer: '3x + 15' }],
        };
      default:
        return { ...base, summary: 'Explained the step.', spokenText: 'Multiply the outside factor by each term.' };
    }
  }
}
