import type { TutorInput, TutorResponse } from '@screentutor/shared';
import type { SpecialistAgent } from './agent-router.js';
import type { AIProvider } from '../providers/ai-provider.js';
import { getAgentPromptOverride } from '../prompts/agent-prompts.js';

export class MathTutorAgent implements SpecialistAgent {
  name = 'MathTutorAgent';

  constructor(private aiProvider: AIProvider) {}

  async execute(input: TutorInput, onDelta?: (text: string) => void, traceId?: string): Promise<TutorResponse> {
    const response = await this.aiProvider.analyzeScreenAndQuestion(
      input,
      onDelta,
      getAgentPromptOverride('MathTutorAgent', input.mode)
    );
    
    // Add math-specific default hints if missing
    if (!response.hints) response.hints = [];
    if (input.question.toLowerCase().includes('step by step') || input.learnerPreferences?.explanationStyle === 'step_by_step') {
      response.summary = `Let's break this down step by step: ${response.summary}`;
      response.hints.push('Remember to check your signs when moving terms across the equals sign.');
    }
    
    return response;
  }
}
