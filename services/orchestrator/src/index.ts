import { patchConsole } from '@screentutor/shared';
patchConsole();

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config.js';
import type { AIProvider } from './providers/ai-provider.js';
import type { ResearchIntegration } from './integrations/research.js';
import type { CoDriveIntegration } from './integrations/codrive.js';
import type { CartesiaIntegration } from './integrations/cartesia.js';
import type { ObservabilityService } from './observability/observability-service.js';
import type { TutorOrchestrator } from './orchestrator/tutor-orchestrator.js';
import type { SimilarityIndex } from './cache/semantic-cache.js';
import * as Sentry from '@sentry/node';
import { initOrchestratorSentry } from './observability/sentry.js';

// Initialize Sentry error tracing
initOrchestratorSentry();

import { healthRoutes } from './routes/health.js';
import { tutorRoutes } from './routes/tutor.js';
import { memoryRoutes } from './routes/memory.js';
import { researchRoutes } from './routes/research.js';
import { actionRoutes } from './routes/actions.js';
import { sponsorRoutes } from './routes/sponsors.js';
import { ttsRoutes } from './routes/tts.js';

// Setup fastify instance
const fastify = Fastify({ logger: true });

// Decorate fastify so routes can access services
declare module 'fastify' {
  interface FastifyInstance {
    getOrchestrator(): Promise<TutorOrchestrator>;
    getMemory(): Promise<any>;
    getResearch(): Promise<ResearchIntegration>;
    getCoDrive(): Promise<CoDriveIntegration>;
    getCartesia(): Promise<CartesiaIntegration>;
    getObservability(): Promise<ObservabilityService>;
  }
}

let aiProviderInstance: AIProvider | null = null;
async function getAIProvider(): Promise<AIProvider> {
  if (!aiProviderInstance) {
    if (!config.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is missing! Please provide it in the .env file.");
    }
    const { ClaudeProvider } = await import('./providers/anthropic-provider.js');
    aiProviderInstance = new ClaudeProvider(config.ANTHROPIC_API_KEY);
  }
  return aiProviderInstance;
}

let memoryInstance: any = null;
async function getMemory(): Promise<any> {
  if (!memoryInstance) {
    if (config.CONVEX_URL && config.SCREENTUTOR_CONVEX_SECRET) {
      const { ConvexMemoryService } = await import('./memory/convex-memory.js');
      memoryInstance = await ConvexMemoryService.create(config.CONVEX_URL, config.SCREENTUTOR_CONVEX_SECRET);
    } else {
      const { InMemoryService } = await import('./memory/in-memory.js');
      console.warn('CONVEX_URL / SCREENTUTOR_CONVEX_SECRET not set — learner memory is in-process only.');
      memoryInstance = new InMemoryService();
    }
  }
  return memoryInstance;
}

let researchInstance: ResearchIntegration | null = null;
async function getResearch(): Promise<ResearchIntegration> {
  if (!researchInstance) {
    if (config.APIFY_ENABLED && config.APIFY_API_TOKEN) {
      const { ApifyResearchService } = await import('./integrations/apify.js');
      const mem = await getMemory();
      researchInstance = new ApifyResearchService(
        { token: config.APIFY_API_TOKEN, maxResults: config.APIFY_MAX_RESULTS, timeoutMs: config.APIFY_TIMEOUT_MS },
        mem
      );
    } else {
      const { MockResearchService } = await import('./integrations/research.js');
      researchInstance = new MockResearchService();
    }
  }
  return researchInstance;
}

let codriveInstance: CoDriveIntegration | null = null;
async function getCoDrive(): Promise<CoDriveIntegration> {
  if (!codriveInstance) {
    if (config.CODRIVE_ENABLED && config.ANTHROPIC_API_KEY) {
      const { ClaudeCoDriveService } = await import('./integrations/claude-codrive.js');
      codriveInstance = new ClaudeCoDriveService(config.ANTHROPIC_API_KEY, config.ENABLE_SAFE_ACTIONS);
    } else {
      const { MockCoDriveService } = await import('./integrations/codrive.js');
      codriveInstance = new MockCoDriveService();
    }
  }
  return codriveInstance;
}

let cartesiaInstance: CartesiaIntegration | null = null;
async function getCartesia(): Promise<CartesiaIntegration> {
  if (!cartesiaInstance) {
    const { CartesiaService, MockCartesiaService } = await import('./integrations/cartesia.js');
    cartesiaInstance = (config.CARTESIA_ENABLED && config.CARTESIA_API_KEY && config.CARTESIA_VOICE_ID)
      ? new CartesiaService({
          apiKey: config.CARTESIA_API_KEY,
          voiceId: config.CARTESIA_VOICE_ID,
          ttsModel: config.CARTESIA_TTS_MODEL,
          sttModel: config.CARTESIA_STT_MODEL,
          version: config.CARTESIA_VERSION,
          tokenTtlSeconds: config.CARTESIA_TOKEN_TTL_SECONDS,
        })
      : new MockCartesiaService();
  }
  return cartesiaInstance;
}

let observabilityInstance: ObservabilityService | null = null;
async function getObservability(): Promise<ObservabilityService> {
  if (!observabilityInstance) {
    const { OtlpObservabilityService, NoopObservabilityService } = await import('./observability/observability-service.js');
    observabilityInstance = (config.ELASTIC_ENABLED && config.ELASTIC_OTLP_ENDPOINT)
      ? new OtlpObservabilityService({
          endpoint: config.ELASTIC_OTLP_ENDPOINT,
          headers: config.ELASTIC_API_KEY ? { Authorization: `ApiKey ${config.ELASTIC_API_KEY}` } : undefined,
          environment: config.NODE_ENV,
        })
      : new NoopObservabilityService();
  }
  return observabilityInstance;
}

async function getSimilarityIndex(): Promise<SimilarityIndex | null> {
  if (!config.SEMANTIC_CACHE_ENABLED || !config.MOSS_PROJECT_ID || !config.MOSS_PROJECT_KEY) return null;
  const { MossSimilarityIndex } = await import('./cache/moss-index.js');
  const index = MossSimilarityIndex.fromCredentials(config.MOSS_PROJECT_ID, config.MOSS_PROJECT_KEY, {
    indexName: config.MOSS_INDEX_NAME,
    minScore: config.MOSS_MIN_SCORE,
    refreshSeconds: 30,
  });
  void index.warm();
  return index;
}

let orchestratorInstance: TutorOrchestrator | null = null;
async function getOrchestrator(): Promise<TutorOrchestrator> {
  if (!orchestratorInstance) {
    const aiProv = await getAIProvider();
    const mem = await getMemory();
    const bb = await getResearch();
    const sim = await getCoDrive();
    const obs = await getObservability();

    const { AgentRouter } = await import('./agents/agent-router.js');
    const { TutorOrchestrator } = await import('./orchestrator/tutor-orchestrator.js');

    const agentRouter = new AgentRouter(aiProv, mem, bb, obs);
    orchestratorInstance = new TutorOrchestrator(aiProv, mem, agentRouter, bb, sim, obs, await getSimilarityIndex());
  }
  return orchestratorInstance;
}

fastify.decorate('getOrchestrator', getOrchestrator);
fastify.decorate('getMemory', getMemory);
fastify.decorate('getResearch', getResearch);
fastify.decorate('getCoDrive', getCoDrive);
fastify.decorate('getCartesia', getCartesia);
fastify.decorate('getObservability', getObservability);

import { RedactionService } from '@screentutor/shared';

// Global error handler to redact error responses
fastify.setErrorHandler((error: any, request, reply) => {
  fastify.log.error(error);
  const safeError = RedactionService.redactError(error);
  reply.status(error.statusCode || 500).send({
    statusCode: error.statusCode || 500,
    error: safeError.name || 'Internal Server Error',
    message: safeError.message || 'An error occurred'
  });
});

// Register plugins
await fastify.register(cors, { origin: '*' });

// Register routes
await fastify.register(healthRoutes);
await fastify.register(tutorRoutes);
await fastify.register(memoryRoutes);
await fastify.register(researchRoutes);
await fastify.register(actionRoutes);
await fastify.register(sponsorRoutes);
await fastify.register(ttsRoutes);

// Start server
const start = async () => {
  try {
    await fastify.listen({ port: config.ORCHESTRATOR_PORT, host: '0.0.0.0' });
    console.log(`Server listening at http://localhost:${config.ORCHESTRATOR_PORT}`);
    // Build services now so the first question doesn't pay for Convex/Moss setup.
    getOrchestrator().catch((err) => console.warn('Orchestrator warm-up failed:', err.message));
    console.log(`AI Provider: ${config.ANTHROPIC_API_KEY ? 'claude' : 'none'}`);
    console.log(`Apify Research Configured: ${!!config.APIFY_API_TOKEN} (Enabled: ${config.APIFY_ENABLED})`);
    console.log(`Co-drive (Claude computer use): ${config.CODRIVE_ENABLED && !!config.ANTHROPIC_API_KEY} (Desktop control: ${config.ENABLE_SAFE_ACTIONS})`);
    console.log(`Cartesia Configured: ${!!config.CARTESIA_API_KEY && !!config.CARTESIA_VOICE_ID} (Enabled: ${config.CARTESIA_ENABLED})`);
  } catch (err) {
    Sentry.captureException(err);
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
