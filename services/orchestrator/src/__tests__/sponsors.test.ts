import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SponsorRegistry } from '../sponsors/SponsorRegistry.js';
import { InMemoryService } from '../memory/in-memory.js';
import { ConvexMemoryService } from '../memory/convex-memory.js';
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

  const find = async (name: string, memory: any = new InMemoryService()) =>
    (await new SponsorRegistry(memory).getStatus()).find((s) => s.name === name)!;

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

  it('reports Moss and Elastic from their credentials', async () => {
    config.SEMANTIC_CACHE_ENABLED = true;
    config.MOSS_PROJECT_ID = '';
    config.MOSS_PROJECT_KEY = '';
    config.ELASTIC_ENABLED = true;
    config.ELASTIC_OTLP_ENDPOINT = '';
    expect((await find('moss')).status).toBe('mock');
    expect((await find('elastic')).status).toBe('mock');

    config.MOSS_PROJECT_ID = 'p';
    config.MOSS_PROJECT_KEY = 'k';
    config.ELASTIC_OTLP_ENDPOINT = 'https://x.ingest.elastic.cloud:443';
    expect((await find('moss')).status).toBe('real');
    expect((await find('elastic')).status).toBe('real');

  });

  it('lists exactly the current sponsor integrations', async () => {
    const names = (await new SponsorRegistry(new InMemoryService()).getStatus()).map((s) => s.name);
    expect(names).toEqual(['claude', 'convex', 'moss', 'elastic', 'sentry', 'cartesia']);
  });
});
