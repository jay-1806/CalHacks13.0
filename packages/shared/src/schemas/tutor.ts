import { z } from 'zod';
import { DrawingCommand } from './drawing.js';
import { ProposedAction } from './action.js';
import { SessionTurn } from './memory.js';

// ---------------------------------------------------------------------------
// Tutor Modes
// ---------------------------------------------------------------------------

export const TutorMode = z.enum(['explain', 'hint', 'mistake', 'quiz', 'review', 'research', 'codrive']);
export type TutorMode = z.infer<typeof TutorMode>;

// ---------------------------------------------------------------------------
// Screen Metadata
// ---------------------------------------------------------------------------

export const ScreenMetadata = z.object({
  displayId: z.string().optional(),
  /** Captured image width in pixels (what the model sees) */
  imageWidth: z.number().optional(),
  /** Captured image height in pixels (what the model sees) */
  imageHeight: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  displayWidth: z.number().optional(),
  displayHeight: z.number().optional(),
  screenNumber: z.number().optional(),
  scaleFactor: z.number().optional(),
  coordinateSpace: z.enum(['normalized_image']).optional(),
  /** When set, image is a crop; tags are relative to the crop and mapped via this region */
  captureRegion: z
    .object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    })
    .optional(),
  isRegionCapture: z.boolean().optional(),
});
export type ScreenMetadata = z.infer<typeof ScreenMetadata>;

export const AppMetadata = z.object({
  windowTitle: z.string().optional(),
  appName: z.string().optional(),
  url: z.string().optional(),
});
export type AppMetadata = z.infer<typeof AppMetadata>;

// ---------------------------------------------------------------------------
// Learner Preferences (sent with request)
// ---------------------------------------------------------------------------

export const LearnerPreferences = z.object({
  explanationStyle: z.enum(['visual', 'step_by_step', 'concise', 'rigorous']).optional(),
  difficulty: z.enum(['beginner', 'intermediate', 'advanced']).optional(),
});
export type LearnerPreferences = z.infer<typeof LearnerPreferences>;

// ---------------------------------------------------------------------------
// Tutor Input (POST /api/tutor/ask)
// ---------------------------------------------------------------------------

export const TutorInput = z.object({
  userId: z.string(),
  sessionId: z.string(),
  mode: TutorMode,
  question: z.string().min(1),
  screenshotBase64: z.string().optional(),
  screenMetadata: ScreenMetadata.optional(),
  appMetadata: AppMetadata.optional(),
  learnerPreferences: LearnerPreferences.optional(),
  learnerMemory: z.any().optional(),
  /** Populated by orchestrator from Redis session history before the model call */
  recentTurns: z.array(SessionTurn).optional(),
  accessibilityTree: z.any().optional(),
  researchContext: z.any().optional(),
  privacyMode: z.boolean().optional(),
  /** Optional: stable ID of the active demo lesson — used by MockClaudeProvider for deterministic responses */
  demoLessonId: z.string().optional(),
  devOverrideRedaction: z.boolean().optional(),
});
export type TutorInput = z.infer<typeof TutorInput>;

// ---------------------------------------------------------------------------
// Quiz Item
// ---------------------------------------------------------------------------

export const QuizItem = z.object({
  id: z.string(),
  difficulty: z.enum(['easy', 'medium', 'conceptual']),
  question: z.string(),
  options: z.array(z.string()).optional(),
  answer: z.string(),
  explanation: z.string().optional(),
});
export type QuizItem = z.infer<typeof QuizItem>;

// ---------------------------------------------------------------------------
// Hint Ladder
// ---------------------------------------------------------------------------

export const HintLadder = z.object({
  conceptual: z.string(),
  visual: z.string(),
  nextStep: z.string(),
  fullSolution: z.string(),
});
export type HintLadder = z.infer<typeof HintLadder>;

export const PointTarget = z.object({
  x: z.number().nullable(),
  y: z.number().nullable(),
  label: z.string(),
  screenNumber: z.number().optional(),
  rawTag: z.string(),
  confidence: z.number().optional(),
});
export type PointTarget = z.infer<typeof PointTarget>;

// ---------------------------------------------------------------------------
// Tutor Response
// ---------------------------------------------------------------------------

export const TutorResponse = z.object({
  mode: TutorMode.optional(),
  summary: z.string(),
  spokenExplanation: z.string().optional(), // backward compatibility
  spokenText: z.string(),
  visualText: z.string().optional(),
  /** Raw text with [POINT]/[DRAW] tags for the overlay renderer */
  overlayText: z.string().optional(),
  pointTarget: PointTarget.optional(),
  drawings: z.array(DrawingCommand).optional(),
  concept: z.string(),
  confidence: z.number().min(0).max(1),
  hints: z.array(z.string()).optional(),
  hintLadder: HintLadder.optional(),
  quiz: z.array(QuizItem).optional(),
  nextQuestion: z.string().optional(),
  researchResult: z.any().optional(),
  proposedActions: z.array(ProposedAction).optional(),
  memoryUpdates: z
    .object({
      detectedConcept: z.string().optional(),
      isWeakConcept: z.boolean().optional(),
      preferredMode: TutorMode.optional(),
    })
    .optional(),
  rawModelText: z.string().optional(),
  providerMetadata: z.any().optional(),
  routingDecision: z
    .object({
      selectedAgent: z.string(),
      reason: z.string(),
      provider: z.string().optional(),
    })
    .optional(),
  observability: z
    .object({
      traceId: z.string(),
      latencyMs: z.number(),
      evaluations: z.record(
        z.string(),
        z.object({
          score: z.number(),
          passed: z.boolean(),
        })
      ),
    })
    .optional(),
  provider: z.string().optional(),
  timestamp: z.string().optional(),
});
export type TutorResponse = z.infer<typeof TutorResponse>;
