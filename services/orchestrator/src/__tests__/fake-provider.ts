import type { TutorInput, TutorResponse } from '@screentutor/shared';
import type { AIProvider } from '../providers/ai-provider.js';

/**
 * Deterministic stand-in for Claude in tests. Every call is recorded so tests can
 * inspect what the model was sent (question, learner memory, history, prompt).
 */
export class FakeTutorProvider implements AIProvider {
  readonly name = 'fake';
  calls: TutorInput[] = [];
  prompts: Array<string | undefined> = [];

  constructor(private concept = 'distributive_property') {}

  async analyzeScreenAndQuestion(
    input: TutorInput,
    _onStep?: (step: import('@screentutor/shared').TutorStreamStep) => void,
    systemPromptOverride?: string
  ): Promise<TutorResponse> {
    this.calls.push(structuredClone(input));
    this.prompts.push(systemPromptOverride);
    return {
      mode: input.mode,
      concept: this.concept,
      confidence: 0.9,
      provider: 'fake',
      drawings: [],
      summary: 'Explained the step.',
      spokenText: 'Multiply the outside factor by each term.\nSo 3(x + 5) is 3x + 15.',
      overlayText:
        '[DRAW:clear] Multiply each term [POINT:0.3,0.4:factor] [DRAW:circle:0.3,0.4,0.03]\n' +
        '[DRAW:clear] Result [POINT:0.7,0.3:result] [DRAW:work:0.7,0.3:3(x + 5) = 3x + 15]',
      timestamp: new Date().toISOString(),
    };
  }
}
