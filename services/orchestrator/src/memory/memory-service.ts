import type { Session, SessionTurn, LearnerProfile, WeakConcept } from '@screentutor/shared';

export interface MemoryService {
  getLearnerProfile(userId: string): Promise<LearnerProfile>;
  updateLearnerProfile(userId: string, patch: Partial<LearnerProfile>): Promise<void>;
  appendSessionTurn(sessionId: string, turn: SessionTurn): Promise<void>;
  getRecentTurns(sessionId: string, limit?: number): Promise<SessionTurn[]>;
  rememberWeakConcept(userId: string, concept: string, evidence: string, confidence?: number): Promise<void>;
  markConceptImproved(userId: string, concept: string): Promise<void>;
  getWeakConcepts(userId: string): Promise<WeakConcept[]>;
  clearUserMemory(userId: string): Promise<void>;
  semanticCacheGet(cacheKey: string): Promise<string | null>;
  semanticCacheSet(cacheKey: string, value: string, ttlSeconds?: number): Promise<void>;
  healthCheck(): Promise<{ status: string; type: 'convex' | 'in-memory'; details?: any }>;
}
