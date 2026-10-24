import { clipboard, screen } from 'electron';
import { mapNormalizedToDisplayLocal, translateComboForPlatform, type ProposedAction } from '@screentutor/shared';
import { capturedDisplays, lastCaptureRegion, updateCapturedDisplays } from './screenshot.js';
import { getActiveWindowTitle, getPrivacyMode, isWindowDenied } from './privacy.js';
import { isMac, isWindows, PASTE_COMBO } from './platform.js';
import { ensureAccessibility, openPermissionSettings } from './permissions.js';

export interface DesktopActionResult {
  success: boolean;
  message: string;
}

/** Common surface of the per-OS input backends (desktop-input.win32.ts / .darwin.ts). */
interface DesktopInput {
  click(x: number, y: number, button: 'left' | 'right', count: number, modifiers?: string): void;
  scroll(direction: 'up' | 'down' | 'left' | 'right', amount: number, at?: { x: number; y: number }): void;
  pressCombo(combo: string): void;
}

let inputBackend: Promise<DesktopInput | null> | null = null;

function loadInput(): Promise<DesktopInput | null> {
  if (inputBackend) return inputBackend;
  const load: Promise<DesktopInput> | null = isWindows
    ? import('./desktop-input.win32.js')
    : isMac
      ? import('./desktop-input.darwin.js')
      : null;
  inputBackend = load
    ? load.catch((err) => {
        console.error('[Co-drive] Failed to load desktop input backend:', err);
        return null;
      })
    : Promise.resolve(null);
  return inputBackend;
}

/** Normalized screenshot coordinates -> physical screen pixels for input APIs. */
function toScreenPoint(action: ProposedAction): { x: number; y: number } | null {
  if (!action.coordinates) return null;
  if (capturedDisplays.length === 0) updateCapturedDisplays();
  const local = mapNormalizedToDisplayLocal(
    action.coordinates.x,
    action.coordinates.y,
    capturedDisplays,
    action.screenNumber,
    lastCaptureRegion
  );
  if (!local) return null;
  const dip = {
    x: local.targetDisplay.displayFrameX + local.localX,
    y: local.targetDisplay.displayFrameY + local.localY,
  };
  // Windows input APIs want physical pixels; macOS CoreGraphics uses points, same as Electron.
  return isWindows ? screen.dipToScreenPoint(dip) : dip;
}

/**
 * Performs one Co-drive action the learner approved in the UI. Re-checks privacy
 * mode and the window denylist at the moment of execution, since the screen may
 * have changed since the action was proposed.
 */
export async function performApprovedAction(action: ProposedAction): Promise<DesktopActionResult> {
  if (action.status !== 'approved') {
    return { success: false, message: 'Only approved actions can run.' };
  }
  if (getPrivacyMode()) {
    return { success: false, message: 'Privacy mode is on, so Co-drive will not control the desktop.' };
  }
  const title = await getActiveWindowTitle();
  if (title && isWindowDenied(title)) {
    return { success: false, message: 'The active window is on the privacy denylist; action skipped.' };
  }

  const input = await loadInput();
  if (!input) {
    return { success: false, message: 'Desktop control is only implemented on Windows and macOS. Please do this step yourself.' };
  }
  if (isMac && !ensureAccessibility()) {
    openPermissionSettings('accessibility');
    return {
      success: false,
      message: 'Co-drive needs Accessibility access. Enable ScreenTutor (or Electron in dev) in System Settings > Privacy & Security > Accessibility, then approve the step again.',
    };
  }

  try {
    switch (action.type) {
      case 'click': {
        const point = toScreenPoint(action);
        if (!point) return { success: false, message: 'Could not map the click to a screen position.' };
        input.click(point.x, point.y, action.button ?? 'left', action.clickCount ?? 1, action.modifiers);
        return { success: true, message: 'Clicked.' };
      }
      case 'type': {
        if (!action.text) return { success: false, message: 'Nothing to type.' };
        // Paste instead of per-character key events: handles any Unicode and is instant.
        const previous = clipboard.readText();
        clipboard.writeText(action.text);
        input.pressCombo(PASTE_COMBO);
        setTimeout(() => clipboard.writeText(previous), 500);
        return { success: true, message: 'Typed.' };
      }
      case 'hotkey': {
        if (!action.text) return { success: false, message: 'No key to press.' };
        // Claude emits Windows/Linux-style combos; map Ctrl -> Cmd for app shortcuts on macOS.
        const combo = translateComboForPlatform(action.text, process.platform);
        input.pressCombo(combo);
        return { success: true, message: `Pressed ${combo}.` };
      }
      case 'scroll': {
        if (!action.scroll) return { success: false, message: 'No scroll direction.' };
        input.scroll(action.scroll.direction, action.scroll.amount, toScreenPoint(action) ?? undefined);
        return { success: true, message: `Scrolled ${action.scroll.direction}.` };
      }
      default:
        return { success: false, message: `Action type "${action.type}" is not supported.` };
    }
  } catch (err) {
    return { success: false, message: `Action failed: ${(err as Error).message}` };
  }
}
