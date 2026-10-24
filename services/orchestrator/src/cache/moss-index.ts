import { MossClient } from '@moss-js/moss';
import type { SimilarityIndex } from './semantic-cache.js';

/** The subset of MossClient this index uses (lets tests pass a fake). */
export interface MossLike {
  loadIndex(indexName: string, options?: { autoRefresh?: boolean; pollingIntervalInSeconds?: number }): Promise<string>;
  createIndex(indexName: string, docs: MossDoc[]): Promise<unknown>;
  addDocs(indexName: string, docs: MossDoc[], options?: { upsert?: boolean }): Promise<unknown>;
  query(
    indexName: string,
    query: string,
    options?: { topK?: number; filter?: unknown; minScore?: number }
  ): Promise<{ docs: Array<{ id: string; score: number }> }>;
}

interface MossDoc {
  id: string;
  text: string;
  metadata?: Record<string, string>;
}

interface MossIndexOptions {
  indexName: string;
  /** 0–1; below this a "similar" question is treated as a different question */
  minScore: number;
  refreshSeconds: number;
}

/**
 * Moss semantic index over cached questions. Queries run against the locally
 * loaded index (no network round trip); new entries reach it on the next
 * auto-refresh, which is fine for a cache.
 */
export class MossSimilarityIndex implements SimilarityIndex {
  private ready: Promise<boolean> | null = null;
  private loaded = false;

  constructor(
    private client: MossLike,
    private options: MossIndexOptions
  ) {}

  static fromCredentials(projectId: string, projectKey: string, options: MossIndexOptions): MossSimilarityIndex {
    return new MossSimilarityIndex(new MossClient(projectId, projectKey) as unknown as MossLike, options);
  }

  /**
   * Start loading at server startup. Loading takes seconds (index download +
   * embedding model), so it must never sit on a tutoring request.
   */
  warm(): Promise<boolean> {
    return this.ensureLoaded();
  }

  /** Loads (creating if needed) the index once; false means similarity is off. */
  private ensureLoaded(): Promise<boolean> {
    this.ready ??= this.load()
      .then((ok) => {
        this.loaded = ok;
        return ok;
      })
      .catch((err) => {
        console.warn('[Moss] Similarity index unavailable, exact-match cache only:', err?.message ?? err);
        return false;
      });
    return this.ready;
  }

  private async load(): Promise<boolean> {
    const { indexName, refreshSeconds } = this.options;
    const loadOptions = { autoRefresh: true, pollingIntervalInSeconds: refreshSeconds };
    try {
      await this.client.loadIndex(indexName, loadOptions);
    } catch {
      // First run: create the index with a placeholder doc, then load it.
      await this.client.createIndex(indexName, [
        { id: '__init__', text: 'screentutor cache index', metadata: { kind: 'init' } },
      ]);
      await this.client.loadIndex(indexName, loadOptions);
    }
    return true;
  }

  async findSimilar(text: string, scope: Record<string, string>): Promise<string | null> {
    // Not loaded yet: answer "no match" now rather than wait for the download.
    if (!this.loaded) {
      void this.warm();
      return null;
    }
    const result = await this.client.query(this.options.indexName, text, {
      topK: 1,
      minScore: this.options.minScore,
      filter: {
        $and: Object.entries(scope).map(([field, value]) => ({ field, condition: { $eq: value } })),
      },
    });
    const best = result.docs[0];
    return best && best.score >= this.options.minScore ? best.id : null;
  }

  async add(key: string, text: string, scope: Record<string, string>): Promise<void> {
    if (!(await this.ensureLoaded())) return;
    await this.client.addDocs(this.options.indexName, [{ id: key, text, metadata: scope }], { upsert: true });
  }
}
