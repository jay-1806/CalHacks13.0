/**
 * Pure contracts for Quicky.AI end-to-end tutoring handoffs (Part 4.0).
 * These mirror renderer/orchestrator behavior without Electron or paid APIs.
 */

import type { TutorAiPhase } from './tutor-panel-status.js';
import { buildNarrationSteps } from './narration-steps.js';
import { looksLikeDefaultBottomRightDock, computeTutorPanelBounds } from './panel-placement.js';

export type PipelineTurn = {
  id: string;
  userText: string;
  aiPhase: TutorAiPhase;
  reference?: string;
  error?: string;
};

/** Composer may send only when idle and the draft is non-empty. */
export function canSubmitTutorQuestion(params: {
  isLoading: boolean;
  activePhase: TutorAiPhase | null;
  question: string;
}): boolean {
  const busy =
    params.activePhase != null && params.activePhase !== 'done' && params.activePhase !== 'error';
  return !params.isLoading && !busy && Boolean(params.question.trim());
}

/** Inputs mirrored from App → useChatHistory.syncActiveTurn. */
export type SyncActiveTurnParams = {
  error: string | null;
  isScanning: boolean;
  isLoading?: boolean;
  isStreaming?: boolean;
  isResponseReady: boolean;
  responseDelivered: boolean;
  hasResponse: boolean;
};

/**
 * Phase machine used by syncActiveTurn.
 *
 * When capture fails before a tutor request, `failActiveTurn` sets `error` while
 * the request hook's `error` is still null. A later sync must NOT revive that
 * terminal failure into `thinking` from idle hook flags.
 */
export function nextAiPhase(params: {
  error: string | null;
  isScanning: boolean;
  isResponseReady: boolean;
  responseDelivered: boolean;
  hasResponse: boolean;
  /** Existing phase on the active turn — required to preserve terminal errors. */
  currentPhase?: TutorAiPhase;
  isLoading?: boolean;
  isStreaming?: boolean;
}): TutorAiPhase {
  if (params.error) return 'error';
  if (params.isScanning) return 'scanning';

  const hookBusy = Boolean(params.isLoading || params.isStreaming);
  // Capture/local failure already marked the turn terminal; idle hook state must not revive it.
  if (
    params.currentPhase === 'error' &&
    !hookBusy &&
    !params.isResponseReady
  ) {
    return 'error';
  }

  if (!params.isResponseReady) return 'thinking';
  if (!params.responseDelivered) return 'outputting';
  if (params.hasResponse) return 'done';
  return 'thinking';
}

/**
 * Pure sync matching `useChatHistory.syncActiveTurn` phase/error updates.
 * Explanation attachment stays in the React hook (needs TutorResponse).
 */
export function applySyncActiveTurn<T extends PipelineTurn>(
  turns: T[],
  activeId: string | null,
  params: SyncActiveTurnParams
): T[] {
  if (!activeId) return turns;
  return turns.map((turn) => {
    if (turn.id !== activeId) return turn;

    const phase = nextAiPhase({
      error: params.error,
      isScanning: params.isScanning,
      isResponseReady: params.isResponseReady,
      responseDelivered: params.responseDelivered,
      hasResponse: params.hasResponse,
      currentPhase: turn.aiPhase,
      isLoading: params.isLoading,
      isStreaming: params.isStreaming,
    });

    if (phase === 'error') {
      return {
        ...turn,
        aiPhase: 'error' as const,
        error: params.error ?? turn.error,
      };
    }

    const next = { ...turn, aiPhase: phase };
    if (turn.error != null) {
      // Left the terminal error phase on this turn; drop stale failure text.
      delete (next as { error?: string }).error;
    }
    return next;
  });
}

/**
 * Pending region is consumed exactly once for the next question.
 * Mirrors useScreenCapture.screenshotForQuestion selection logic.
 */
export function selectCaptureForQuestion<T>(pending: T | null, fullScreen: T | null): {
  used: T | null;
  pendingAfter: null;
} {
  if (pending) return { used: pending, pendingAfter: null };
  return { used: fullScreen, pendingAfter: null };
}

/** Follow-up must not reopen at the legacy primary bottom-right dock. */
export function panelOpensNearLauncherNotCorner(launcher: {
  cx: number;
  cy: number;
}): boolean {
  const work = { x: 0, y: 25, width: 1440, height: 875 };
  const placed = computeTutorPanelBounds({
    launcherCenter: launcher,
    launcherSize: 96,
    panelWidth: 420,
    panelHeight: 620,
    workArea: work,
    gap: 16,
  });
  return !looksLikeDefaultBottomRightDock(placed, work);
}

/** Algebra demo fixture: spoken + overlay with point/draw tags stay step-aligned. */
export function algebraNarrationFixture() {
  const spoken = [
    'Distribute the 3 across the parentheses.',
    'Subtract 6 from both sides.',
    'Divide by 3 to isolate x.',
  ].join('\n');
  const overlay = [
    '[DRAW:clear] Distribute [POINT:0.42,0.40:dist] [DRAW:underline:0.30,0.42,0.55,0.42]',
    '[DRAW:clear] Subtract 6 [POINT:0.42,0.48:sub] [DRAW:underline:0.30,0.50,0.55,0.50]',
    '[DRAW:clear] Divide [POINT:0.42,0.56:div] [DRAW:work:0.62,0.56:x = 5]',
  ].join('\n');
  return buildNarrationSteps(spoken, overlay);
}

/** Fail an in-flight turn so the UI unlocks after capture/privacy abort. */
export function applyFailActiveTurn(turns: PipelineTurn[], activeId: string | null, message: string): PipelineTurn[] {
  if (!activeId) return turns;
  return turns.map((t) =>
    t.id === activeId ? { ...t, aiPhase: 'error', error: message } : t
  );
}
