import { z } from 'zod';

// ---------------------------------------------------------------------------
// Research Response (from Browserbase or mock)
// ---------------------------------------------------------------------------

export const ResearchResult = z.object({
  title: z.string(),
  summary: z.string(),
  keyTakeaways: z.array(z.string()),
  suggestedPractice: z.string(),
  sourceMetadata: z.any().optional(),
  confidence: z.number(),
  providerMetadata: z.any().optional(),
  sourceUrl: z.string().optional(),
});
export type ResearchResult = z.infer<typeof ResearchResult>;

// ---------------------------------------------------------------------------
// Research Request
// ---------------------------------------------------------------------------

export const ResearchRequest = z.object({
  concept: z.string(),
  userQuestion: z.string(),
  learnerLevel: z.string(),
  screenSummary: z.string(),
  weakConcepts: z.array(z.string()).optional(),
  constraints: z.array(z.string()).optional(),
});
export type ResearchRequest = z.infer<typeof ResearchRequest>;
