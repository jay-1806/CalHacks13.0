import {
  ONBOARDING_SESSION_AUTO_KEY,
  ONBOARDING_STORAGE_KEY,
  createOnboardingRecord,
  parseOnboardingRecord,
  resetOnboardingKeysOnly,
  serializeOnboardingRecord,
  type OnboardingRecord,
  type OnboardingStatus,
} from '@screentutor/shared';

function readRaw(): string | null {
  try {
    return localStorage.getItem(ONBOARDING_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeRaw(value: string): boolean {
  try {
    localStorage.setItem(ONBOARDING_STORAGE_KEY, value);
    return true;
  } catch {
    return false;
  }
}

export function loadOnboardingRecord(): OnboardingRecord {
  return parseOnboardingRecord(readRaw());
}

export function saveOnboardingStatus(status: OnboardingStatus): OnboardingRecord {
  const record = createOnboardingRecord(status);
  writeRaw(serializeOnboardingRecord(record));
  return record;
}

/**
 * Dev/test only — removes onboarding keys exclusively.
 * Never wipes the entire preference store.
 */
export function resetOnboardingPreference(): void {
  try {
    resetOnboardingKeysOnly(localStorage, sessionStorage);
  } catch {
    // ignore unavailable storage
  }
}

export function hasAttemptedSessionAutoShow(): boolean {
  try {
    return sessionStorage.getItem(ONBOARDING_SESSION_AUTO_KEY) === '1';
  } catch {
    return false;
  }
}

export function markSessionAutoShowAttempted(): void {
  try {
    sessionStorage.setItem(ONBOARDING_SESSION_AUTO_KEY, '1');
  } catch {
    // ignore — worst case HMR may re-attempt once
  }
}
