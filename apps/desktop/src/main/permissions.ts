import { shell, systemPreferences } from 'electron';
import { isMac } from './platform.js';

export interface PermissionStatus {
  platform: NodeJS.Platform;
  /** Screen capture. Always 'granted' outside macOS. */
  screen: string;
  microphone: string;
}

const SETTINGS_URLS = {
  screen: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
  microphone: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
} as const;

export type PermissionKind = keyof typeof SETTINGS_URLS;

export function getPermissionStatus(): PermissionStatus {
  if (!isMac) return { platform: process.platform, screen: 'granted', microphone: 'granted' };
  return {
    platform: process.platform,
    screen: systemPreferences.getMediaAccessStatus('screen'),
    microphone: systemPreferences.getMediaAccessStatus('microphone'),
  };
}


/**
 * User-initiated microphone access (Voice / hold-to-talk only).
 * No-op when already granted/denied/restricted; prompts only when not-determined.
 * Must NOT be called from app startup or onboarding.
 */
export async function ensureMicrophone(): Promise<PermissionStatus> {
  if (isMac && systemPreferences.getMediaAccessStatus('microphone') === 'not-determined') {
    await systemPreferences.askForMediaAccess('microphone');
  }
  return getPermissionStatus();
}

/** True when the OS will refuse getUserMedia({ audio: true }). */
export function isMicrophoneBlocked(status: PermissionStatus = getPermissionStatus()): boolean {
  if (!isMac) return false;
  return status.microphone === 'denied' || status.microphone === 'restricted';
}

export function openPermissionSettings(kind: PermissionKind): void {
  if (!isMac) return;
  void shell.openExternal(SETTINGS_URLS[kind]);
}

/** True when macOS Screen Recording is explicitly refused (captures would be blank). */
export function isScreenCaptureBlocked(): boolean {
  if (!isMac) return false;
  const status = systemPreferences.getMediaAccessStatus('screen');
  return status === 'denied' || status === 'restricted';
}
