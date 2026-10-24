import { createHash } from 'crypto';
import type { MemoryService } from '../memory/memory-service.js';
import type { TutorInput, TutorResponse } from '@screentutor/shared';

/**
 * Finds a previously cached entry whose text means the same thing, within an
 * exact-match scope (e.g. same screenshot + mode). Implemented by Moss.
 */
export interface SimilarityIndex {
  findSimilar(text: string, scope: Record<string, string>): Promise<string | null>;
  add(key: string, text: string, scope: Record<string, string>): Promise<void>;
  /** Optional: begin any slow setup (e.g. loading the index) ahead of the first request. */
  warm?(): unknown;
}

/** What a similarity lookup may match on: the text, but only inside `scope`. */
export interface SimilarityHint {
  text: string;
  scope: Record<string, string>;
}

export class SemanticCache {
  constructor(
    private memory: MemoryService | null,
    private enabled: boolean,
    private similarity: SimilarityIndex | null = null
  ) {}

  /**
   * Exact key first; on a miss, a reworded question in the same scope can reuse
   * an answer. Returns which path hit so callers can trace it.
   */
  async lookup<T>(key: string, hint?: SimilarityHint): Promise<{ value: T; match: 'exact' | 'similar' } | null> {
    const exact = await this.get<T>(key);
    if (exact !== null) return { value: exact, match: 'exact' };
    if (!this.enabled || !this.similarity || !hint) return null;
    try {
      const similarKey = await this.similarity.findSimilar(hint.text, hint.scope);
      if (!similarKey || similarKey === key) return null;
      const similar = await this.get<T>(similarKey);
      return similar !== null ? { value: similar, match: 'similar' } : null;
    } catch (err) {
      console.warn('[SemanticCache] Similarity lookup failed:', err);
      return null;
    }
  }

  async get<T>(key: string): Promise<T | null> {
    if (!this.enabled || !this.memory) return null;
    try {
      const raw = await this.memory.semanticCacheGet(key);
      if (!raw) return null;
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number, hint?: SimilarityHint): Promise<void> {
    if (!this.enabled || !this.memory) return;
    try {
      await this.memory.semanticCacheSet(key, JSON.stringify(value), ttlSeconds);
      if (this.similarity && hint) {
        // Indexing is a multi-second network call (measured ~3.6s on Moss); never wait on it.
        this.similarity.add(key, hint.text, hint.scope).catch((err) => {
          console.warn('[SemanticCache] Failed to index entry for similarity:', err);
        });
      }
    } catch (err) {
      console.warn('[SemanticCache] Failed to write cache entry:', err);
    }
  }
}

export function hashScreenshot(base64?: string): string | undefined {
  if (!base64) return undefined;
  return createHash('md5').update(base64).digest('hex');
}

export function buildTutorResponseCacheKey(
  input: TutorInput,
  screenshotHash: string | undefined,
  weakConcepts: string[]
): string {
  const payload = [
    input.mode,
    input.subject ?? 'auto',
    input.question.trim().toLowerCase(),
    screenshotHash ?? 'no-screenshot',
    input.demoLessonId ?? '',
    input.learnerPreferences?.explanationStyle ?? '',
    [...weakConcepts].sort().join(','),
  ].join('|');

  return `tutor:${createHash('sha256').update(payload).digest('hex')}`;
}

/**
 * Similarity scope for a tutor answer. Everything except the wording of the
 * question must match exactly — an answer drawn for one screenshot is never
 * reused on another.
 */
export function buildTutorSimilarityHint(
  input: TutorInput,
  screenshotHash: string | undefined,
  weakConcepts: string[]
): SimilarityHint {
  return {
    text: input.question.trim().toLowerCase(),
    scope: {
      kind: 'tutor',
      mode: input.mode,
      subject: input.subject ?? 'auto',
      screenshot: screenshotHash ?? 'no-screenshot',
      lesson: input.demoLessonId ?? '',
      style: input.learnerPreferences?.explanationStyle ?? '',
      weak: createHash('sha256').update([...weakConcepts].sort().join(',')).digest('hex').slice(0, 16),
    },
  };
}

/** Strip runtime-only fields before persisting a tutor response. */
export function sanitizeResponseForCache(response: TutorResponse): TutorResponse {
  const { observability: _obs, ...rest } = response;
  return rest as TutorResponse;
}
