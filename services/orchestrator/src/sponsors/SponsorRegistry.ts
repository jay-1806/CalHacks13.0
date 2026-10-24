import { SponsorIntegration, SponsorStatus, type SponsorName } from '@screentutor/shared';
import { config } from '../config.js';
import type { MemoryService } from '../memory/memory-service.js';
import { ConvexMemoryService } from '../memory/convex-memory.js';

type EntryInfo = Pick<SponsorIntegration, 'productUse' | 'dataSent' | 'privacyNotes'>;

/** Builds one registry row; `required` maps env var names to their current values. */
function entry(
  name: SponsorName,
  status: SponsorStatus,
  enabled: boolean,
  required: Record<string, string>,
  info: EntryInfo
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
  };
}

/** real when enabled and configured; `whenMissing` when enabled but not configured. */
function statusFor(enabled: boolean, configured: boolean, whenMissing: SponsorStatus = 'mock'): SponsorStatus {
  if (!enabled) return 'disabled';
  return configured ? 'real' : whenMissing;
}

export class SponsorRegistry {
  constructor(private memoryService: MemoryService | null) {}

  async getStatus(): Promise<SponsorIntegration[]> {
    const claudeConfigured = !!config.ANTHROPIC_API_KEY;
    const convexConfigured = !!config.CONVEX_URL && !!config.SCREENTUTOR_CONVEX_SECRET;
    const convexConnected = this.memoryService instanceof ConvexMemoryService;
    const mossConfigured = !!config.MOSS_PROJECT_ID && !!config.MOSS_PROJECT_KEY;
    const cartesiaConfigured = !!config.CARTESIA_API_KEY && !!config.CARTESIA_VOICE_ID;

    return [
      entry('claude', claudeConfigured ? 'real' : 'error', true, { ANTHROPIC_API_KEY: config.ANTHROPIC_API_KEY }, {
        productUse: `Visual screen understanding and tutoring answers (${config.CLAUDE_MODEL}, structured outputs, prompt caching).`,
        dataSent: 'Screenshots (base64) and the question, with redacted learner context.',
        privacyNotes: 'Sent only on an explicit capture; screenshots are never stored.',
      }),
      entry(
        'convex',
        !config.MEMORY_ENABLED ? 'disabled' : convexConnected ? 'real' : convexConfigured ? 'error' : 'mock',
        config.MEMORY_ENABLED,
        { CONVEX_URL: config.CONVEX_URL, SCREENTUTOR_CONVEX_SECRET: config.SCREENTUTOR_CONVEX_SECRET },
        {
          productUse: 'Learner profiles, weak concepts, session history and the response cache.',
          dataSent: 'Redacted question summaries, concept confidence, and screenshot hashes (never images).',
          privacyNotes: 'Functions require a shared secret; falls back to in-process memory when unset.',
        }
      ),
      entry(
        'moss',
        statusFor(config.SEMANTIC_CACHE_ENABLED, mossConfigured),
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
        statusFor(config.ELASTIC_ENABLED, !!config.ELASTIC_OTLP_ENDPOINT),
        config.ELASTIC_ENABLED,
        { ELASTIC_OTLP_ENDPOINT: config.ELASTIC_OTLP_ENDPOINT, ELASTIC_API_KEY: config.ELASTIC_API_KEY },
        {
          productUse: 'OpenTelemetry traces of each tutoring step, latencies and evaluation scores.',
          dataSent: 'Redacted span attributes: mode, agent, latency, evaluation results.',
          privacyNotes: 'Metadata is scrubbed by RedactionService before export; no screenshots.',
        }
      ),
      entry('sentry', statusFor(config.SENTRY_ENABLED, !!config.SENTRY_DSN), config.SENTRY_ENABLED, { SENTRY_DSN: config.SENTRY_DSN }, {
        productUse: 'Capturing runtime errors and performance traces.',
        dataSent: 'Error logs, stack traces, and system specifications.',
        privacyNotes: 'Events are redacted in beforeSend before posting to Sentry.',
      }),
      entry(
        'cartesia',
        statusFor(config.CARTESIA_ENABLED, cartesiaConfigured, 'error'),
        config.CARTESIA_ENABLED,
        { CARTESIA_API_KEY: config.CARTESIA_API_KEY, CARTESIA_VOICE_ID: config.CARTESIA_VOICE_ID },
        {
          productUse: 'Streaming Sonic text-to-speech and Ink speech-to-text over WebSocket.',
          dataSent: 'spokenText for synthesis; push-to-talk microphone audio for transcription.',
          privacyNotes: 'The renderer connects with short-lived access tokens; the API key stays on the orchestrator. Mic audio is only streamed while push-to-talk is held.',
        }
      ),
    ];
  }
}
