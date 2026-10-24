import { z } from 'zod';

// ---------------------------------------------------------------------------
// Weak Concept (tracked per user)
// ---------------------------------------------------------------------------

export const WeakConcept = z.object({
  concept: z.string(),
  evidence: z.string(),
  confidence: z.number().min(0).max(1),
  timesSeen: z.number(),
  firstSeenAt: z.string(),
  lastSeenAt: z.string(),
});
export type WeakConcept = z.infer<typeof WeakConcept>;

// ---------------------------------------------------------------------------
// Quiz Outcome
// ---------------------------------------------------------------------------

export const QuizOutcome = z.object({
  concept: z.string(),
  correct: z.boolean(),
  timestamp: z.string(),
});
export type QuizOutcome = z.infer<typeof QuizOutcome>;

// ---------------------------------------------------------------------------
// Recent Question
// ---------------------------------------------------------------------------

export const RecentQuestion = z.object({
  question: z.string(),
  mode: z.string(),
  detectedConcept: z.string().optional(),
  timestamp: z.string(),
});
export type RecentQuestion = z.infer<typeof RecentQuestion>;

// ---------------------------------------------------------------------------
// Learner Profile
// ---------------------------------------------------------------------------

export const LearnerProfile = z.object({
  userId: z.string(),
  preferredExplanationStyle: z
    .enum(['visual', 'step_by_step', 'concise', 'rigorous'])
    .optional(),
  weakConcepts: z.array(WeakConcept),
  strongConcepts: z.array(z.string()),
  recentQuestions: z.array(RecentQuestion),
  quizOutcomes: z.array(QuizOutcome),
  totalQuestionsAsked: z.number(),
  lastModeUsed: z.string(),
  lastActiveAt: z.string(),
  memoryEnabled: z.boolean(),
});
export type LearnerProfile = z.infer<typeof LearnerProfile>;

// ---------------------------------------------------------------------------
// Session Turn
// ---------------------------------------------------------------------------

export const SessionTurn = z.object({
  sessionId: z.string(),
  userId: z.string(),
  timestamp: z.string(),
  mode: z.string(),
  question: z.string(),
  concept: z.string().optional(),
  responseSummary: z.string(),
  hintLevel: z.number().optional(),
  quizOutcome: z.boolean().optional(),
  pointTargetValid: z.boolean(),
  provider: z.string(),
  screenshotHash: z.string().optional(),
});
export type SessionTurn = z.infer<typeof SessionTurn>;

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export const Session = z.object({
  sessionId: z.string(),
  userId: z.string(),
  turns: z.array(SessionTurn),
  createdAt: z.string(),
  lastActiveAt: z.string(),
});
export type Session = z.infer<typeof Session>;
