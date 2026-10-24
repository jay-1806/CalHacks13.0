import { TutorInput, TutorResponse, SessionTurn, LearnerProfile, RedactionService, type TutorStreamStep } from '@screentutor/shared';
import type { AIProvider } from '../providers/ai-provider.js';
import type { MemoryService } from '../memory/memory-service.js';
import type { ObservabilityService } from '../observability/observability-service.js';
import {
  SemanticCache,
  buildTutorResponseCacheKey,
  buildTutorSimilarityHint,
  hashScreenshot,
  type SimilarityIndex,
  sanitizeResponseForCache,
} from '../cache/semantic-cache.js';
import { config } from '../config.js';
import { privacyGuard, PrivacyBlockedError } from '../privacy/privacy-guard.js';
import { buildSubjectPrompt } from '../prompts/subject-packs.js';
import * as Sentry from '@sentry/node';

/**
 * One tutoring turn: privacy check → learner context → cache → Claude teaches what is
 * on screen, following the lesson pack for its subject (named in the request, or
 * chosen by Claude from the screenshot). Memory and cache writes happen in the background.
 */
export class TutorOrchestrator {
  private semanticCache: SemanticCache;
  /** Background memory writes still in flight, per session (each resolves when settled). */
  private pendingWrites = new Map<string, Promise<void>>();

  constructor(
    private aiProvider: AIProvider,
    private memory: MemoryService,
    private observability: ObservabilityService,
    similarityIndex: SimilarityIndex | null = null
  ) {
    this.semanticCache = new SemanticCache(memory, config.SEMANTIC_CACHE_ENABLED, similarityIndex);
  }

  /** `onStep` receives each finished step while the answer is still being generated (not for cached answers). */
  async handleQuestion(input: TutorInput, onStep?: (step: TutorStreamStep) => void): Promise<TutorResponse> {
    return Sentry.startSpan({ name: 'tutor.ask', op: 'http' }, async () => {
      const startTime = Date.now();
      if (input.devOverrideRedaction !== undefined) {
        RedactionService.setDevOverride(input.devOverrideRedaction);
      }
      const traceId = this.observability.startTrace('TutorRequestReceived', {
        userId: input.userId,
        sessionId: input.sessionId,
        question: input.question
      });

      try {
        // 1. Privacy check — PrivacyGuard enforces the window denylist and privacy mode
        this.observability.addSpan(traceId, 'PrivacyCheck', {
          privacyMode: input.privacyMode,
          windowTitle: input.appMetadata?.windowTitle ? '[REDACTED]' : undefined
        });
        try {
          privacyGuard.assertAllowed(input);
        } catch (err) {
          if (err instanceof PrivacyBlockedError) {
            this.observability.recordEvent(traceId, 'PrivacyCheckFailed', { reason: err.reason });
            this.observability.endTrace(traceId, { privacyBlocked: true, errorType: 'PrivacyBlockedError' });
            // Return a safe, user-friendly response instead of throwing
            return this.buildPrivacyBlockedResponse(input);
          }
          throw err;
        }
        this.observability.recordEvent(traceId, 'PrivacyCheckPassed');

        // Strip screenshot from input if not allowed (extra safety layer)
        if (!privacyGuard.isScreenshotAllowed(input)) {
          delete input.screenshotBase64;
        }
        this.observability.recordEvent(traceId, 'ScreenCaptureCompleted', {
          screenshotPresent: !!input.screenshotBase64
        });

        // 2. Learner profile and session history are independent reads — fetch them together.
        this.observability.addSpan(traceId, 'MemoryFetch');
        const contextSpan = Sentry.startInactiveSpan({ name: 'context-fetch', op: 'memory' });
        const historyWanted = config.MEMORY_ENABLED;
        // A follow-up asked before the previous turn's write landed must still see it.
        await this.pendingWrites.get(input.sessionId);
        const [profile, recentTurns] = await Promise.all([
          this.memory.getLearnerProfile(input.userId),
          historyWanted
            ? this.memory.getRecentTurns(input.sessionId, config.RECENT_TURNS_CONTEXT_LIMIT)
            : Promise.resolve([] as SessionTurn[]),
        ]).finally(() => contextSpan?.end());

        input.learnerMemory = {
          weakConcepts: profile.weakConcepts || [],
          strongConcepts: profile.strongConcepts || []
        };
        if (profile.preferredExplanationStyle) {
          input.learnerPreferences = { ...input.learnerPreferences, explanationStyle: profile.preferredExplanationStyle };
        }
        // Session history keeps follow-up questions in context
        if (historyWanted && profile.memoryEnabled !== false && recentTurns.length > 0) {
          input.recentTurns = recentTurns;
        }
        this.observability.recordEvent(traceId, 'MemoryFetched', {
          weakConceptsCount: profile.weakConcepts?.length || 0,
          recentTurnsCount: input.recentTurns?.length || 0
        });

        // 3. Response cache: exact match, then a reworded question about the same screen
        const screenshotHash = hashScreenshot(input.screenshotBase64);
        const weakConceptNames = (profile.weakConcepts || []).map((c) => c.concept);
        const canUseSemanticCache =
          config.SEMANTIC_CACHE_ENABLED &&
          !input.privacyMode &&
          !input.guide && // a guided turn depends on what the learner just did
          !(input.recentTurns && input.recentTurns.length > 0);
        const cacheKey = buildTutorResponseCacheKey(input, screenshotHash, weakConceptNames);
        const similarityHint = buildTutorSimilarityHint(input, screenshotHash, weakConceptNames);

        let response: TutorResponse | null = null;
        let fromCache = false;
        if (canUseSemanticCache) {
          const cached = await this.semanticCache.lookup<TutorResponse>(cacheKey, similarityHint);
          if (cached) {
            response = { ...cached.value, mode: input.mode };
            fromCache = true;
            this.observability.recordEvent(traceId, 'SemanticCacheHit', {
              cacheKeyPrefix: cacheKey.slice(0, 20),
              match: cached.match,
            });
          }
        }

        // 4. Claude explains and works the problem
        if (!response) {
          this.observability.addSpan(traceId, 'ClaudeModelCall');
          const aiSpan = Sentry.startInactiveSpan({ name: 'claude-vision', op: 'ai' });
          try {
            response = await this.aiProvider.analyzeScreenAndQuestion(input, onStep, buildSubjectPrompt(input.subject));
          } catch (err) {
            Sentry.captureException(err);
            throw err;
          } finally {
            aiSpan?.end();
          }
          this.observability.recordEvent(traceId, 'ClaudeModelCallCompleted');

          if (canUseSemanticCache) {
            // Not needed for this answer: write it in the background.
            void this.semanticCache.set(
              cacheKey,
              sanitizeResponseForCache(response),
              config.TUTOR_CACHE_TTL_SECONDS,
              similarityHint
            );
            this.observability.recordEvent(traceId, 'SemanticCacheSet', { cacheKeyPrefix: cacheKey.slice(0, 20) });
          }
        }
        response.mode = input.mode;

        // 5. Learner memory — only if allowed; never delays the response
        const writeMemory = privacyGuard.isMemoryWriteAllowed(input, config.MEMORY_ENABLED)
                           && profile.memoryEnabled !== false;
        if (writeMemory) {
          const write = this.persistTurn(input, response, profile, screenshotHash, fromCache)
            .then(() => this.observability.recordEvent(traceId, 'MemoryUpdated'))
            .catch((memErr) => {
              Sentry.captureException(memErr);
              console.error('Memory write failure:', memErr);
            })
            .finally(() => {
              if (this.pendingWrites.get(input.sessionId) === write) {
                this.pendingWrites.delete(input.sessionId);
              }
            });
          this.pendingWrites.set(input.sessionId, write);
          this.observability.recordEvent(traceId, 'MemoryUpdateQueued');
        }

        // 6. Delivered — quality checks go on the trace
        this.observability.addSpan(traceId, 'TutorResponseDelivered');
        const latencyMs = Date.now() - startTime;
        const evaluations = this.computeEvaluations(response);
        for (const [name, result] of Object.entries(evaluations)) {
          this.observability.recordEvaluation(traceId, name, result.score, { passed: result.passed });
        }
        this.observability.endTrace(traceId, {
          latencyMs,
          concept: response.concept,
          provider: response.provider || 'unknown',
          pointTagPresent: !!response.pointTarget,
          pointTagValid: evaluations['point_tag_valid']?.passed,
          subject: response.subject,
          responseLength: (response.spokenText || '').length,
          semanticCacheHit: fromCache,
        });

        response.observability = { traceId, latencyMs, evaluations };
        return response;
      } catch (err: any) {
        this.observability.endTrace(traceId, {
          errorType: err.name || 'Error',
          errorMessage: err.message
        });
        throw err;
      }
    });
  }

  /** Resolves once every background memory write has settled. */
  async flushMemoryWrites(): Promise<void> {
    await Promise.all(this.pendingWrites.values());
  }

  /** Learner-profile and session-turn writes for one answered question. */
  private async persistTurn(
    input: TutorInput,
    response: TutorResponse,
    profile: LearnerProfile,
    screenshotHash: string | undefined,
    fromCache: boolean
  ): Promise<void> {
    // Snapshot everything from the response now: the caller keeps using that object.
    const concept = response.concept || response.memoryUpdates?.detectedConcept;
    const totalAsked = (profile.totalQuestionsAsked || 0) + 1;
    const turn: SessionTurn = {
      sessionId: input.sessionId,
      userId: input.userId,
      timestamp: new Date().toISOString(),
      mode: input.mode,
      question: RedactionService.summarizeQuestion(input.question),
      concept,
      responseSummary: RedactionService.redactText(response.summary || ''),
      pointTargetValid: !!(response.pointTarget && response.pointTarget.x !== null),
      provider: fromCache ? `${response.provider || 'unknown'}_cached` : (response.provider || 'unknown'),
      screenshotHash
    };

    if (concept) {
      let confidenceUpdate = undefined;
      let evidence = `AI detected concept: ${concept}`;
      if (/(do not|don't) understand/i.test(input.question)) {
        const existing = profile.weakConcepts.find(c => c.concept === concept);
        confidenceUpdate = Math.min(1.0, (existing ? existing.confidence : 0.5) + 0.15);
        evidence = 'User stated they do not understand the concept';
      } else if (response.memoryUpdates?.isWeakConcept) {
        evidence = 'AI flagged this as a weak concept';
      }
      await this.memory.rememberWeakConcept(input.userId, concept, evidence, confidenceUpdate);
    }

    // Re-fetch profile to pick up updated weak concepts for recentQuestions list
    const updated = await this.memory.getLearnerProfile(input.userId);
    const recentQuestions = [
      {
        question: turn.question,
        mode: input.mode,
        detectedConcept: concept,
        timestamp: turn.timestamp
      },
      ...updated.recentQuestions,
    ].slice(0, 10);

    await Promise.all([
      this.memory.updateLearnerProfile(input.userId, {
        totalQuestionsAsked: totalAsked,
        lastModeUsed: input.mode,
        recentQuestions
      }),
      this.memory.appendSessionTurn(input.sessionId, turn),
    ]);
  }

  private buildPrivacyBlockedResponse(input: TutorInput): TutorResponse {
    return {
      mode: input.mode,
      summary: 'Screen analysis was blocked for privacy.',
      spokenText: 'Screen analysis was blocked for privacy.',
      spokenExplanation: 'Screen analysis was blocked for privacy.',
      drawings: [],
      concept: 'privacy_block',
      confidence: 1,
      provider: 'privacy_guard',
      timestamp: new Date().toISOString(),
    };
  }

  /** Cheap quality checks on every answer, recorded on the trace. */
  private computeEvaluations(response: TutorResponse): Record<string, { score: number; passed: boolean }> {
    const evals: Record<string, { score: number; passed: boolean }> = {};
    const check = (name: string, passed: boolean) => {
      evals[name] = { score: passed ? 1 : 0, passed };
    };

    const point = response.pointTarget;
    check(
      'point_tag_valid',
      !point ||
        (point.x === null && point.y === null) ||
        (typeof point.x === 'number' && typeof point.y === 'number')
    );

    // The overlay explains by drawing: an answer without any [DRAW:*] tag is a regression.
    const overlay = response.overlayText || response.visualText || '';
    check('has_drawings', /\[DRAW:(?!clear)/i.test(overlay) || response.provider === 'privacy_guard');

    // One overlay step per spoken line keeps the voice and the drawings aligned.
    const lines = (text: string) => text.split('\n').filter((l) => l.trim()).length;
    check('steps_aligned', !overlay || lines(overlay) === lines(response.spokenText || ''));

    const fullTextLower = `${response.spokenText || ''} ${response.summary || ''}`.toLowerCase();
    check('safety_redaction_passed', !/password|api_key|secret/.test(fullTextLower));

    return evals;
  }
}
