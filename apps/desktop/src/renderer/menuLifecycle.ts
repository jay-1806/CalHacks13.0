/**
 * Explicit menu transition phases for Quicky.AI floating launcher.
 * Keeps Electron window expansion/restoration ordered relative to Framer Motion.
 */

export type MenuPhase = 'closed' | 'opening' | 'open' | 'closing';

export type MenuIntent = 'open' | 'close' | null;

/** Stage must keep launcherOffset while layout exists — including during exit. */
export function shouldHoldArcStage(phase: MenuPhase, hasLayout: boolean): boolean {
  if (!hasLayout) return false;
  return phase === 'opening' || phase === 'open' || phase === 'closing';
}

/** Action buttons mount only after the window is ready (phase === open). */
export function shouldShowMenuItems(phase: MenuPhase): boolean {
  return phase === 'open';
}

/** Floating launcher fills the buddy window while the arc session is active. */
export function shouldFillBuddyWindow(phase: MenuPhase, hasLayout: boolean): boolean {
  return shouldHoldArcStage(phase, hasLayout);
}

/**
 * Resolve the next intent when the user clicks the trigger.
 * Rapid open↔close is queued rather than overlapping transitions.
 */
export function resolveTriggerIntent(
  phase: MenuPhase,
  pending: MenuIntent
): { action: 'open' | 'close' | 'none'; pending: MenuIntent } {
  if (phase === 'closed') {
    return { action: 'open', pending: null };
  }
  if (phase === 'open') {
    return { action: 'close', pending: null };
  }
  if (phase === 'opening') {
    // Opening in flight — queue a close for after open settles, or cancel a queued reopen.
    return { action: 'none', pending: pending === 'close' ? null : 'close' };
  }
  // closing
  return { action: 'none', pending: pending === 'open' ? null : 'open' };
}

/** After exit animation completes: shrink unless a reopen was queued. */
export function resolveAfterExit(pending: MenuIntent): {
  nextPhase: MenuPhase;
  shouldRestoreCompact: boolean;
  shouldReopen: boolean;
} {
  if (pending === 'open') {
    return { nextPhase: 'closed', shouldRestoreCompact: false, shouldReopen: true };
  }
  return { nextPhase: 'closed', shouldRestoreCompact: true, shouldReopen: false };
}

/** After entrance settles: honor a queued close. */
export function resolveAfterOpen(pending: MenuIntent): {
  shouldClose: boolean;
  pending: MenuIntent;
} {
  if (pending === 'close') {
    return { shouldClose: true, pending: null };
  }
  return { shouldClose: false, pending: null };
}

/**
 * Window must stay expanded until exit completes.
 * Shrinking while phase === 'closing' is a lifecycle bug.
 */
export function mayRestoreCompactWindow(phase: MenuPhase): boolean {
  return phase === 'closed';
}
