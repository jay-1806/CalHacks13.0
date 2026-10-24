import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export const explanationStyle = v.union(
  v.literal('visual'),
  v.literal('step_by_step'),
  v.literal('concise'),
  v.literal('rigorous')
);

export const recentQuestion = v.object({
  question: v.string(),
  mode: v.string(),
  detectedConcept: v.optional(v.string()),
  timestamp: v.string(),
});

export const quizOutcome = v.object({
  concept: v.string(),
  correct: v.boolean(),
  timestamp: v.string(),
});

export const sessionTurn = v.object({
  sessionId: v.string(),
  userId: v.string(),
  timestamp: v.string(),
  mode: v.string(),
  question: v.string(),
  concept: v.optional(v.string()),
  responseSummary: v.string(),
  hintLevel: v.optional(v.number()),
  quizOutcome: v.optional(v.boolean()),
  pointTargetValid: v.boolean(),
  provider: v.optional(v.string()),
  /** Hash only — screenshots are never stored */
  screenshotHash: v.optional(v.string()),
});

/**
 * Learner memory for ScreenTutor. Weak concepts get their own table so an
 * update to one concept is a single-row transaction, not a whole-profile rewrite.
 */
export default defineSchema({
  profiles: defineTable({
    userId: v.string(),
    preferredExplanationStyle: v.optional(explanationStyle),
    strongConcepts: v.array(v.string()),
    recentQuestions: v.array(recentQuestion),
    quizOutcomes: v.array(quizOutcome),
    totalQuestionsAsked: v.number(),
    lastModeUsed: v.string(),
    lastActiveAt: v.string(),
    memoryEnabled: v.boolean(),
  }).index('by_user', ['userId']),

  weakConcepts: defineTable({
    userId: v.string(),
    concept: v.string(),
    evidence: v.string(),
    confidence: v.number(),
    timesSeen: v.number(),
    firstSeenAt: v.string(),
    lastSeenAt: v.string(),
  }).index('by_user_concept', ['userId', 'concept']),

  sessionTurns: defineTable(sessionTurn)
    .index('by_session', ['sessionId'])
    .index('by_user', ['userId']),

  cacheEntries: defineTable({
    key: v.string(),
    value: v.string(),
    expiresAt: v.number(),
  })
    .index('by_key', ['key'])
    .index('by_expiry', ['expiresAt']),
});
