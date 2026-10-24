/**
 * Quicky.AI first-launch onboarding — pure preference + gate helpers.
 * Persistence key lives in renderer localStorage (same pattern as mute).
 */

export const ONBOARDING_STORAGE_KEY = 'quicky_onboarding_v1' as const;

/** Session-only: prevents duplicate auto-open across Vite HMR remounts. */
export const ONBOARDING_SESSION_AUTO_KEY = 'quicky_onboarding_v1_session_auto' as const;

export const ONBOARDING_VERSION = 1 as const;

export type OnboardingStatus = 'never' | 'completed' | 'dismissed';

export type OnboardingRecord = {
  version: typeof ONBOARDING_VERSION;
  status: OnboardingStatus;
  updatedAt: string;
};

export type TutoringBusyFlags = {
  isRecordingVoice?: boolean;
  isSelectingRegion?: boolean;
  isLoading?: boolean;
  isStreaming?: boolean;
  isSpeaking?: boolean;
  isScanning?: boolean;
  /** Active turn not yet done/error. */
  isConversationBusy?: boolean;
};

export function createOnboardingRecord(
  status: OnboardingStatus,
  now: Date = new Date()
): OnboardingRecord {
  return {
    version: ONBOARDING_VERSION,
    status,
    updatedAt: now.toISOString(),
  };
}

/** Safe parse — corrupt / unknown values fall back to never-shown. */
export function parseOnboardingRecord(raw: string | null | undefined): OnboardingRecord {
  if (raw == null || raw === '') {
    return createOnboardingRecord('never', new Date(0));
  }
  try {
    const parsed = JSON.parse(raw) as Partial<OnboardingRecord>;
    if (
      parsed &&
      parsed.version === ONBOARDING_VERSION &&
      (parsed.status === 'never' || parsed.status === 'completed' || parsed.status === 'dismissed')
    ) {
      return {
        version: ONBOARDING_VERSION,
        status: parsed.status,
        updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date(0).toISOString(),
      };
    }
  } catch {
    // fall through
  }
  return createOnboardingRecord('never', new Date(0));
}

export function serializeOnboardingRecord(record: OnboardingRecord): string {
  return JSON.stringify({
    version: ONBOARDING_VERSION,
    status: record.status,
    updatedAt: record.updatedAt,
  });
}

/** Auto first-launch only when the user has never completed or dismissed. */
export function shouldAutoShowOnboarding(status: OnboardingStatus): boolean {
  return status === 'never';
}

export function isTutoringBusy(flags: TutoringBusyFlags): boolean {
  return Boolean(
    flags.isRecordingVoice ||
      flags.isSelectingRegion ||
      flags.isLoading ||
      flags.isStreaming ||
      flags.isSpeaking ||
      flags.isScanning ||
      flags.isConversationBusy
  );
}

/** First-launch auto-open should wait until the app is idle. */
export function shouldDeferOnboardingAutoShow(flags: TutoringBusyFlags): boolean {
  return isTutoringBusy(flags);
}

/**
 * Help → Getting Started may open when idle.
 * Opening during an active tutoring turn would interrupt the user.
 */
export function canOpenGettingStartedFromHelp(flags: TutoringBusyFlags): boolean {
  return !isTutoringBusy(flags);
}

/** Closing welcome via Not now / minimize marks an explicit first-run dismissal. */
export function nextStatusAfterDismiss(current: OnboardingStatus): OnboardingStatus {
  if (current === 'completed') return 'completed';
  return 'dismissed';
}

export function nextStatusAfterGetStarted(current: OnboardingStatus): OnboardingStatus {
  return 'completed';
}

export function shouldMarkDismissOnWelcomeMinimize(current: OnboardingStatus): boolean {
  return current === 'never';
}

/** Keys removed by a safe onboarding reset — never localStorage.clear(). */
export const ONBOARDING_RESET_KEYS = [ONBOARDING_STORAGE_KEY, ONBOARDING_SESSION_AUTO_KEY] as const;

/** Existing mute preference — must survive onboarding reset / rebrand. */
export const MUTE_STORAGE_KEY = 'screentutor_muted' as const;

export type PreferenceStore = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

/** Removes only onboarding keys; leaves mute and unrelated prefs intact. */
export function resetOnboardingKeysOnly(store: PreferenceStore, sessionStore?: PreferenceStore): void {
  store.removeItem(ONBOARDING_STORAGE_KEY);
  (sessionStore ?? store).removeItem(ONBOARDING_SESSION_AUTO_KEY);
}

export function isOnboardingResetKey(key: string): boolean {
  return (ONBOARDING_RESET_KEYS as readonly string[]).includes(key);
}
