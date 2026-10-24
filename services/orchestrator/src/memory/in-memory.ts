import type { MemoryService } from './memory-service.js';
import type { SessionTurn, LearnerProfile, WeakConcept } from '@screentutor/shared';

export class InMemoryService implements MemoryService {
  private profiles = new Map<string, LearnerProfile>();
  private sessions = new Map<string, SessionTurn[]>();
  private userSessions = new Map<string, Set<string>>();
  private cache = new Map<string, { value: string; expiresAt: number }>();

  async getLearnerProfile(userId: string): Promise<LearnerProfile> {
    let profile = this.profiles.get(userId);
    if (!profile) {
      profile = {
        userId,
        preferredExplanationStyle: undefined,
        weakConcepts: [],
        strongConcepts: [],
        recentQuestions: [],
        quizOutcomes: [],
        totalQuestionsAsked: 0,
        lastModeUsed: '',
        lastActiveAt: new Date().toISOString(),
        memoryEnabled: true,
      };
      this.profiles.set(userId, profile);
    }
    return profile;
  }

  async updateLearnerProfile(userId: string, patch: Partial<LearnerProfile>): Promise<void> {
    const profile = await this.getLearnerProfile(userId);
    Object.assign(profile, patch);
    profile.lastActiveAt = new Date().toISOString();
  }

  async appendSessionTurn(sessionId: string, turn: SessionTurn): Promise<void> {
    const profile = await this.getLearnerProfile(turn.userId);
    if (profile.memoryEnabled === false) return;

    let turns = this.sessions.get(sessionId);
    if (!turns) {
      turns = [];
      this.sessions.set(sessionId, turns);
    }
    turns.push(turn);

    // Track user session association
    let uSessions = this.userSessions.get(turn.userId);
    if (!uSessions) {
      uSessions = new Set<string>();
      this.userSessions.set(turn.userId, uSessions);
    }
    uSessions.add(sessionId);
  }

  async getRecentTurns(sessionId: string, limit?: number): Promise<SessionTurn[]> {
    const turns = this.sessions.get(sessionId) || [];
    if (limit !== undefined) {
      return turns.slice(-limit);
    }
    return turns;
  }

  async rememberWeakConcept(userId: string, concept: string, evidence: string, confidence?: number): Promise<void> {
    const profile = await this.getLearnerProfile(userId);
    if (profile.memoryEnabled === false) return;

    const existing = profile.weakConcepts.find(c => c.concept === concept);
    const now = new Date().toISOString();

    if (existing) {
      existing.evidence = evidence;
      existing.timesSeen += 1;
      existing.confidence = Math.min(1.0, confidence !== undefined ? confidence : existing.confidence + 0.1);
      existing.lastSeenAt = now;
    } else {
      profile.weakConcepts.push({
        concept,
        evidence,
        confidence: confidence !== undefined ? confidence : 0.5,
        timesSeen: 1,
        firstSeenAt: now,
        lastSeenAt: now,
      });
    }
  }

  async markConceptImproved(userId: string, concept: string): Promise<void> {
    const profile = await this.getLearnerProfile(userId);
    profile.weakConcepts = profile.weakConcepts.filter(c => c.concept !== concept);
    if (!profile.strongConcepts.includes(concept)) {
      profile.strongConcepts.push(concept);
    }
  }

  async getWeakConcepts(userId: string): Promise<WeakConcept[]> {
    const profile = await this.getLearnerProfile(userId);
    return profile.weakConcepts;
  }

  async clearUserMemory(userId: string): Promise<void> {
    this.profiles.delete(userId);
    const uSessions = this.userSessions.get(userId);
    if (uSessions) {
      for (const sid of uSessions) {
        this.sessions.delete(sid);
      }
      this.userSessions.delete(userId);
    }
  }

  async semanticCacheGet(cacheKey: string): Promise<string | null> {
    const entry = this.cache.get(cacheKey);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(cacheKey);
      return null;
    }
    return entry.value;
  }

  async semanticCacheSet(cacheKey: string, value: string, ttlSeconds = 3600): Promise<void> {
    this.cache.set(cacheKey, {
      value,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  }

  async healthCheck(): Promise<{ status: string; type: 'convex' | 'in-memory'; details?: any }> {
    return {
      status: 'healthy',
      type: 'in-memory'
    };
  }
}
