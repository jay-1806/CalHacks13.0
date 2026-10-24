import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: resolve(__dirname, '../../../.env') });

export const config = {
  ORCHESTRATOR_PORT: parseInt(process.env.ORCHESTRATOR_PORT || '4317', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
  CLAUDE_MODEL: process.env.CLAUDE_MODEL || 'claude-opus-5-5',
  /** low keeps first-token latency down for interactive tutoring; raise for harder diagrams */
  CLAUDE_EFFORT: (process.env.CLAUDE_EFFORT || 'low') as 'low' | 'medium' | 'high' | 'xhigh' | 'max',
  CLAUDE_MAX_TOKENS: parseInt(process.env.CLAUDE_MAX_TOKENS || '16000', 10),
  /**
   * fast = Opus fast mode: same model, ~2.5x faster (measured 16.7s -> 6.7s per answer)
   * at premium pricing. Ignored on non-Opus models. Set CLAUDE_SPEED=standard to save cost.
   */
  CLAUDE_SPEED: (process.env.CLAUDE_SPEED === 'standard' ? 'standard' : 'fast') as 'standard' | 'fast',
  /** off = no thinking (Sonnet 5.5 / Haiku 5.5 only; Opus 5.5 always thinks) */
  CLAUDE_THINKING: (process.env.CLAUDE_THINKING === 'off' ? 'off' : 'adaptive') as 'adaptive' | 'off',

  /** Convex deployment URL (printed by `npx convex dev`), e.g. https://happy-otter-123.convex.cloud */
  CONVEX_URL: process.env.CONVEX_URL || '',
  /** Shared secret; must match `npx convex env set SCREENTUTOR_CONVEX_SECRET ...` */
  SCREENTUTOR_CONVEX_SECRET: process.env.SCREENTUTOR_CONVEX_SECRET || '',
  MEMORY_ENABLED: process.env.MEMORY_ENABLED !== 'false',
  RECENT_TURNS_CONTEXT_LIMIT: parseInt(process.env.RECENT_TURNS_CONTEXT_LIMIT || '5', 10),
  SEMANTIC_CACHE_ENABLED: process.env.SEMANTIC_CACHE_ENABLED !== 'false',
  TUTOR_CACHE_TTL_SECONDS: parseInt(process.env.TUTOR_CACHE_TTL_SECONDS || '1800', 10),
  MOSS_PROJECT_ID: process.env.MOSS_PROJECT_ID || '',
  MOSS_PROJECT_KEY: process.env.MOSS_PROJECT_KEY || '',
  MOSS_INDEX_NAME: process.env.MOSS_INDEX_NAME || 'screentutor-tutor-cache',
  /** Similarity needed to reuse an answer for a reworded question on the same screen */
  MOSS_MIN_SCORE: parseFloat(process.env.MOSS_MIN_SCORE || '0.9'),
  /** Elastic managed OTLP endpoint, e.g. https://<id>.ingest.<region>.elastic.cloud:443 (any OTLP/HTTP collector works) */
  ELASTIC_OTLP_ENDPOINT: process.env.ELASTIC_OTLP_ENDPOINT || '',
  ELASTIC_API_KEY: process.env.ELASTIC_API_KEY || '',
  ELASTIC_ENABLED: process.env.ELASTIC_ENABLED !== 'false',

  SENTRY_DSN: process.env.SENTRY_DSN || '',
  SENTRY_ENVIRONMENT: process.env.SENTRY_ENVIRONMENT || 'development',
  SENTRY_ENABLED: process.env.SENTRY_ENABLED === 'true',

  CARTESIA_API_KEY: process.env.CARTESIA_API_KEY || '',
  CARTESIA_VOICE_ID: process.env.CARTESIA_VOICE_ID || '',
  CARTESIA_TTS_MODEL: process.env.CARTESIA_TTS_MODEL || 'sonic-3.6',
  CARTESIA_STT_MODEL: process.env.CARTESIA_STT_MODEL || 'ink-2',
  CARTESIA_VERSION: process.env.CARTESIA_VERSION || '2026-08-14',
  CARTESIA_TOKEN_TTL_SECONDS: parseInt(process.env.CARTESIA_TOKEN_TTL_SECONDS || '300', 10),
  CARTESIA_ENABLED: process.env.CARTESIA_ENABLED !== 'false',

  SCREENSHOT_STORAGE: process.env.SCREENSHOT_STORAGE || 'none',
  PRIVACY_MODE_DEFAULT: process.env.PRIVACY_MODE_DEFAULT === 'true',
  DEBUG_COORDINATES: process.env.DEBUG_COORDINATES === 'true',
};
