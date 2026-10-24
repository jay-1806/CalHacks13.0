import { describe, expect, it } from 'vitest';
import {
  algebraNarrationFixture,
  applyFailActiveTurn,
  canSubmitTutorQuestion,
  nextAiPhase,
  panelOpensNearLauncherNotCorner,
  selectCaptureForQuestion,
} from '@screentutor/shared';

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
