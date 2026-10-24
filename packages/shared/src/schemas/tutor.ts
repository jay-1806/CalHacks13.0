import { z } from 'zod';
import { DrawingCommand } from './drawing.js';
import { SessionTurn } from './memory.js';

// ---------------------------------------------------------------------------
// Tutor Modes
// ---------------------------------------------------------------------------

/**
 * Quicky.AI currently does one thing: explain and work a math problem on screen.
 * `mode` stays as the extension point for future lesson types (and matches the
 * `mode` already stored in learner memory).
 */
export const TutorMode = z.enum(['explain']);
export type TutorMode = z.infer<typeof TutorMode>;

/**
 * What is being taught. Each subject has its own lesson pack (drawing rules and
 * pacing); when a request doesn't name one, the tutor decides from the screenshot.
 */
export const Subject = z.enum(['math', 'software', 'chess', 'language', 'general']);
export type Subject = z.infer<typeof Subject>;

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
  mode: TutorMode.default('explain'),
  question: z.string().min(1),
  /** Teach this subject; omit to let the tutor decide from the screen */
  subject: Subject.optional(),
  /**
   * A guided lesson in progress: the learner was asked to do something and the
   * screenshot shows the screen after they acted (or they asked something mid-lesson).
   */
  guide: z
    .object({
      /** What the learner set out to do (the question that started the lesson) */
      goal: z.string(),
      /** How many guided turns came before this one */
      step: z.number().int().min(1),
      /** What the learner was last asked to do */
      lastInstruction: z.string(),
    })
    .optional(),
  screenshotBase64: z.string().optional(),
  screenMetadata: ScreenMetadata.optional(),
  appMetadata: AppMetadata.optional(),
  learnerPreferences: LearnerPreferences.optional(),
  learnerMemory: z.any().optional(),
  /** Populated by the orchestrator from session history before the model call */
  recentTurns: z.array(SessionTurn).optional(),
  privacyMode: z.boolean().optional(),
  /** Optional: stable ID of the active demo lesson (part of the response cache key) */
  demoLessonId: z.string().optional(),
  devOverrideRedaction: z.boolean().optional(),
});
export type TutorInput = z.infer<typeof TutorInput>;

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
  /** The subject this answer was taught as */
  subject: Subject.optional(),
  /**
   * 'wait': a guided lesson continues — the learner should now do `awaiting`, and
   * the next turn starts when their screen changes. 'done': nothing to wait for.
   */
  nextAction: z.enum(['wait', 'done']).optional(),
  /** What the learner should do now, in a few words (when nextAction is 'wait') */
  awaiting: z.string().optional(),
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
  memoryUpdates: z
    .object({
      detectedConcept: z.string().optional(),
      isWeakConcept: z.boolean().optional(),
    })
    .optional(),
  rawModelText: z.string().optional(),
  providerMetadata: z.any().optional(),
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

/**
 * One finished teaching step, sent to the app as soon as Claude has written it so
 * the voice can start while the rest of the answer is still being generated.
 * `overlay` is that step's line of the final overlayText (tags already resolved).
 */
export interface TutorStreamStep {
  index: number;
  spoken: string;
  overlay: string;
}
