import type { TutorInput, TutorResponse, WeakConcept } from '@screentutor/shared';
import type { AgentRouteDecision, AgentOutput, SpecialistAgent } from './agent-router.js';

export interface FetchAgentProvider {
  isConfigured(): boolean;
  getProviderName(): string;
  route(input: TutorInput, traceId?: string): Promise<AgentRouteDecision>;
  execute(agentType: string, input: TutorInput, onDelta?: (text: string) => void, traceId?: string): Promise<AgentOutput>;
}

export class LocalAgentProvider implements FetchAgentProvider {
  constructor(private agents: Record<string, SpecialistAgent>) {}

  isConfigured(): boolean {
    return true;
  }

  getProviderName(): string {
    return 'Local Provider';
  }

  async route(input: TutorInput, traceId?: string): Promise<AgentRouteDecision> {
    const q = input.question.toLowerCase();
    
    // 1. Misconception Detector Rule
    if (
      q.includes('mistake') || 
      q.includes('wrong') || 
      q.includes('error') || 
      q.includes('messed up') || 
      q.includes('where did i go wrong') ||
      q.includes('where did i mess up')
    ) {
      return {
        selectedAgent: 'MisconceptionDetectorAgent',
        reason: 'Input contains misconception keywords ("mistake", "wrong", "error", "messed up").',
        provider: 'Local Provider'
      };
    }

    // 2. Quiz Generator Rule
    if (
      q.includes('quiz') || 
      q.includes('test me') || 
      q.includes('practice') || 
      input.mode === 'quiz'
    ) {
      return {
        selectedAgent: 'QuizGeneratorAgent',
        reason: 'Input or mode indicates a quiz request ("quiz", "test me", "practice").',
        provider: 'Local Provider'
      };
    }

    // 3. Resource Finder Rule
    if (
      q.includes('research') || 
      q.includes('simpler explanation') || 
      q.includes('find resource') || 
      input.mode === 'research'
    ) {
      return {
        selectedAgent: 'ResourceFinderAgent',
        reason: 'Input or mode indicates research ("research", "simpler explanation", "find resource").',
        provider: 'Local Provider'
      };
    }

    // 4. Learning Plan Rule
    if (
      q.includes('review') || 
      q.includes('what should i study') || 
      input.mode === 'review'
    ) {
      return {
        selectedAgent: 'LearningPlanAgent',
        reason: 'Input or mode indicates learning plan review ("review", "what should i study").',
        provider: 'Local Provider'
      };
    }

    // 5. Default: Math Tutor Rule
    return {
      selectedAgent: 'MathTutorAgent',
      reason: 'Input matches math topics or defaults to primary math/concept explanation.',
      provider: 'Local Provider'
    };
  }

  async execute(agentType: string, input: TutorInput, onDelta?: (text: string) => void, traceId?: string): Promise<AgentOutput> {
    const agent = this.agents[agentType];
    if (!agent) {
      throw new Error(`Specialist agent type ${agentType} not found in LocalAgentProvider.`);
    }

    const response = await agent.execute(input, onDelta, traceId);
    response.provider = 'Local Provider';

    return {
      agentType,
      response
    };
  }
}

interface FetchAgentOptions {
  /** Base URL of the uAgent's REST server (services/fetch-agent), e.g. http://localhost:8001 */
  baseUrl: string;
  timeoutMs: number;
}

interface LearningPlanReply {
  summary: string;
  spokenText: string;
  hints: string[];
  concept: string;
}

const REMOTE_AGENTS = new Set(['LearningPlanAgent']);

/**
 * Routes through the ScreenTutor study-planner uAgent (registered on Agentverse)
 * and lets it build learning plans. Agents that need the screenshot and Claude
 * stay local. Any failure or timeout falls back to the local provider, so a
 * stopped agent never breaks a tutoring turn.
 */
export class FetchAgentverseProvider implements FetchAgentProvider {
  private local: LocalAgentProvider;

  constructor(
    private options: FetchAgentOptions,
    private agents: Record<string, SpecialistAgent>,
    private fetchImpl: typeof fetch = fetch
  ) {
    this.local = new LocalAgentProvider(agents);
  }

  isConfigured(): boolean {
    return !!this.options.baseUrl;
  }

  getProviderName(): string {
    return 'Fetch AI Agentverse';
  }

  async route(input: TutorInput, traceId?: string): Promise<AgentRouteDecision> {
    try {
      const reply = await this.post<{ selectedAgent: string; reason: string }>('/route', {
        question: input.question,
        mode: input.mode,
      });
      if (this.agents[reply.selectedAgent]) {
        return { selectedAgent: reply.selectedAgent, reason: reply.reason, provider: this.getProviderName() };
      }
      console.warn(`[Fetch Agentverse] Unknown agent "${reply.selectedAgent}", routing locally.`);
    } catch (err) {
      console.warn('[Fetch Agentverse] Route call failed, routing locally:', (err as Error).message);
    }
    const decision = await this.local.route(input, traceId);
    return { ...decision, provider: 'Local Provider (Fetch fallback)' };
  }

  async execute(agentType: string, input: TutorInput, onDelta?: (text: string) => void, traceId?: string): Promise<AgentOutput> {
    if (REMOTE_AGENTS.has(agentType)) {
      try {
        const weakConcepts = (input.learnerMemory?.weakConcepts ?? []) as WeakConcept[];
        const plan = await this.post<LearningPlanReply>('/learning-plan', {
          weakConcepts: weakConcepts.map((c) => ({
            concept: c.concept,
            confidence: c.confidence,
            timesSeen: c.timesSeen,
            lastSeenAt: c.lastSeenAt,
          })),
        });
        onDelta?.(plan.spokenText);
        return {
          agentType,
          response: {
            summary: plan.summary,
            spokenText: plan.spokenText,
            drawings: [],
            concept: plan.concept,
            confidence: 0.9,
            hints: plan.hints,
            provider: this.getProviderName(),
          },
        };
      } catch (err) {
        console.warn(`[Fetch Agentverse] ${agentType} failed, running locally:`, (err as Error).message);
      }
    }
    return this.local.execute(agentType, input, onDelta, traceId);
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await this.fetchImpl(`${this.options.baseUrl.replace(/\/+$/, '')}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.options.timeoutMs),
    });
    if (!res.ok) {
      throw new Error(`Fetch agent ${path} returned ${res.status}`);
    }
    return (await res.json()) as T;
  }
}
