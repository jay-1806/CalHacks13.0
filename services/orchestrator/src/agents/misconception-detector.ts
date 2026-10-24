import type { TutorInput, TutorResponse } from '@screentutor/shared';
import type { SpecialistAgent } from './agent-router.js';
import type { AIProvider } from '../providers/ai-provider.js';
import type { MemoryService } from '../memory/memory-service.js';
import { getAgentPromptOverride } from '../prompts/agent-prompts.js';

export class MisconceptionDetectorAgent implements SpecialistAgent {
  name = 'MisconceptionDetectorAgent';

  constructor(
    private aiProvider: AIProvider,
    private memory: MemoryService
  ) {}

  async execute(input: TutorInput, onDelta?: (text: string) => void, traceId?: string): Promise<TutorResponse> {
    const response = await this.aiProvider.analyzeScreenAndQuestion(
      input,
      onDelta,
      getAgentPromptOverride('MisconceptionDetectorAgent', input.mode)
    );
    
    // Add local misconception checks if text matches
    const text = input.question.toLowerCase();
    if (!response.hints) response.hints = [];

    if (text.includes('distribute means add')) {
      response.hints.push('Correction: Distributing means multiplying the outside term by each inside term.');
      response.summary = `${response.summary} (Correction: Distributing means multiplying the outside term by each inside term.)`;
    }
    
    if (text.includes('x^2 + y^2 = (x+y)^2')) {
      response.hints.push('Careful: (x+y)² is x² + 2xy + y², not just x² + y².');
      response.summary = `${response.summary} (Careful: (x+y)² is x² + 2xy + y², not just x² + y².)`;
    }

    if (text.includes('divide by zero')) {
      response.hints.push('Remember: Division by zero is undefined.');
      response.summary = `${response.summary} (Remember: Division by zero is undefined.)`;
    }

    // Save weak concept to memory
    const concept = response.concept || 'algebra_rules';
    await this.memory.rememberWeakConcept(
      input.userId,
      concept,
      `Misconception query: "${input.question}"`,
      0.5
    );

    return response;
  }
}
