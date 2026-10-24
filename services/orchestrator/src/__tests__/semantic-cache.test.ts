import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SemanticCache,
  buildTutorResponseCacheKey,
  sanitizeResponseForCache,
  hashScreenshot,
} from '../cache/semantic-cache.js';
import type { MemoryService } from '../memory/memory-service.js';
import type { TutorInput, TutorResponse } from '@screentutor/shared';

function mockMemory(store = new Map<string, string>()): MemoryService {
  return {
    getLearnerProfile: vi.fn(),
    updateLearnerProfile: vi.fn(),
    appendSessionTurn: vi.fn(),
    getRecentTurns: vi.fn(),
    rememberWeakConcept: vi.fn(),
    markConceptImproved: vi.fn(),
    getWeakConcepts: vi.fn(),
    clearUserMemory: vi.fn(),
    semanticCacheGet: vi.fn(async (key: string) => store.get(key) ?? null),
    semanticCacheSet: vi.fn(async (key: string, value: string) => {
      store.set(key, value);
    }),
    healthCheck: vi.fn(),
  };
}

describe('SemanticCache', () => {
  let memory: MemoryService;
  let cache: SemanticCache;

  beforeEach(() => {
    memory = mockMemory();
    cache = new SemanticCache(memory, true);
  });

  it('stores and retrieves JSON values', async () => {
    await cache.set('test:key', { hello: 'world' }, 60);
    const hit = await cache.get<{ hello: string }>('test:key');
    expect(hit).toEqual({ hello: 'world' });
    expect(memory.semanticCacheSet).toHaveBeenCalledWith('test:key', '{"hello":"world"}', 60);
  });

  it('returns null when disabled', async () => {
    const disabled = new SemanticCache(memory, false);
    await disabled.set('x', { a: 1 }, 60);
    expect(await disabled.get('x')).toBeNull();
  });

  it('returns null when memory is unavailable', async () => {
    const noMem = new SemanticCache(null, true);
    expect(await noMem.get('x')).toBeNull();
    await noMem.set('x', { a: 1 }, 60);
    expect(memory.semanticCacheSet).not.toHaveBeenCalled();
  });
});

describe('buildTutorResponseCacheKey', () => {
  it('changes when question or weak concepts differ', () => {
    const base: TutorInput = {
      userId: 'u1',
      sessionId: 's1',
      mode: 'explain',
      question: 'What is x?',
    };

    const keyA = buildTutorResponseCacheKey(base, 'abc123', ['algebra']);
    const keyB = buildTutorResponseCacheKey({ ...base, question: 'Solve for x' }, 'abc123', ['algebra']);
    const keyC = buildTutorResponseCacheKey(base, 'abc123', ['geometry']);

    expect(keyA).not.toBe(keyB);
    expect(keyA).not.toBe(keyC);
    expect(keyA.startsWith('tutor:')).toBe(true);
  });
});

describe('sanitizeResponseForCache', () => {
  it('removes observability metadata', () => {
    const response = {
      summary: 'test',
      observability: { traceId: 't1', latencyMs: 100 },
    } as TutorResponse;

    const sanitized = sanitizeResponseForCache(response);
    expect(sanitized.summary).toBe('test');
    expect(sanitized.observability).toBeUndefined();
  });
});

describe('hashScreenshot', () => {
  it('returns stable md5 for same input', () => {
    const a = hashScreenshot('data:image/png;base64,abc');
    const b = hashScreenshot('data:image/png;base64,abc');
    expect(a).toBe(b);
    expect(a).toHaveLength(32);
  });
});
