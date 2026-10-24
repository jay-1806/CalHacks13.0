import { desktopCapturer } from 'electron';
import { isWindowTitleDenied, PRIVACY_DENYLIST } from '@screentutor/shared';

// Re-export shared list so legacy imports still work
export { PRIVACY_DENYLIST, isWindowTitleDenied };

let privacyMode = false;

/**
 * Returns true if the window title matches the denylist OR global privacy mode is on.
 */
export function isWindowDenied(title: string): boolean {
  if (privacyMode) return true;
  return isWindowTitleDenied(title);
}

export function togglePrivacyMode(): boolean {
  privacyMode = !privacyMode;
  return privacyMode;
}

export function getPrivacyMode(): boolean {
  return privacyMode;
}

/**
 * Fetches the name of the currently active/focused screen source from
 * desktopCapturer. This is used to detect denylisted windows before
 * any screenshot is taken.
 *
 * Returns null on error or if no source is available.
 * NOTE: This is deliberately lightweight — we only request thumbnailSize 1x1
 * so no actual image data is captured or stored.
 */
export async function getActiveWindowTitle(): Promise<string | null> {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: { width: 1, height: 1 }, // minimal — we only need the name
      fetchWindowIcons: false,
    });
    // The first source is generally the focused window
    if (sources.length > 0) {
      return sources[0].name;
    }
    return null;
  } catch (err) {
    console.warn('[Privacy] Failed to fetch active window title:', err);
    return null;
  }
}
