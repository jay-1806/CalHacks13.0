import { z } from 'zod';

export const SponsorName = z.enum([
  'claude',
  'codrive',
  'convex',
  'moss',
  'apify',
  'fetch_agentverse',
  'elastic',
  'sentry',
  'cartesia'
]);
export type SponsorName = z.infer<typeof SponsorName>;

export const SponsorStatus = z.enum([
  'real',
  'mock',
  'disabled',
  'error'
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
