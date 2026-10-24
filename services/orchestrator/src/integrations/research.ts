import type { ResearchResult } from '@screentutor/shared';

/** Web research for Research mode. The live implementation is ApifyResearchService. */
export interface ResearchIntegration {
  isConfigured(): boolean;
  researchConcept(concept: string, learnerLevel: string, currentScreenSummary: string): Promise<ResearchResult>;
  fetchPageSummary(url: string): Promise<string>;
  findSimplerExplanation(concept: string): Promise<string>;
  generatePracticeFromWebResource(concept: string): Promise<string>;
}

export class MockResearchService implements ResearchIntegration {
  isConfigured(): boolean {
    return false;
  }

  async researchConcept(concept: string, learnerLevel: string, currentScreenSummary: string): Promise<ResearchResult> {
    return {
      title: `Web Research: ${concept.replace(/_/g, ' ')}`,
      summary: `Detailed web findings for ${concept.replace(/_/g, ' ')} at a ${learnerLevel} level. Web sources confirm this describes the relationship between rate of change and composite function components.`,
      keyTakeaways: [
        `Takeaway 1: Focus on the inner and outer components when analyzing ${concept.replace(/_/g, ' ')}.`,
        `Takeaway 2: This aligns with the visual representation identified as "${currentScreenSummary}".`,
        'Takeaway 3: Practice with simple examples before moving to compound applications.',
      ],
      suggestedPractice: `Expand or solve: Find the derivative of f(x) = (3x + 2)^5 using the ${concept.replace(/_/g, ' ')}.`,
      confidence: 0.9,
      sourceUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(concept)}`,
      providerMetadata: { source: 'mock_research', latencyMs: 120 },
    };
  }

  async fetchPageSummary(url: string): Promise<string> {
    return `Simulated page summary for ${url}. The resource covers foundational guides, interactive widgets, and worksheets for practice.`;
  }

  async findSimplerExplanation(concept: string): Promise<string> {
    return `Think of ${concept.replace(/_/g, ' ')} like a machine with a box inside it. First you figure out what the outer machine does, and then you multiply it by what the inner box does.`;
  }

  async generatePracticeFromWebResource(concept: string): Promise<string> {
    return `Interactive Web Quiz: Solve the derivative of y = sin(x^2) using ${concept.replace(/_/g, ' ')}.`;
  }
}
