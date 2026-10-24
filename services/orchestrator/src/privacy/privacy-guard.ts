import { isWindowTitleDenied, getDenyReason, PRIVACY_DENYLIST } from '@screentutor/shared';
import type { TutorInput } from '@screentutor/shared';

export { PRIVACY_DENYLIST };

/**
 * Error thrown when a privacy rule blocks an operation.
 * Caught by the orchestrator to return a safe 403-style response.
 */
export class PrivacyBlockedError extends Error {
  constructor(
    message: string,
    public readonly reason: string
  ) {
    super(message);
    this.name = 'PrivacyBlockedError';
  }
}

/**
 * PrivacyGuard — single enforcement point for all privacy rules in the orchestrator.
 *
 * Rules (in priority order):
 *   1. Global privacy mode — blocks everything
 *   2. Active window title matches canonical denylist — blocks screenshot + sensitive calls
 *   3. Memory disabled flag — blocks memory writes (enforced separately in memory service)
 */
export class PrivacyGuard {
  /**
   * Returns true if any privacy rule should block analysis.
   */
  isDenied(windowTitle?: string, privacyMode?: boolean): boolean {
    if (privacyMode) return true;
    if (windowTitle && isWindowTitleDenied(windowTitle)) return true;
    return false;
  }

  /**
   * Returns a human-readable reason for the block, or null if not blocked.
   */
  getBlockReason(windowTitle?: string, privacyMode?: boolean): string | null {
    if (privacyMode) {
      return 'Privacy mode is active.';
    }
    if (windowTitle) {
      const term = getDenyReason(windowTitle);
      if (term) {
        return `Window title contains denylist term: "${term}".`;
      }
    }
    return null;
  }

  /**
   * Throws a PrivacyBlockedError if the input should be blocked.
   * Call this at the top of any orchestrator flow that involves screenshots,
   * model calls.
   */
  assertAllowed(input: TutorInput): void {
    const windowTitle = input.appMetadata?.windowTitle;
    const reason = this.getBlockReason(windowTitle, input.privacyMode);
    if (reason) {
      throw new PrivacyBlockedError(
        'Screen analysis was blocked for privacy.',
        reason
      );
    }
  }

  /**
   * Returns true if a screenshot is safe to include in the model call.
   * The screenshot must not be sent if privacy mode is on or if the window is denied.
   */
  isScreenshotAllowed(input: TutorInput): boolean {
    return !this.isDenied(input.appMetadata?.windowTitle, input.privacyMode);
  }

  /**
   * Returns true if memory writes are allowed for this input.
   */
  isMemoryWriteAllowed(input: TutorInput, memoryEnabled: boolean): boolean {
    if (!memoryEnabled) return false;
    if (input.privacyMode) return false;
    return true;
  }
}

/** Singleton guard — import and use directly */
export const privacyGuard = new PrivacyGuard();
