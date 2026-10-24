import { shell, systemPreferences } from 'electron';
import { isMac } from './platform.js';

export interface PermissionStatus {
  platform: NodeJS.Platform;
  /** Screen capture. Always 'granted' outside macOS. */
  screen: string;
  microphone: string;
  /** Needed for Co-drive clicks/keys on macOS. */
  accessibility: boolean;
}

const SETTINGS_URLS = {
  screen: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
  microphone: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
  accessibility: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
} as const;

export type PermissionKind = keyof typeof SETTINGS_URLS;

export function getPermissionStatus(): PermissionStatus {
  if (!isMac) return { platform: process.platform, screen: 'granted', microphone: 'granted', accessibility: true };
  return {
    platform: process.platform,
    screen: systemPreferences.getMediaAccessStatus('screen'),
    microphone: systemPreferences.getMediaAccessStatus('microphone'),
    accessibility: systemPreferences.isTrustedAccessibilityClient(false),
  };
}

/** Shows the macOS Accessibility prompt if needed. Returns whether the app is trusted now. */
export function ensureAccessibility(): boolean {
  if (!isMac) return true;
  return systemPreferences.isTrustedAccessibilityClient(true);
}

/** Asks for microphone access the first time (no-op if already decided). */
export async function ensureMicrophone(): Promise<void> {
  if (!isMac) return;
  if (systemPreferences.getMediaAccessStatus('microphone') === 'not-determined') {
    await systemPreferences.askForMediaAccess('microphone');
  }
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
