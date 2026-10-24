import type { TutorInput, TutorResponse } from '@screentutor/shared';
import type { SpecialistAgent } from './agent-router.js';
import type { MemoryService } from '../memory/memory-service.js';

export class LearningPlanAgent implements SpecialistAgent {
  name = 'LearningPlanAgent';

  constructor(private memory: MemoryService) {}

  async execute(input: TutorInput, onDelta?: (text: string) => void, traceId?: string): Promise<TutorResponse> {
    const weakConcepts = await this.memory.getWeakConcepts(input.userId);

    let summary = '';
    let spokenText = '';
    const hints: string[] = [];

    if (weakConcepts.length === 0) {
      summary = 'No weak concepts identified yet! You are doing great.';
      spokenText = 'You have no weak concepts logged in your profile yet. Keep studying!';
      hints.push('Keep up the good work! Try tackling more advanced problems.');
    } else {
      summary = `Based on your history, here is your customized learning plan. You have struggled with: ${weakConcepts.map(c => c.concept.replace(/_/g, ' ')).join(', ')}.`;
      spokenText = `I recommend reviewing the following concepts: ${weakConcepts.map(c => c.concept.replace(/_/g, ' ')).join(', ')}. Let's practice them together!`;
      
      hints.push('Focus on reviewing these weak concepts:');
      weakConcepts.forEach((wc, index) => {
        hints.push(`${index + 1}. Review ${wc.concept.replace(/_/g, ' ')} (Confidence: ${(wc.confidence * 100).toFixed(0)}%)`);
      });
      hints.push('Practice at least 3 problems for each concept before moving on.');
    }

    if (onDelta) {
      onDelta(spokenText);
    }

    return {
      summary,
      spokenText,
      drawings: [],
      concept: weakConcepts[0]?.concept || 'general',
      confidence: 0.9,
      hints
    };
  }
}
