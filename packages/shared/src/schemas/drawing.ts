import { z } from 'zod';

// ---------------------------------------------------------------------------
// Drawing Types
// ---------------------------------------------------------------------------

export const DrawingType = z.enum([
  'circle',
  'rectangle',
  'arrow',
  'highlight',
  'text_label',
  'callout',
  'step_badge',
  'underline',
  'dim_background',
]);
export type DrawingType = z.infer<typeof DrawingType>;

// Normalized coordinates (0–1 range, mapped to screen dimensions by the overlay)
export const NormalizedCoordinates = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1).optional(),
  height: z.number().min(0).max(1).optional(),
});
export type NormalizedCoordinates = z.infer<typeof NormalizedCoordinates>;

export const DrawingStyle = z.object({
  color: z.string().optional(),
  strokeWidth: z.number().optional(),
  fontSize: z.number().optional(),
  opacity: z.number().min(0).max(1).optional(),
  filled: z.boolean().optional(),
  dashed: z.boolean().optional(),
  animate: z.boolean().optional(),
});
export type DrawingStyle = z.infer<typeof DrawingStyle>;

export const DrawingCommand = z.object({
  id: z.string(),
  type: DrawingType,
  coordinates: NormalizedCoordinates,
  label: z.string().optional(),
  explanation: z.string().optional(),
  style: DrawingStyle.optional(),
  durationMs: z.number().optional(),
  confidence: z.number().min(0).max(1),
});
export type DrawingCommand = z.infer<typeof DrawingCommand>;
