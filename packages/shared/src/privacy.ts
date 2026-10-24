/**
 * Canonical privacy denylist for Quicky.AI.
 *
 * If an active window title contains any of these terms (case-insensitive),
 * screenshot capture, Claude calls, Browserbase, Simular actions, and memory
 * writes are all blocked.
 *
 * This is the SINGLE SOURCE OF TRUTH — imported by both the desktop main
 * process and the orchestrator backend. Do not duplicate this list.
 */
export const PRIVACY_DENYLIST: ReadonlyArray<string> = [
  'password',
  '1password',
  'keychain',
  'bank',
  'banking',
  'healthcare',
  'messages',
  'private',
  'incognito',
  'secret',
  'wallet',
  'authenticator',
  'email',
  'login',
  'stripe',
  'checkout',
];

/**
 * Returns true if the given window title contains a denylist term.
 * Case-insensitive substring match.
 */
export function isWindowTitleDenied(title: string): boolean {
  const lower = title.toLowerCase();
  return PRIVACY_DENYLIST.some((term) => lower.includes(term));
}

/**
 * Returns the first matching denylist term or null if no match.
 * Useful for displaying which rule triggered the block.
 */
export function getDenyReason(title: string): string | null {
  const lower = title.toLowerCase();
  const matched = PRIVACY_DENYLIST.find((term) => lower.includes(term));
  return matched ?? null;
}
