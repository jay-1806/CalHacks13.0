import { ConvexHttpClient } from 'convex/browser';
import { anyApi } from 'convex/server';
import type { MemoryService } from './memory-service.js';
import type { SessionTurn, LearnerProfile, WeakConcept } from '@screentutor/shared';
import { InMemoryService } from './in-memory.js';
import * as Sentry from '@sentry/node';

const api = anyApi.memory;
const PROFILE_TTL_MS = 5 * 60 * 1000;

/** The subset of ConvexHttpClient this service uses (lets tests pass a fake). */
export interface ConvexCaller {
  query(ref: unknown, args: Record<string, unknown>): Promise<any>;
  mutation(ref: unknown, args: Record<string, unknown>): Promise<any>;
}

/**
 * Learner memory in Convex (functions in services/orchestrator/convex/memory.ts).
 * Profiles are cached in-process for a few minutes and invalidated on every write
 * this process makes, so the hot path usually skips the round trip.
 */
export class ConvexMemoryService implements MemoryService {
  private profileCache = new Map<string, { profile: LearnerProfile; expiresAt: number }>();

  constructor(
    private client: ConvexCaller,
    private secret: string,
    private deploymentUrl = ''
  ) {}

  static async create(deploymentUrl: string, secret: string): Promise<MemoryService> {
    const client = new ConvexHttpClient(deploymentUrl) as unknown as ConvexCaller;
    try {
      await client.query(api.ping, { secret });
      console.log('Connected to Convex successfully.');
      return new ConvexMemoryService(client, secret, deploymentUrl);
    } catch (error) {
      Sentry.captureException(error);
      console.warn('Failed to reach Convex, falling back to InMemoryService:', (error as Error).message);
      return new InMemoryService();
    }
  }

  async getLearnerProfile(userId: string): Promise<LearnerProfile> {
    const cached = this.profileCache.get(userId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.profile;
    }
    const profile = (await this.client.query(api.getProfile, { secret: this.secret, userId })) as LearnerProfile;
    this.profileCache.set(userId, { profile, expiresAt: Date.now() + PROFILE_TTL_MS });
    return profile;
  }

  async updateLearnerProfile(userId: string, patch: Partial<LearnerProfile>): Promise<void> {
    // Weak concepts live in their own table and are written via rememberWeakConcept.
    const { userId: _u, weakConcepts: _w, lastActiveAt: _l, ...fields } = patch;
    await this.client.mutation(api.updateProfile, { secret: this.secret, userId, patch: fields });
    this.profileCache.delete(userId);
  }

  async appendSessionTurn(sessionId: string, turn: SessionTurn): Promise<void> {
    await this.client.mutation(api.appendTurn, { secret: this.secret, turn: { ...turn, sessionId } });
  }

  async getRecentTurns(sessionId: string, limit?: number): Promise<SessionTurn[]> {
    return this.client.query(api.recentTurns, { secret: this.secret, sessionId, limit });
  }

  async rememberWeakConcept(userId: string, concept: string, evidence: string, confidence?: number): Promise<void> {
    await this.client.mutation(api.rememberWeakConcept, {
      secret: this.secret,
      userId,
      concept,
      evidence,
      confidence,
    });
    this.profileCache.delete(userId);
  }

  async markConceptImproved(userId: string, concept: string): Promise<void> {
    await this.client.mutation(api.markConceptImproved, { secret: this.secret, userId, concept });
    this.profileCache.delete(userId);
  }

  async getWeakConcepts(userId: string): Promise<WeakConcept[]> {
    return (await this.getLearnerProfile(userId)).weakConcepts;
  }

  async clearUserMemory(userId: string): Promise<void> {
    await this.client.mutation(api.clearUser, { secret: this.secret, userId });
    this.profileCache.delete(userId);
  }

  async semanticCacheGet(cacheKey: string): Promise<string | null> {
    return this.client.query(api.cacheGet, { secret: this.secret, key: cacheKey });
  }

  async semanticCacheSet(cacheKey: string, value: string, ttlSeconds = 3600): Promise<void> {
    await this.client.mutation(api.cacheSet, { secret: this.secret, key: cacheKey, value, ttlSeconds });
  }

  async healthCheck(): Promise<{ status: string; type: 'convex' | 'in-memory'; details?: any }> {
    try {
      const start = Date.now();
      await this.client.query(api.ping, { secret: this.secret });
      return { status: 'healthy', type: 'convex', details: { deploymentUrl: this.deploymentUrl, latencyMs: Date.now() - start } };
    } catch (err: any) {
      return { status: 'unhealthy', type: 'convex', details: { error: err.message || String(err) } };
    }
  }
}
