/**
 * Pure policy helpers for Quicky.AI media permission timing.
 * OS prompts must follow deliberate user actions — never startup/onboarding.
 */

export type MediaAccessStatus = string;

export function shouldPromptMicrophoneAtStartup(): boolean {
  return false;
}

export function shouldPromptMicrophoneForOnboarding(): boolean {
  return false;
}

export function shouldPromptMicrophoneForGetStarted(): boolean {
  return false;
}

export function shouldPromptScreenCaptureAtStartup(): boolean {
  return false;
}

/** Voice / hold-to-talk is the only path that may request microphone access. */
export function shouldEnsureMicrophoneForVoiceAction(): boolean {
  return true;
}

export function isMicrophoneAccessBlocked(status: MediaAccessStatus): boolean {
  return status === 'denied' || status === 'restricted';
}

export function isScreenAccessBlocked(status: MediaAccessStatus): boolean {
  return status === 'denied' || status === 'restricted';
}
