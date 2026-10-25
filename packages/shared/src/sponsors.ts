import { z } from 'zod';

export const SponsorName = z.enum([
  'claude',
  'convex',
  'moss',
  'elastic',
  'sentry',
  'cartesia'
]);
export type SponsorName = z.infer<typeof SponsorName>;

/**
 * Dashboard status (Part 6.7):
 * - real: credentials present AND external connectivity/function verified
 * - configured: credentials present but not yet externally verified
 * - mock: local/in-process fallback
 * - disabled: intentionally off
 * - error: credentials present but connection/init failed
 */
export const SponsorStatus = z.enum([
  'real',
  'configured',
  'mock',
  'disabled',
  'error',
]);
export type SponsorStatus = z.infer<typeof SponsorStatus>;

export const SponsorIntegration = z.object({
  name: SponsorName,
  status: SponsorStatus,
  configured: z.boolean(),
  enabled: z.boolean(),
  requiredEnvVars: z.array(z.string()),
  missingEnvVars: z.array(z.string()),
  productUse: z.string(),
  dataSent: z.string(),
  privacyNotes: z.string(),
  lastHealthCheckAt: z.string(),
  errorMessage: z.string().optional()
});
export type SponsorIntegration = z.infer<typeof SponsorIntegration>;
