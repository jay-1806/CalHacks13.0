import { SponsorIntegration, SponsorStatus, type SponsorName } from '@screentutor/shared';
import { config } from '../config.js';
import type { MemoryService } from '../memory/memory-service.js';
import { ConvexMemoryService } from '../memory/convex-memory.js';
import type { ObservabilityService } from '../observability/observability-service.js';
import { OtlpObservabilityService } from '../observability/observability-service.js';

type EntryInfo = Pick<SponsorIntegration, 'productUse' | 'dataSent' | 'privacyNotes'>;

/** Builds one registry row; `required` maps env var names to their current values. */
function entry(
  name: SponsorName,
  status: SponsorStatus,
  enabled: boolean,
  required: Record<string, string>,
  info: EntryInfo,
  errorMessage?: string
): SponsorIntegration {
  const missing = Object.entries(required)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  return {
    name,
    status,
    configured: missing.length === 0,
    enabled,
    requiredEnvVars: Object.keys(required),
    missingEnvVars: missing,
    ...info,
    lastHealthCheckAt: new Date().toISOString(),
    ...(errorMessage ? { errorMessage } : {}),
  };
}

/**
 * Credentials alone are not "real".
 * Prefer configured (unverified) over falsely labeling mock services REAL.
 */
function statusWhenEnabled(
  enabled: boolean,
  credentialsPresent: boolean,
  externallyVerified: boolean,
  connectionFailed = false
): SponsorStatus {
  if (!enabled) return 'disabled';
  if (!credentialsPresent) return 'mock';
  if (connectionFailed) return 'error';
  if (externallyVerified) return 'real';
  return 'configured';
}

export class SponsorRegistry {
  constructor(
    private memoryService: MemoryService | null,
    private observability: ObservabilityService | null = null,
    private options: {
      /** Set true only after a diagnostic OTLP export was confirmed. */
      elasticVerified?: boolean;
      /** Set true only after a diagnostic Sentry event was confirmed. */
      sentryVerified?: boolean;
    } = {}
  ) {}

  async getStatus(): Promise<SponsorIntegration[]> {
    const claudeConfigured = !!config.ANTHROPIC_API_KEY;
    const convexConfigured = !!config.CONVEX_URL && !!config.SCREENTUTOR_CONVEX_SECRET;
    const convexConnected = this.memoryService instanceof ConvexMemoryService;
    const mossConfigured = !!config.MOSS_PROJECT_ID && !!config.MOSS_PROJECT_KEY;
    const cartesiaConfigured = !!config.CARTESIA_API_KEY && !!config.CARTESIA_VOICE_ID;
    const elasticConfigured = !!config.ELASTIC_OTLP_ENDPOINT && !!config.ELASTIC_API_KEY;
    const elasticExporting = this.observability instanceof OtlpObservabilityService;
    const sentryConfigured = !!config.SENTRY_DSN;

    return [
      entry('claude', claudeConfigured ? 'real' : 'error', true, { ANTHROPIC_API_KEY: config.ANTHROPIC_API_KEY }, {
        productUse: `Visual screen understanding and tutoring answers (${config.CLAUDE_MODEL}, structured outputs, prompt caching).`,
        dataSent: 'Screenshots (base64) and the question, with redacted learner context.',
        privacyNotes: 'Sent only on an explicit capture; screenshots are never stored.',
      }),
      entry(
        'convex',
        !config.MEMORY_ENABLED
          ? 'disabled'
          : convexConnected
            ? 'real'
            : convexConfigured
              ? 'error'
              : 'mock',
        config.MEMORY_ENABLED,
        { CONVEX_URL: config.CONVEX_URL, SCREENTUTOR_CONVEX_SECRET: config.SCREENTUTOR_CONVEX_SECRET },
        {
          productUse: 'Learner profiles, weak concepts, session history and the response cache.',
          dataSent: 'Redacted question summaries, concept confidence, and screenshot hashes (never images).',
          privacyNotes: 'Functions require a shared secret; falls back to in-process memory when unset.',
        },
        convexConfigured && !convexConnected
          ? 'CONVEX_URL/secret present but Convex ping failed — using in-process memory.'
          : undefined
      ),
      entry(
        'moss',
        statusWhenEnabled(config.SEMANTIC_CACHE_ENABLED, mossConfigured, mossConfigured),
        config.SEMANTIC_CACHE_ENABLED,
        { MOSS_PROJECT_ID: config.MOSS_PROJECT_ID, MOSS_PROJECT_KEY: config.MOSS_PROJECT_KEY },
        {
          productUse: 'Semantic cache: reuses an answer when a reworded question is asked about the same screen.',
          dataSent: 'Lower-cased question text plus scope tags (mode, screenshot hash).',
          privacyNotes: 'Matches only within the same screenshot hash; answers themselves stay in Convex.',
        }
      ),
      entry(
        'elastic',
        statusWhenEnabled(
          config.ELASTIC_ENABLED,
          elasticConfigured,
          // REAL only after a confirmed diagnostic export — exporter presence alone is CONFIGURED.
          Boolean(this.options.elasticVerified && (elasticExporting || elasticConfigured))
        ),
        config.ELASTIC_ENABLED,
        { ELASTIC_OTLP_ENDPOINT: config.ELASTIC_OTLP_ENDPOINT, ELASTIC_API_KEY: config.ELASTIC_API_KEY },
        {
          productUse: 'OpenTelemetry traces of each tutoring step, latencies and evaluation scores.',
          dataSent: 'Redacted span attributes: mode, agent, latency, evaluation results.',
          privacyNotes: 'Metadata is scrubbed by RedactionService before export; no screenshots.',
        }
      ),
      entry(
        'sentry',
        statusWhenEnabled(
          config.SENTRY_ENABLED,
          sentryConfigured,
          Boolean(this.options.sentryVerified && sentryConfigured)
        ),
        config.SENTRY_ENABLED,
        { SENTRY_DSN: config.SENTRY_DSN },
        {
          productUse: 'Capturing runtime errors and performance traces.',
          dataSent: 'Error logs, stack traces, and system specifications.',
          privacyNotes: 'Events are redacted in beforeSend before posting to Sentry.',
        }
      ),
      entry(
        'cartesia',
        !config.CARTESIA_ENABLED
          ? 'disabled'
          : cartesiaConfigured
            ? 'real'
            : 'error',
        config.CARTESIA_ENABLED,
        { CARTESIA_API_KEY: config.CARTESIA_API_KEY, CARTESIA_VOICE_ID: config.CARTESIA_VOICE_ID },
        {
          productUse: 'Streaming Sonic text-to-speech and Ink speech-to-text over WebSocket.',
          dataSent: 'spokenText for synthesis; push-to-talk microphone audio for transcription.',
          privacyNotes:
            'The renderer connects with short-lived access tokens; the API key stays on the orchestrator. Mic audio is only streamed while push-to-talk is held.',
        }
      ),
    ];
  }
}
