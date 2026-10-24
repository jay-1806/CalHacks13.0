import { describe, it, expect, vi } from 'vitest';
import { getFunctionName } from 'convex/server';
import { ConvexMemoryService, type ConvexCaller } from '../memory/convex-memory.js';
import { MossSimilarityIndex, type MossLike } from '../cache/moss-index.js';
import { SemanticCache, buildTutorSimilarityHint } from '../cache/semantic-cache.js';
import { InMemoryService } from '../memory/in-memory.js';
import { ApifyResearchService, firstParagraph } from '../integrations/apify.js';
import { FetchAgentverseProvider } from '../agents/fetch-provider.js';
import type { SpecialistAgent } from '../agents/agent-router.js';
import type { TutorInput, TutorResponse } from '@screentutor/shared';

/** Names a function reference from anyApi, e.g. "memory:getProfile". */
const fnName = (ref: any) => getFunctionName(ref);

describe('ConvexMemoryService', () => {
  function fakeConvex() {
    const calls: Array<{ kind: string; fn: string; args: any }> = [];
    const caller: ConvexCaller = {
      query: vi.fn(async (ref, args) => {
        calls.push({ kind: 'query', fn: fnName(ref), args });
        if (fnName(ref).endsWith('getProfile')) {
          return { userId: args.userId, weakConcepts: [], strongConcepts: [], recentQuestions: [], quizOutcomes: [], totalQuestionsAsked: 0, lastModeUsed: '', lastActiveAt: '', memoryEnabled: true };
        }
        return null;
      }),
      mutation: vi.fn(async (ref, args) => {
        calls.push({ kind: 'mutation', fn: fnName(ref), args });
      }),
    };
    return { caller, calls };
  }

  it('passes the shared secret on every call and caches profiles until a write', async () => {
    const { caller, calls } = fakeConvex();
    const memory = new ConvexMemoryService(caller, 's3cret');

    await memory.getLearnerProfile('u1');
    await memory.getLearnerProfile('u1');
    expect(calls.filter((c) => c.fn.endsWith('getProfile'))).toHaveLength(1);

    await memory.rememberWeakConcept('u1', 'chain_rule', 'hint requested', 0.6);
    await memory.getLearnerProfile('u1');
    expect(calls.filter((c) => c.fn.endsWith('getProfile'))).toHaveLength(2);
    expect(calls.every((c) => c.args.secret === 's3cret')).toBe(true);
  });

  it('never sends weak concepts or lastActiveAt in a profile patch', async () => {
    const { caller, calls } = fakeConvex();
    const memory = new ConvexMemoryService(caller, 's');
    await memory.updateLearnerProfile('u1', { totalQuestionsAsked: 3, weakConcepts: [], lastActiveAt: 'x', userId: 'u1' });
    expect(calls[0]).toMatchObject({ fn: 'memory:updateProfile', args: { userId: 'u1', patch: { totalQuestionsAsked: 3 } } });
    expect(Object.keys(calls[0].args.patch)).toEqual(['totalQuestionsAsked']);
  });

  it('falls back to in-memory storage when the deployment is unreachable', async () => {
    const memory = await ConvexMemoryService.create('http://127.0.0.1:9', 's');
    expect(memory).toBeInstanceOf(InMemoryService);
  });
});

describe('Moss similarity cache', () => {
  function fakeMoss(score: number): MossLike & { queries: any[] } {
    const queries: any[] = [];
    return {
      queries,
      loadIndex: vi.fn(async () => 'ok'),
      createIndex: vi.fn(async () => ({})),
      addDocs: vi.fn(async () => ({})),
      query: vi.fn(async (_i, text, options) => {
        queries.push({ text, options });
        return { docs: [{ id: 'tutor:original', score }] };
      }),
    };
  }

  const input: TutorInput = { userId: 'u', sessionId: 's', mode: 'explain', question: 'Explain this step' };

  it('reuses a cached answer for a reworded question, scoped to the same screenshot', async () => {
    const memory = new InMemoryService();
    await memory.semanticCacheSet('tutor:original', JSON.stringify({ spokenText: 'cached' }), 60);
    const moss = fakeMoss(0.95);
    const index = new MossSimilarityIndex(moss, { indexName: 'i', minScore: 0.9, refreshSeconds: 30 });
    await index.warm();
    const cache = new SemanticCache(memory, true, index);

    const hint = buildTutorSimilarityHint({ ...input, question: 'Can you explain this step?' }, 'hash-1', []);
    const hit = await cache.lookup<{ spokenText: string }>('tutor:new-key', hint);

    expect(hit).toEqual({ value: { spokenText: 'cached' }, match: 'similar' });
    const filter = moss.queries[0].options.filter.$and;
    expect(filter).toContainEqual({ field: 'screenshot', condition: { $eq: 'hash-1' } });
    expect(filter).toContainEqual({ field: 'mode', condition: { $eq: 'explain' } });
  });

  it('treats low-similarity matches as misses', async () => {
    const memory = new InMemoryService();
    await memory.semanticCacheSet('tutor:original', '{"spokenText":"cached"}', 60);
    const index = new MossSimilarityIndex(fakeMoss(0.5), { indexName: 'i', minScore: 0.9, refreshSeconds: 30 });
    await index.warm();
    const cache = new SemanticCache(memory, true, index);
    expect(await cache.lookup('tutor:new', buildTutorSimilarityHint(input, 'h', []))).toBeNull();
  });

  it('never makes a request wait for the index to load', async () => {
    const moss = fakeMoss(0.95);
    let finishLoad!: () => void;
    (moss.loadIndex as any).mockImplementationOnce(() => new Promise((r) => (finishLoad = () => r('ok'))));
    const index = new MossSimilarityIndex(moss, { indexName: 'i', minScore: 0.9, refreshSeconds: 30 });

    expect(await index.findSimilar('q', { kind: 'tutor' })).toBeNull(); // still loading: immediate miss
    finishLoad();
    await index.warm();
    expect(await index.findSimilar('q', { kind: 'tutor' })).toBe('tutor:original');
  });

  it('does not wait for similarity indexing when caching an answer', async () => {
    const moss = fakeMoss(0.95);
    (moss.addDocs as any).mockImplementation(() => new Promise(() => {})); // never resolves
    const index = new MossSimilarityIndex(moss, { indexName: 'i', minScore: 0.9, refreshSeconds: 30 });
    await index.warm();
    const cache = new SemanticCache(new InMemoryService(), true, index);
    await cache.set('k', { a: 1 }, 60, buildTutorSimilarityHint(input, 'h', []));
    expect(await cache.get('k')).toEqual({ a: 1 });
  });

  it('creates the index on first run when loading fails', async () => {
    const moss = fakeMoss(0.95);
    (moss.loadIndex as any).mockRejectedValueOnce(new Error('not found'));
    const index = new MossSimilarityIndex(moss, { indexName: 'i', minScore: 0.9, refreshSeconds: 30 });
    await index.add('k', 'text', { kind: 'tutor' });
    expect(moss.createIndex).toHaveBeenCalledOnce();
    expect(moss.addDocs).toHaveBeenCalledWith('i', [{ id: 'k', text: 'text', metadata: { kind: 'tutor' } }], { upsert: true });
  });
});

describe('ApifyResearchService', () => {
  const page = {
    searchResult: { title: 'Chain rule', description: 'Differentiate composite functions.', url: 'https://www.khanacademy.org/chain-rule' },
    markdown: '# Chain rule\n\n![img](x.png)\n\nThe chain rule tells us how to differentiate a composite function: multiply the derivative of the outer function by the derivative of the inner function.',
  };

  it('searches with a bearer token and summarizes the top page', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify([page]), { status: 200 }));
    const service = new ApifyResearchService({ token: 'apify_api_x', maxResults: 3, timeoutMs: 5000 }, undefined, fetchImpl as any);

    const result = await service.researchConcept('chain_rule', 'beginner', 'derivative of sin(x^2)');

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('rag-web-browser.apify.actor/search?query=chain+rule+explained+beginner+level');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer apify_api_x');
    expect(result.summary).toMatch(/^The chain rule tells us/);
    expect(result.sourceUrl).toBe('https://www.khanacademy.org/chain-rule');
    expect(result.keyTakeaways).toEqual(['Differentiate composite functions.']);
  });

  it('returns a fallback result instead of throwing when Apify fails', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 401 }));
    const service = new ApifyResearchService({ token: 't', maxResults: 3, timeoutMs: 5000 }, undefined, fetchImpl as any);
    const result = await service.researchConcept('algebra', 'beginner', '');
    expect(result.confidence).toBe(0.5);
    expect(result.summary).toContain('401');
  });

  it('skips headings, images and lists when picking a summary paragraph', () => {
    expect(firstParagraph('# T\n\n- a list item that is long enough to be skipped by the paragraph picker ok\n\n' + 'x'.repeat(90))).toBe('x'.repeat(90));
  });
});

describe('FetchAgentverseProvider', () => {
  const localAgent = (name: string): SpecialistAgent => ({
    name,
    execute: vi.fn(async (): Promise<TutorResponse> => ({ summary: `local ${name}`, spokenText: 'local', concept: 'general', confidence: 1 })),
  });
  const agents = {
    MathTutorAgent: localAgent('MathTutorAgent'),
    QuizGeneratorAgent: localAgent('QuizGeneratorAgent'),
    LearningPlanAgent: localAgent('LearningPlanAgent'),
    MisconceptionDetectorAgent: localAgent('MisconceptionDetectorAgent'),
    ResourceFinderAgent: localAgent('ResourceFinderAgent'),
  };
  const input: TutorInput = {
    userId: 'u',
    sessionId: 's',
    mode: 'review',
    question: 'what should I study',
    learnerMemory: { weakConcepts: [{ concept: 'chain_rule', confidence: 0.8, timesSeen: 2, lastSeenAt: '2026-10-01T00:00:00Z', evidence: 'x', firstSeenAt: 'x' }] },
  };

  it('uses the agent for routing and learning plans', async () => {
    const fetchImpl = vi.fn(async (url: string) =>
      new Response(
        JSON.stringify(
          url.endsWith('/route')
            ? { selectedAgent: 'LearningPlanAgent', reason: 'review' }
            : { summary: 'Plan', spokenText: 'Start with chain rule.', hints: ['1. chain rule'], concept: 'chain_rule' }
        ),
        { status: 200 }
      )
    );
    const provider = new FetchAgentverseProvider({ baseUrl: 'http://localhost:8001', timeoutMs: 500 }, agents, fetchImpl as any);

    const decision = await provider.route(input);
    expect(decision).toMatchObject({ selectedAgent: 'LearningPlanAgent', provider: 'Fetch AI Agentverse' });

    const out = await provider.execute('LearningPlanAgent', input);
    expect(out.response.spokenText).toBe('Start with chain rule.');
    const planBody = JSON.parse((fetchImpl.mock.calls[1] as any)[1].body);
    expect(planBody.weakConcepts[0]).toEqual({ concept: 'chain_rule', confidence: 0.8, timesSeen: 2, lastSeenAt: '2026-10-01T00:00:00Z' });
  });

  it('falls back to local routing and agents when the uAgent is down', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    const provider = new FetchAgentverseProvider({ baseUrl: 'http://localhost:8001', timeoutMs: 500 }, agents, fetchImpl as any);

    const decision = await provider.route(input);
    expect(decision.selectedAgent).toBe('LearningPlanAgent');
    expect(decision.provider).toContain('fallback');

    const out = await provider.execute('LearningPlanAgent', input);
    expect(out.response.summary).toBe('local LearningPlanAgent');
  });
});
