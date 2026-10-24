import type { ResearchResult } from '@screentutor/shared';
import type { MemoryService } from '../memory/memory-service.js';
import type { ResearchIntegration } from './research.js';
import { SemanticCache, buildResearchCacheKey } from '../cache/semantic-cache.js';
import { config } from '../config.js';
import * as Sentry from '@sentry/node';

/** Apify RAG Web Browser actor in Standby mode: Google search + page scrape in one call. */
export const APIFY_RAG_SEARCH_URL = 'https://rag-web-browser.apify.actor/search';

export interface RagWebResult {
  searchResult?: { title?: string; description?: string; url?: string };
  metadata?: { title?: string; description?: string; url?: string };
  markdown?: string;
}

interface ApifyOptions {
  token: string;
  maxResults: number;
  timeoutMs: number;
}

/**
 * Research mode over the live web. Unlike the old Browserbase path (which guessed
 * a Wikipedia URL from the concept name), this searches for the concept at the
 * learner's level and summarizes the top pages.
 */
export class ApifyResearchService implements ResearchIntegration {
  private cache: SemanticCache;

  constructor(
    private options: ApifyOptions,
    memory?: MemoryService,
    private fetchImpl: typeof fetch = fetch
  ) {
    this.cache = new SemanticCache(memory ?? null, config.SEMANTIC_CACHE_ENABLED);
  }

  isConfigured(): boolean {
    return !!this.options.token;
  }

  async researchConcept(concept: string, learnerLevel: string, currentScreenSummary: string): Promise<ResearchResult> {
    const cacheKey = buildResearchCacheKey('research', [concept, learnerLevel, currentScreenSummary]);
    const cached = await this.cache.get<ResearchResult>(cacheKey);
    if (cached) {
      return { ...cached, providerMetadata: { ...cached.providerMetadata, cacheHit: true } };
    }

    const topic = humanize(concept);
    try {
      const pages = await this.search(`${topic} explained ${learnerLevel} level`);
      if (pages.length === 0) {
        throw new Error('No search results');
      }
      const [top] = pages;
      const result: ResearchResult = {
        title: `Web Research: ${topic}`,
        summary: firstParagraph(top.markdown) || top.searchResult?.description || `Top result for ${topic}.`,
        keyTakeaways: pages
          .map((page) => page.searchResult?.description || page.metadata?.description || '')
          .filter(Boolean)
          .slice(0, 3),
        suggestedPractice: `Work one example of ${topic} from ${hostOf(top)}, then compare it with the step on your screen.`,
        confidence: 0.85,
        sourceUrl: top.searchResult?.url || top.metadata?.url,
        providerMetadata: {
          source: 'apify_rag_web_browser',
          sources: pages.map((p) => p.searchResult?.url || p.metadata?.url).filter(Boolean),
        },
      };
      await this.cache.set(cacheKey, result, config.RESEARCH_CACHE_TTL_SECONDS);
      return result;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      Sentry.captureException(err);
      console.error('Apify research failed:', err);
      return {
        title: `Web Research (Fallback): ${topic}`,
        summary: `Could not reach live web research: ${message}`,
        keyTakeaways: ['Check APIFY_API_TOKEN.', 'Check network availability.'],
        suggestedPractice: 'Seek tutorials on open platforms like Khan Academy.',
        confidence: 0.5,
        providerMetadata: { error: message },
      };
    }
  }

  async fetchPageSummary(url: string): Promise<string> {
    const cacheKey = buildResearchCacheKey('summary', [url]);
    const cached = await this.cache.get<string>(cacheKey);
    if (cached) return cached;
    try {
      // A URL as the query makes the actor scrape that page directly.
      const [page] = await this.search(url, 1);
      const summary = firstParagraph(page?.markdown) || 'No readable content found on that page.';
      await this.cache.set(cacheKey, summary, config.RESEARCH_CACHE_TTL_SECONDS);
      return summary;
    } catch (err: unknown) {
      Sentry.captureException(err);
      return `Failed to fetch page summary: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  async findSimplerExplanation(concept: string): Promise<string> {
    const cacheKey = buildResearchCacheKey('simpler', [concept]);
    const cached = await this.cache.get<string>(cacheKey);
    if (cached) return cached;
    try {
      const [page] = await this.search(`${humanize(concept)} explained simply for beginners`, 1);
      const explanation = firstParagraph(page?.markdown) || `No simple explanation found for ${humanize(concept)}.`;
      await this.cache.set(cacheKey, explanation, config.RESEARCH_CACHE_TTL_SECONDS);
      return explanation;
    } catch (err: unknown) {
      Sentry.captureException(err);
      return `Could not load simpler explanation: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  async generatePracticeFromWebResource(concept: string): Promise<string> {
    const cacheKey = buildResearchCacheKey('practice', [concept]);
    const cached = await this.cache.get<string>(cacheKey);
    if (cached) return cached;
    try {
      const [page] = await this.search(`${humanize(concept)} practice problems with solutions`, 1);
      const practice = page
        ? `Practice from ${hostOf(page)}: ${firstParagraph(page.markdown) || page.searchResult?.title || ''}`.trim()
        : `Try a worked example of ${humanize(concept)}.`;
      await this.cache.set(cacheKey, practice, config.RESEARCH_CACHE_TTL_SECONDS);
      return practice;
    } catch (err: unknown) {
      Sentry.captureException(err);
      return `Could not load practice problems: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  private async search(query: string, maxResults = this.options.maxResults): Promise<RagWebResult[]> {
    const params = new URLSearchParams({
      query,
      maxResults: String(maxResults),
      outputFormats: 'markdown',
    });
    const res = await this.fetchImpl(`${APIFY_RAG_SEARCH_URL}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${this.options.token}` },
      signal: AbortSignal.timeout(this.options.timeoutMs),
    });
    if (!res.ok) {
      throw new Error(`Apify RAG Web Browser error ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    return (await res.json()) as RagWebResult[];
  }
}

function humanize(concept: string): string {
  return concept.replace(/_/g, ' ');
}

function hostOf(page: RagWebResult): string {
  const url = page.searchResult?.url || page.metadata?.url;
  try {
    return url ? new URL(url).hostname.replace(/^www\./, '') : 'the web';
  } catch {
    return 'the web';
  }
}

/** First prose paragraph of a markdown page, skipping headings, images and nav lists. */
export function firstParagraph(markdown?: string, maxLength = 400): string {
  if (!markdown) return '';
  const paragraph = markdown
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .find(
      (block) =>
        block.length > 80 &&
        !block.startsWith('#') &&
        !block.startsWith('![') &&
        !/^([-*|]|\d+\.)\s/.test(block)
    );
  if (!paragraph) return '';
  const clean = paragraph
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ');
  return clean.length > maxLength ? `${clean.slice(0, maxLength).trimEnd()}…` : clean;
}
