import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SponsorRegistry } from '../sponsors/SponsorRegistry.js';
import { InMemoryService } from '../memory/in-memory.js';
import { ConvexMemoryService } from '../memory/convex-memory.js';
import { NoopObservabilityService, OtlpObservabilityService } from '../observability/observability-service.js';
import { config } from '../config.js';

const fakeConvex = { query: async () => 'ok', mutation: async () => null };

describe('SponsorRegistry Configurations', () => {
  let originalConfig: typeof config;

  beforeEach(() => {
    originalConfig = { ...config };
  });

  afterEach(() => {
    Object.assign(config, originalConfig);
  });

  const find = async (
    name: string,
    memory: any = new InMemoryService(),
    obs: any = new NoopObservabilityService(),
    opts: { elasticVerified?: boolean; sentryVerified?: boolean } = {}
  ) => (await new SponsorRegistry(memory, obs, opts).getStatus()).find((s) => s.name === name)!;

  it('reports Claude as error without a key and real with one', async () => {
    config.ANTHROPIC_API_KEY = '';
    let claude = await find('claude');
    expect(claude.status).toBe('error');
    expect(claude.missingEnvVars).toEqual(['ANTHROPIC_API_KEY']);

    config.ANTHROPIC_API_KEY = 'sk-ant-test';
    claude = await find('claude');
    expect(claude.status).toBe('real');
    expect(claude.configured).toBe(true);
  });

  it('reports Convex as real only when the Convex service is connected', async () => {
    config.MEMORY_ENABLED = true;
    config.CONVEX_URL = '';
    config.SCREENTUTOR_CONVEX_SECRET = '';
    expect((await find('convex')).status).toBe('mock');

    config.CONVEX_URL = 'https://happy-otter-123.convex.cloud';
    config.SCREENTUTOR_CONVEX_SECRET = 'secret';
    expect((await find('convex')).status).toBe('error'); // configured but fell back to memory

    const connected = new ConvexMemoryService(fakeConvex, 'secret');
    expect((await find('convex', connected)).status).toBe('real');

    config.MEMORY_ENABLED = false;
    expect((await find('convex', connected)).status).toBe('disabled');
  });

  it('reports Elastic as configured (not real) until export is verified', async () => {
    config.ELASTIC_ENABLED = true;
    config.ELASTIC_OTLP_ENDPOINT = '';
    config.ELASTIC_API_KEY = '';
    expect((await find('elastic')).status).toBe('mock');
    expect((await find('elastic')).configured).toBe(false);

    config.ELASTIC_OTLP_ENDPOINT = 'https://x.ingest.elastic.cloud:443';
    config.ELASTIC_API_KEY = 'key';
    // Credentials alone — still not REAL without a verified diagnostic export.
    expect((await find('elastic')).status).toBe('configured');
    expect((await find('elastic')).configured).toBe(true);

    const otlp = new OtlpObservabilityService(
      { endpoint: 'https://x.ingest.elastic.cloud:443', headers: { Authorization: 'ApiKey key' } },
      { export: async () => ({ code: 0 }), shutdown: async () => {} } as any
    );
    expect((await find('elastic', new InMemoryService(), otlp)).status).toBe('configured');
    expect(
      (await find('elastic', new InMemoryService(), otlp, { elasticVerified: true })).status
    ).toBe('real');
  });

  it('reports Sentry as disabled without enable flag, configured with DSN until verified', async () => {
    config.SENTRY_ENABLED = false;
    config.SENTRY_DSN = '';
    expect((await find('sentry')).status).toBe('disabled');

    config.SENTRY_ENABLED = true;
    config.SENTRY_DSN = '';
    expect((await find('sentry')).status).toBe('mock');

    config.SENTRY_DSN = 'https://example.ingest.sentry.io/1';
    expect((await find('sentry')).status).toBe('configured');
    expect((await find('sentry', new InMemoryService(), new NoopObservabilityService(), { sentryVerified: true })).status).toBe(
      'real'
    );
  });

  it('reports Moss from credentials', async () => {
    config.SEMANTIC_CACHE_ENABLED = true;
    config.MOSS_PROJECT_ID = '';
    config.MOSS_PROJECT_KEY = '';
    expect((await find('moss')).status).toBe('mock');

    config.MOSS_PROJECT_ID = 'p';
    config.MOSS_PROJECT_KEY = 'k';
    expect((await find('moss')).status).toBe('real');
  });

  it('lists exactly the current sponsor integrations', async () => {
    const names = (await new SponsorRegistry(new InMemoryService()).getStatus()).map((s) => s.name);
    expect(names).toEqual(['claude', 'convex', 'moss', 'elastic', 'sentry', 'cartesia']);
  });
});
