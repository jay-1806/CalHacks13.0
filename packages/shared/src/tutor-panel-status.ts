/**
 * Pure presentation helpers for Quicky.AI tutor-panel processing / handoff UI.
 * Labels map to real ChatTurn.aiPhase values — no synthetic phases.
 */

export type TutorAiPhase = 'scanning' | 'thinking' | 'outputting' | 'done' | 'error';

export function isTutorProcessingPhase(phase: TutorAiPhase): boolean {
  return phase === 'scanning' || phase === 'thinking' || phase === 'outputting';
}

/** Primary label for an in-flight phase; null when not processing. */
export function getTutorProcessingLabel(phase: TutorAiPhase): string | null {
  switch (phase) {
    case 'scanning':
      return 'Scanning...';
    case 'thinking':
      return 'Thinking...';
    case 'outputting':
      return 'Preparing...';
    default:
      return null;
  }
}

/** Optional one-line support; only when it adds meaning. */
export function getTutorProcessingSupport(phase: TutorAiPhase): string | null {
  switch (phase) {
    case 'scanning':
      return 'Looking at your screen.';
    case 'thinking':
      return 'Working through the problem.';
    case 'outputting':
      return 'Getting ready to teach on screen.';
    default:
      return null;
  }
}

export function shouldShowExplanationHandoff(turn: {
  aiPhase: TutorAiPhase;
  reference?: string | null;
}): boolean {
  return turn.aiPhase === 'done' && Boolean(turn.reference?.trim());
}

export function canRestoreOnScreenExplanation(turn: {
  explanation?: { text?: string | null } | null;
}): boolean {
  return Boolean(turn.explanation?.text?.trim());
}

/** Accurate control label for the existing restoreExplanation callback. */
export function getExplanationRestoreLabel(visible: boolean | undefined): string {
  return visible ? 'Show on screen' : 'Show on screen';
}
