import type { TutorInput, TutorResponse } from '@screentutor/shared';
import type { ResearchIntegration } from '../integrations/research.js';
import type { SpecialistAgent } from './agent-router.js';

export class ResourceFinderAgent implements SpecialistAgent {
  name = 'ResourceFinderAgent';

  constructor(private research: ResearchIntegration) {}

  async execute(input: TutorInput, onDelta?: (text: string) => void, traceId?: string): Promise<TutorResponse> {
    // Determine concept
    const concept = input.learnerMemory?.weakConcepts?.[0]?.concept || 'algebra';
    const explanationStyle = input.learnerPreferences?.explanationStyle || 'intermediate';
    const screenSummary = input.question;

    const researchResult = await this.research.researchConcept(concept, explanationStyle, screenSummary);

    const connectionSentence = `This web explanation is saying the same thing as the ${concept.replace(/_/g, ' ')} step here.`;
    const spokenText = `I researched the web for ${concept.replace(/_/g, ' ')}. ${researchResult.summary} ${connectionSentence}`;

    if (onDelta) {
      onDelta(spokenText);
    }

    return {
      summary: `${researchResult.summary} (Connected: ${connectionSentence})`,
      spokenText,
      drawings: [],
      concept,
      confidence: 0.9,
      researchResult
    };
  }
}
