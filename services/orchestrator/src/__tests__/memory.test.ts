import { describe, it, expect, beforeEach } from 'vitest';
import { InMemoryService } from '../memory/in-memory.js';

describe('InMemoryService', () => {
  let memory: InMemoryService;

  beforeEach(() => {
    memory = new InMemoryService();
  });

  it('appends and retrieves session turns', async () => {
    const turn = {
      sessionId: 's1',
      userId: 'u1',
      timestamp: new Date().toISOString(),
      mode: 'explain',
      question: 'Explain this',
      concept: 'algebra',
      responseSummary: 'Explanation summary',
      pointTargetValid: false,
      provider: 'mock'
    };
    await memory.appendSessionTurn('s1', turn);
    const turns = await memory.getRecentTurns('s1');
    expect(turns.length).toBe(1);
    expect(turns[0].userId).toBe('u1');
  });

  it('tracks weak concepts', async () => {
    await memory.rememberWeakConcept('u1', 'algebra', 'failed quiz');
    const profile = await memory.getLearnerProfile('u1');
    expect(profile.weakConcepts[0].concept).toBe('algebra');
    expect(profile.weakConcepts[0].confidence).toBe(0.5);
    
    // Remember again should increase confidence
    await memory.rememberWeakConcept('u1', 'algebra', 'failed again');
    const profile2 = await memory.getLearnerProfile('u1');
    expect(profile2.weakConcepts[0].confidence).toBeGreaterThan(0.5);
  });

  it('respects memoryEnabled toggle', async () => {
    // 1. Toggle memory off
    await memory.updateLearnerProfile('u1', { memoryEnabled: false });
    
    // 2. Try to remember concept - should be ignored
    await memory.rememberWeakConcept('u1', 'calculus', 'forgot derivative');
    const profile = await memory.getLearnerProfile('u1');
    expect(profile.weakConcepts.length).toBe(0);

    // 3. Try to append turn - should be ignored
    const turn = {
      sessionId: 's1',
      userId: 'u1',
      timestamp: new Date().toISOString(),
      mode: 'explain',
      question: 'Explain this',
      concept: 'calculus',
      responseSummary: 'Explanation summary',
      pointTargetValid: false,
      provider: 'mock'
    };
    await memory.appendSessionTurn('s1', turn);
    const turns = await memory.getRecentTurns('s1');
    expect(turns.length).toBe(0);
  });

  it('marks concept improved', async () => {
    await memory.rememberWeakConcept('u1', 'trig', 'forgot sin');
    await memory.markConceptImproved('u1', 'trig');
    
    const profile = await memory.getLearnerProfile('u1');
    expect(profile.weakConcepts.length).toBe(0);
    expect(profile.strongConcepts).toContain('trig');
  });

  it('stores and retrieves semantic cache entries with TTL', async () => {
    await memory.semanticCacheSet('demo:key', '{"value":42}', 3600);
    const hit = await memory.semanticCacheGet('demo:key');
    expect(hit).toBe('{"value":42}');
  });
});
