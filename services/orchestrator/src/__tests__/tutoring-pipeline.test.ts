import { describe, expect, it } from 'vitest';
import {
  algebraNarrationFixture,
  applyFailActiveTurn,
  applySyncActiveTurn,
  canSubmitTutorQuestion,
  nextAiPhase,
  panelOpensNearLauncherNotCorner,
  selectCaptureForQuestion,
  type PipelineTurn,
} from '@screentutor/shared';

/** Idle hook flags after capture aborts before askQuestion (useTutor error still null). */
const IDLE_AFTER_CAPTURE_FAIL = {
  error: null as string | null,
  isScanning: false,
  isLoading: false,
  isStreaming: false,
  isResponseReady: false,
  responseDelivered: false,
  hasResponse: false,
};

/**
 * Pre-fix sync behavior: ignored turn.aiPhase and forced Thinking from idle hooks.
 * Kept only to document the Part 6.3 regression (must NOT be used in production).
 */
function buggySyncAfterCaptureFail(turns: PipelineTurn[], activeId: string): PipelineTurn[] {
  return turns.map((turn) => {
    if (turn.id !== activeId) return turn;
    if (IDLE_AFTER_CAPTURE_FAIL.error) {
      return { ...turn, aiPhase: 'error' as const, error: IDLE_AFTER_CAPTURE_FAIL.error };
    }
    if (IDLE_AFTER_CAPTURE_FAIL.isScanning) {
      return { ...turn, aiPhase: 'scanning' as const };
    }
    if (!IDLE_AFTER_CAPTURE_FAIL.isResponseReady) {
      return { ...turn, aiPhase: 'thinking' as const };
    }
    return turn;
  });
}

describe('Part 4.0 — text submission guards', () => {
  it('allows exactly one send when idle with a non-empty question', () => {
    expect(
      canSubmitTutorQuestion({ isLoading: false, activePhase: null, question: '3(x+2)=21' })
    ).toBe(true);
  });

  it('blocks send while loading or processing', () => {
    expect(
      canSubmitTutorQuestion({ isLoading: true, activePhase: null, question: 'hi' })
    ).toBe(false);
    expect(
      canSubmitTutorQuestion({ isLoading: false, activePhase: 'thinking', question: 'hi' })
    ).toBe(false);
    expect(
      canSubmitTutorQuestion({ isLoading: false, activePhase: 'scanning', question: 'hi' })
    ).toBe(false);
    expect(
      canSubmitTutorQuestion({ isLoading: false, activePhase: 'outputting', question: 'hi' })
    ).toBe(false);
  });

  it('allows a follow-up after done or error', () => {
    expect(
      canSubmitTutorQuestion({ isLoading: false, activePhase: 'done', question: 'Why distribute?' })
    ).toBe(true);
    expect(
      canSubmitTutorQuestion({ isLoading: false, activePhase: 'error', question: 'retry' })
    ).toBe(true);
  });

  it('rejects empty drafts', () => {
    expect(canSubmitTutorQuestion({ isLoading: false, activePhase: null, question: '  ' })).toBe(
      false
    );
  });
});

describe('Part 4.0 — processing phase machine', () => {
  it('moves scanning → thinking → outputting → done', () => {
    expect(
      nextAiPhase({
        error: null,
        isScanning: true,
        isResponseReady: false,
        responseDelivered: false,
        hasResponse: false,
      })
    ).toBe('scanning');
    expect(
      nextAiPhase({
        error: null,
        isScanning: false,
        isResponseReady: false,
        responseDelivered: false,
        hasResponse: false,
      })
    ).toBe('thinking');
    expect(
      nextAiPhase({
        error: null,
        isScanning: false,
        isResponseReady: true,
        responseDelivered: false,
        hasResponse: true,
      })
    ).toBe('outputting');
    expect(
      nextAiPhase({
        error: null,
        isScanning: false,
        isResponseReady: true,
        responseDelivered: true,
        hasResponse: true,
      })
    ).toBe('done');
  });

  it('surfaces errors instead of staying in Thinking', () => {
    expect(
      nextAiPhase({
        error: 'blocked',
        isScanning: false,
        isResponseReady: false,
        responseDelivered: false,
        hasResponse: false,
      })
    ).toBe('error');
  });
});

describe('Part 4.0 — capture lifecycle', () => {
  it('consumes a pending region exactly once', () => {
    const region = { id: 'region-a' };
    const first = selectCaptureForQuestion(region, { id: 'full' });
    expect(first.used).toEqual(region);
    expect(first.pendingAfter).toBeNull();
    const second = selectCaptureForQuestion(first.pendingAfter, { id: 'full' });
    expect(second.used).toEqual({ id: 'full' });
  });
});

describe('Part 4.0 — capture failure unlocks conversation', () => {
  it('failActiveTurn marks the in-flight turn as error', () => {
    const turns = [
      { id: 't1', userText: '3(x+2)=21', aiPhase: 'scanning' as const },
    ];
    const next = applyFailActiveTurn(turns, 't1', 'Screen capture was blocked or unavailable.');
    expect(next[0].aiPhase).toBe('error');
    expect(next[0].error).toMatch(/capture/i);
    expect(
      canSubmitTutorQuestion({
        isLoading: false,
        activePhase: next[0].aiPhase,
        question: 'try again',
      })
    ).toBe(true);
  });
});

describe('Part 6.3 — capture failure must survive syncActiveTurn', () => {
  const captureMsg = 'Screen capture was blocked or unavailable.';

  it('documents the pre-fix bug: sync after failActiveTurn revived Thinking', () => {
    const started: PipelineTurn[] = [{ id: 't1', userText: 'Solve 3(x+2)=21', aiPhase: 'scanning' }];
    const failed = applyFailActiveTurn(started, 't1', captureMsg);
    const buggy = buggySyncAfterCaptureFail(failed, 't1');
    expect(buggy[0].aiPhase).toBe('thinking');
    expect(
      canSubmitTutorQuestion({ isLoading: false, activePhase: buggy[0].aiPhase, question: 'retry' })
    ).toBe(false);
  });

  it('keeps error after failActiveTurn then sync with null hook error (capture denied)', () => {
    const started: PipelineTurn[] = [{ id: 't1', userText: 'Solve 3(x+2)=21', aiPhase: 'scanning' }];
    const failed = applyFailActiveTurn(started, 't1', captureMsg);
    const synced = applySyncActiveTurn(failed, 't1', IDLE_AFTER_CAPTURE_FAIL);
    expect(synced[0].aiPhase).toBe('error');
    expect(synced[0].error).toBe(captureMsg);
    expect(
      canSubmitTutorQuestion({ isLoading: false, activePhase: synced[0].aiPhase, question: 'retry' })
    ).toBe(true);
  });

  it('keeps error stable across repeated idle syncs', () => {
    let turns: PipelineTurn[] = [{ id: 't1', userText: 'hi', aiPhase: 'scanning' }];
    turns = applyFailActiveTurn(turns, 't1', captureMsg);
    turns = applySyncActiveTurn(turns, 't1', IDLE_AFTER_CAPTURE_FAIL);
    turns = applySyncActiveTurn(turns, 't1', IDLE_AFTER_CAPTURE_FAIL);
    turns = applySyncActiveTurn(turns, 't1', IDLE_AFTER_CAPTURE_FAIL);
    expect(turns[0].aiPhase).toBe('error');
    expect(turns[0].error).toBe(captureMsg);
  });

  it('lets a new turn enter scanning after a failed turn', () => {
    const failed = applyFailActiveTurn(
      [{ id: 't1', userText: 'old', aiPhase: 'scanning' }],
      't1',
      captureMsg
    );
    const withNew: PipelineTurn[] = [
      ...applySyncActiveTurn(failed, 't1', IDLE_AFTER_CAPTURE_FAIL),
      { id: 't2', userText: 'new question', aiPhase: 'scanning' },
    ];
    const syncedNew = applySyncActiveTurn(withNew, 't2', {
      error: null,
      isScanning: true,
      isLoading: false,
      isStreaming: false,
      isResponseReady: false,
      responseDelivered: false,
      hasResponse: false,
    });
    expect(syncedNew.find((t) => t.id === 't1')?.aiPhase).toBe('error');
    expect(syncedNew.find((t) => t.id === 't2')?.aiPhase).toBe('scanning');
    expect(
      canSubmitTutorQuestion({
        isLoading: false,
        activePhase: 'scanning',
        question: 'blocked while scanning',
      })
    ).toBe(false);
  });

  it('preserves normal success scanning → thinking → outputting → done', () => {
    let turns: PipelineTurn[] = [{ id: 't1', userText: '3(x+2)=21', aiPhase: 'scanning' }];
    turns = applySyncActiveTurn(turns, 't1', {
      error: null,
      isScanning: true,
      isResponseReady: false,
      responseDelivered: false,
      hasResponse: false,
    });
    expect(turns[0].aiPhase).toBe('scanning');
    turns = applySyncActiveTurn(turns, 't1', {
      error: null,
      isScanning: false,
      isLoading: true,
      isStreaming: true,
      isResponseReady: false,
      responseDelivered: false,
      hasResponse: false,
    });
    expect(turns[0].aiPhase).toBe('thinking');
    turns = applySyncActiveTurn(turns, 't1', {
      error: null,
      isScanning: false,
      isLoading: false,
      isStreaming: false,
      isResponseReady: true,
      responseDelivered: false,
      hasResponse: true,
    });
    expect(turns[0].aiPhase).toBe('outputting');
    turns = applySyncActiveTurn(turns, 't1', {
      error: null,
      isScanning: false,
      isResponseReady: true,
      responseDelivered: true,
      hasResponse: true,
    });
    expect(turns[0].aiPhase).toBe('done');
  });

  it('keeps provider error stable when hook error remains set', () => {
    let turns: PipelineTurn[] = [{ id: 't1', userText: 'q', aiPhase: 'thinking' }];
    turns = applySyncActiveTurn(turns, 't1', {
      error: 'API error: Unauthorized',
      isScanning: false,
      isLoading: false,
      isStreaming: false,
      isResponseReady: false,
      responseDelivered: false,
      hasResponse: false,
    });
    expect(turns[0].aiPhase).toBe('error');
    turns = applySyncActiveTurn(turns, 't1', {
      error: 'API error: Unauthorized',
      isScanning: false,
      isResponseReady: false,
      responseDelivered: false,
      hasResponse: false,
    });
    expect(turns[0].aiPhase).toBe('error');
    expect(turns[0].error).toMatch(/Unauthorized/);
  });

  it('voice capture failure uses the same unlock path as text', () => {
    // Voice path: startTurn → failActiveTurn(capture) → sync idle (no askQuestion).
    let turns: PipelineTurn[] = [{ id: 'voice-1', userText: 'solve it', aiPhase: 'scanning' }];
    turns = applyFailActiveTurn(turns, 'voice-1', captureMsg);
    turns = applySyncActiveTurn(turns, 'voice-1', IDLE_AFTER_CAPTURE_FAIL);
    expect(turns[0].aiPhase).toBe('error');
    expect(
      canSubmitTutorQuestion({ isLoading: false, activePhase: turns[0].aiPhase, question: 'again' })
    ).toBe(true);
  });

  it('does not let a late idle sync revive an old failed turn when a newer turn is active', () => {
    const turns: PipelineTurn[] = [
      { id: 'old', userText: 'failed', aiPhase: 'error', error: captureMsg },
      { id: 'new', userText: 'retry', aiPhase: 'thinking' },
    ];
    const synced = applySyncActiveTurn(turns, 'new', {
      error: null,
      isScanning: false,
      isLoading: true,
      isStreaming: true,
      isResponseReady: false,
      responseDelivered: false,
      hasResponse: false,
    });
    expect(synced.find((t) => t.id === 'old')?.aiPhase).toBe('error');
    expect(synced.find((t) => t.id === 'new')?.aiPhase).toBe('thinking');
  });

  it('nextAiPhase preserves terminal error without hook error', () => {
    expect(
      nextAiPhase({
        error: null,
        isScanning: false,
        isResponseReady: false,
        responseDelivered: false,
        hasResponse: false,
        currentPhase: 'error',
      })
    ).toBe('error');
  });
});

describe('Part 4.0 — narration / annotation step alignment', () => {
  it('keeps spoken beats and overlay events step-aligned for algebra', () => {
    const steps = algebraNarrationFixture();
    expect(steps.length).toBe(3);
    steps.forEach((step) => {
      expect(step.spoken.length).toBeGreaterThan(0);
      expect(step.events.some((e) => e.type === 'point' || e.type === 'draw')).toBe(true);
    });
    // Each step clears prior marks so annotations do not pile incorrectly.
    expect(steps.every((s) => /\[DRAW:clear\]/i.test(s.overlaySegment))).toBe(true);
  });
});

describe('Part 4.0 — panel placement after UI work', () => {
  it('does not reopen Text at the legacy bottom-right corner for a left launcher', () => {
    expect(panelOpensNearLauncherNotCorner({ cx: 120, cy: 200 })).toBe(true);
  });
});
