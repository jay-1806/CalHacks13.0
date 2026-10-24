import type { TutorInput, TutorResponse } from '@screentutor/shared';
import type { AIProvider } from '../providers/ai-provider.js';
import type { MemoryService } from '../memory/memory-service.js';
import type { ResearchIntegration } from '../integrations/research.js';
import { getRoutingPromptOverride } from '../prompts/agent-prompts.js';
import { MathTutorAgent } from './math-tutor.js';
import { MisconceptionDetectorAgent } from './misconception-detector.js';
import { QuizGeneratorAgent } from './quiz-generator.js';
import { ResourceFinderAgent } from './resource-finder.js';
import { LearningPlanAgent } from './learning-plan.js';
import { FetchAgentProvider, LocalAgentProvider, FetchAgentverseProvider } from './fetch-provider.js';
import { config } from '../config.js';

export interface AgentRouteDecision {
  selectedAgent: string;
  reason: string;
  provider?: string;
}

export interface AgentOutput {
  agentType: string;
  response: TutorResponse;
}

export interface SpecialistAgent {
  name: string;
  execute(input: TutorInput, onDelta?: (text: string) => void, traceId?: string): Promise<TutorResponse>;
}

export class AgentRouter {
  private mathTutor: MathTutorAgent;
  private misconceptionDetector: MisconceptionDetectorAgent;
  private quizGenerator: QuizGeneratorAgent;
  private resourceFinder: ResourceFinderAgent;
  private learningPlan: LearningPlanAgent;
  private agentProvider: FetchAgentProvider;

  constructor(
    private aiProvider: AIProvider,
    private memory: MemoryService,
    private research: ResearchIntegration,
    private observability?: any
  ) {
    this.mathTutor = new MathTutorAgent(this.aiProvider);
    this.misconceptionDetector = new MisconceptionDetectorAgent(this.aiProvider, this.memory);
    this.quizGenerator = new QuizGeneratorAgent(this.aiProvider);
    this.resourceFinder = new ResourceFinderAgent(this.research);
    this.learningPlan = new LearningPlanAgent(this.memory);

    const agents: Record<string, SpecialistAgent> = {
      MathTutorAgent: this.mathTutor,
      MisconceptionDetectorAgent: this.misconceptionDetector,
      QuizGeneratorAgent: this.quizGenerator,
      ResourceFinderAgent: this.resourceFinder,
      LearningPlanAgent: this.learningPlan,
    };

    if (config.FETCH_AGENTVERSE_ENABLED && config.FETCH_AGENT_URL) {
      this.agentProvider = new FetchAgentverseProvider(
        { baseUrl: config.FETCH_AGENT_URL, timeoutMs: config.FETCH_AGENT_TIMEOUT_MS },
        agents
      );
    } else {
      this.agentProvider = new LocalAgentProvider(agents);
    }
  }

  private classifyQuery(question: string, mode: string): 'math' | 'code' | 'research' | 'general' {
    const q = question.toLowerCase();
    if (q.includes('research') || q.includes('wikipedia') || q.includes('search') || q.includes('find') || mode === 'research') {
      return 'research';
    }
    if (q.includes('code') || q.includes('function') || q.includes('program') || q.includes('bug') || q.includes('javascript') || q.includes('typescript') || q.includes('python')) {
      return 'code';
    }
    if (q.includes('solve') || q.includes('equation') || q.includes('math') || q.includes('integral') || q.includes('derivative') || q.includes('algebra') || q.includes('solution') || q.includes('problem') || q.includes('triangle') || q.includes('geometry') || q.includes('calculate')) {
      return 'math';
    }
    return 'general';
  }

  async route(input: TutorInput, traceId?: string): Promise<AgentRouteDecision> {
    const decision = await this.agentProvider.route(input, traceId);
    
    // Log routing decision to Arize
    if (this.observability && traceId) {
      const category = this.classifyQuery(input.question, input.mode);
      this.observability.recordEvent(traceId, 'AgentRoutingDecision', {
        category,
        selectedAgent: decision.selectedAgent,
        reason: decision.reason
      });
    }
    
    return decision;
  }

  async callAgent(agentType: string, input: TutorInput, onDelta?: (text: string) => void, traceId?: string): Promise<AgentOutput> {
    const category = this.classifyQuery(input.question, input.mode);
    const startDispatch = Date.now();

    if (category === 'research') {
      const concept = input.learnerMemory?.weakConcepts?.[0]?.concept || 'algebra';
      const explanationStyle = input.learnerPreferences?.explanationStyle || 'intermediate';
      const screenSummary = input.question;

      const researchPromise = this.research.researchConcept(concept, explanationStyle, screenSummary);
      const claudePromise = this.aiProvider.analyzeScreenAndQuestion(
        input,
        onDelta,
        getRoutingPromptOverride('general', input.mode)
      );

      const [researchResult, claudeResponse] = await Promise.all([
        researchPromise,
        claudePromise
      ]);

      const latency = Date.now() - startDispatch;
      if (this.observability && traceId) {
        this.observability.recordEvent(traceId, 'AgentDispatchLatency', {
          category,
          decision: agentType,
          latencyMs: latency
        });
      }

      const conceptClean = concept.replace(/_/g, ' ');
      const connectionSentence = `This web explanation is saying the same thing as the ${conceptClean} step here.`;
      const mergedResponse: TutorResponse = {
        ...claudeResponse,
        researchResult,
        summary: `${claudeResponse.summary} (Web Research: ${researchResult.summary})`,
        spokenText: `${claudeResponse.spokenText} ${connectionSentence}. ${researchResult.summary}`,
        spokenExplanation: `${claudeResponse.spokenExplanation || claudeResponse.spokenText} ${connectionSentence}. ${researchResult.summary}`,
        concept: claudeResponse.concept || concept,
        confidence: Math.max(claudeResponse.confidence, 0.9)
      };

      return {
        agentType,
        response: mergedResponse
      };
    }

    if (category === 'math' || category === 'code') {
      const systemPromptOverride = getRoutingPromptOverride(category, input.mode);

      const response = await this.aiProvider.analyzeScreenAndQuestion(input, onDelta, systemPromptOverride);
      const latency = Date.now() - startDispatch;
      if (this.observability && traceId) {
        this.observability.recordEvent(traceId, 'AgentDispatchLatency', {
          category,
          decision: agentType,
          latencyMs: latency
        });
      }

      return {
        agentType,
        response
      };
    }

    // Default agent execution
    const res = await this.agentProvider.execute(agentType, input, onDelta, traceId);
    const latency = Date.now() - startDispatch;
    if (this.observability && traceId) {
      this.observability.recordEvent(traceId, 'AgentDispatchLatency', {
        category,
        decision: agentType,
        latencyMs: latency
      });
    }
    return res;
  }

  async combineOutputs(outputs: AgentOutput[]): Promise<TutorResponse> {
    if (outputs.length === 0) {
      throw new Error('No agent outputs to combine.');
    }
    
    const primary = { ...outputs[0].response };
    
    // Merge additional agent outputs if there are any
    for (let i = 1; i < outputs.length; i++) {
      const out = outputs[i];
      if (out.response.hints) {
        primary.hints = [...(primary.hints || []), ...out.response.hints];
      }
      if (out.response.quiz) {
        primary.quiz = [...(primary.quiz || []), ...out.response.quiz];
      }
      if (out.response.drawings) {
        primary.drawings = [...(primary.drawings || []), ...out.response.drawings];
      }
    }
    
    return primary;
  }

  logRoutingDecision(input: TutorInput, selectedAgent: string, reason: string): void {
    console.log(`[Agent Router Routing Decision] Routing query: "${input.question}" to ${selectedAgent}. Reason: ${reason}`);
  }
}
