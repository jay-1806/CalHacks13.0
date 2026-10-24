import { v } from 'convex/values';
import { query, mutation, internalMutation, type DatabaseReader } from './lib';
import { explanationStyle, quizOutcome, recentQuestion, sessionTurn } from './schema';

/**
 * Every public function takes the orchestrator's shared secret. Set it once with
 * `npx convex env set SCREENTUTOR_CONVEX_SECRET <value>` and the same value in the
 * orchestrator's .env. Without it, nothing is readable from the deployment URL.
 */
function assertService(secret: string): void {
  const expected = process.env.SCREENTUTOR_CONVEX_SECRET;
  if (!expected || secret !== expected) {
    throw new Error('Unauthorized');
  }
}

async function findProfile(db: DatabaseReader, userId: string) {
  return db
    .query('profiles')
    .withIndex('by_user', (q) => q.eq('userId', userId))
    .unique();
}

function defaultProfile(userId: string) {
  return {
    userId,
    strongConcepts: [] as string[],
    recentQuestions: [],
    quizOutcomes: [],
    totalQuestionsAsked: 0,
    lastModeUsed: '',
    lastActiveAt: new Date().toISOString(),
    memoryEnabled: true,
  };
}

function stripSystemFields<T extends { _id?: unknown; _creationTime?: unknown }>(doc: T) {
  const { _id, _creationTime, ...rest } = doc;
  return rest;
}

export const getProfile = query({
  args: { secret: v.string(), userId: v.string() },
  handler: async (ctx, { secret, userId }) => {
    assertService(secret);
    const profile = await findProfile(ctx.db, userId);
    const weak = await ctx.db
      .query('weakConcepts')
      .withIndex('by_user_concept', (q) => q.eq('userId', userId))
      .collect();
    return {
      ...(profile ? stripSystemFields(profile) : defaultProfile(userId)),
      weakConcepts: weak.map(({ _id, _creationTime, userId: _u, ...concept }) => concept),
    };
  },
});

export const updateProfile = mutation({
  args: {
    secret: v.string(),
    userId: v.string(),
    patch: v.object({
      preferredExplanationStyle: v.optional(explanationStyle),
      strongConcepts: v.optional(v.array(v.string())),
      recentQuestions: v.optional(v.array(recentQuestion)),
      quizOutcomes: v.optional(v.array(quizOutcome)),
      totalQuestionsAsked: v.optional(v.number()),
      lastModeUsed: v.optional(v.string()),
      memoryEnabled: v.optional(v.boolean()),
    }),
  },
  handler: async (ctx, { secret, userId, patch }) => {
    assertService(secret);
    const lastActiveAt = new Date().toISOString();
    const existing = await findProfile(ctx.db, userId);
    if (existing) {
      await ctx.db.patch(existing._id, { ...patch, lastActiveAt });
    } else {
      await ctx.db.insert('profiles', { ...defaultProfile(userId), ...patch, lastActiveAt });
    }
  },
});

export const rememberWeakConcept = mutation({
  args: {
    secret: v.string(),
    userId: v.string(),
    concept: v.string(),
    evidence: v.string(),
    confidence: v.optional(v.number()),
  },
  handler: async (ctx, { secret, userId, concept, evidence, confidence }) => {
    assertService(secret);
    const profile = await findProfile(ctx.db, userId);
    if (profile && profile.memoryEnabled === false) return;

    const now = new Date().toISOString();
    const existing = await ctx.db
      .query('weakConcepts')
      .withIndex('by_user_concept', (q) => q.eq('userId', userId).eq('concept', concept))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        evidence,
        timesSeen: existing.timesSeen + 1,
        confidence: Math.min(1.0, confidence !== undefined ? confidence : existing.confidence + 0.1),
        lastSeenAt: now,
      });
    } else {
      await ctx.db.insert('weakConcepts', {
        userId,
        concept,
        evidence,
        confidence: confidence !== undefined ? confidence : 0.5,
        timesSeen: 1,
        firstSeenAt: now,
        lastSeenAt: now,
      });
    }
  },
});

export const markConceptImproved = mutation({
  args: { secret: v.string(), userId: v.string(), concept: v.string() },
  handler: async (ctx, { secret, userId, concept }) => {
    assertService(secret);
    const weak = await ctx.db
      .query('weakConcepts')
      .withIndex('by_user_concept', (q) => q.eq('userId', userId).eq('concept', concept))
      .unique();
    if (weak) await ctx.db.delete(weak._id);

    const profile = await findProfile(ctx.db, userId);
    if (!profile) {
      await ctx.db.insert('profiles', { ...defaultProfile(userId), strongConcepts: [concept] });
    } else if (!profile.strongConcepts.includes(concept)) {
      await ctx.db.patch(profile._id, { strongConcepts: [...profile.strongConcepts, concept] });
    }
  },
});

export const appendTurn = mutation({
  args: { secret: v.string(), turn: sessionTurn },
  handler: async (ctx, { secret, turn }) => {
    assertService(secret);
    const profile = await findProfile(ctx.db, turn.userId);
    if (profile && profile.memoryEnabled === false) return;
    await ctx.db.insert('sessionTurns', turn);
  },
});

export const recentTurns = query({
  args: { secret: v.string(), sessionId: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { secret, sessionId, limit }) => {
    assertService(secret);
    const q = ctx.db
      .query('sessionTurns')
      .withIndex('by_session', (idx) => idx.eq('sessionId', sessionId))
      .order('desc');
    const rows = limit !== undefined ? await q.take(limit) : await q.collect();
    return rows.reverse().map(stripSystemFields);
  },
});

export const clearUser = mutation({
  args: { secret: v.string(), userId: v.string() },
  handler: async (ctx, { secret, userId }) => {
    assertService(secret);
    const profile = await findProfile(ctx.db, userId);
    if (profile) await ctx.db.delete(profile._id);
    const weak = await ctx.db
      .query('weakConcepts')
      .withIndex('by_user_concept', (q) => q.eq('userId', userId))
      .collect();
    const turns = await ctx.db
      .query('sessionTurns')
      .withIndex('by_user', (q) => q.eq('userId', userId))
      .collect();
    await Promise.all([...weak, ...turns].map((doc) => ctx.db.delete(doc._id)));
  },
});

export const cacheGet = query({
  args: { secret: v.string(), key: v.string() },
  handler: async (ctx, { secret, key }) => {
    assertService(secret);
    const entry = await ctx.db
      .query('cacheEntries')
      .withIndex('by_key', (q) => q.eq('key', key))
      .unique();
    if (!entry || entry.expiresAt <= Date.now()) return null;
    return entry.value;
  },
});

export const cacheSet = mutation({
  args: { secret: v.string(), key: v.string(), value: v.string(), ttlSeconds: v.number() },
  handler: async (ctx, { secret, key, value, ttlSeconds }) => {
    assertService(secret);
    const expiresAt = Date.now() + ttlSeconds * 1000;
    const existing = await ctx.db
      .query('cacheEntries')
      .withIndex('by_key', (q) => q.eq('key', key))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { value, expiresAt });
    } else {
      await ctx.db.insert('cacheEntries', { key, value, expiresAt });
    }
  },
});

/** Run by the cron in crons.ts. */
export const purgeExpiredCache = internalMutation({
  args: {},
  handler: async (ctx) => {
    const expired = await ctx.db
      .query('cacheEntries')
      .withIndex('by_expiry', (q) => q.lt('expiresAt', Date.now()))
      .take(500);
    await Promise.all(expired.map((doc) => ctx.db.delete(doc._id)));
  },
});

export const ping = query({
  args: { secret: v.string() },
  handler: async (_ctx, { secret }) => {
    assertService(secret);
    return 'ok';
  },
});
