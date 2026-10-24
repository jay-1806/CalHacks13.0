import { globalShortcut } from 'electron';
import * as Sentry from '@sentry/node';
import { HOLD_HOTKEY_ACCELERATOR, HOLD_HOTKEY_LABEL, isMac, isWindows } from './platform.js';

export interface HoldDictationCallbacks {
  onStart: () => void;
  onEnd: () => void;
}

let pollTimer: ReturnType<typeof setInterval> | null = null;
let holdActive = false;
let comboPressedAt: number | null = null;
let callbacks: HoldDictationCallbacks | null = null;
let tapToggleActive = false;

const POLL_MS = 40;
/** Ignore brief accidental taps; require a deliberate hold before starting dictation. */
const MIN_HOLD_MS = 150;

interface HoldKeyPoller {
  isHoldComboPressed(): boolean;
}

/**
 * Loads the OS-specific "is the hold combo down?" poller. Set SCREENTUTOR_HOTKEY_MODE=toggle
 * to skip polling and use a press-to-start / press-to-stop global shortcut instead.
 */
async function loadHoldKeyPoller(): Promise<HoldKeyPoller | null> {
  if (process.env.SCREENTUTOR_HOTKEY_MODE === 'toggle') return null;
  try {
    if (isWindows) return await import('./hold-key-poll.win32.js');
    if (isMac) return await import('./hold-key-poll.darwin.js');
  } catch (err) {
    console.warn('Hold-key poll unavailable, using toggle shortcut:', err);
  }
  return null;
}

function registerTapToggleFallback(onStart: () => void, onEnd: () => void) {
  const registered = globalShortcut.register(HOLD_HOTKEY_ACCELERATOR, () => {
    if (!tapToggleActive) {
      tapToggleActive = true;
      holdActive = true;
      onStart();
    } else {
      tapToggleActive = false;
      holdActive = false;
      onEnd();
    }
  });

  if (!registered) {
    console.warn(`${HOLD_HOTKEY_ACCELERATOR} registration failed.`);
    Sentry.captureMessage(`Global hotkey ${HOLD_HOTKEY_ACCELERATOR} registration failed.`);
  } else {
    console.log(`Hold-to-dictate fallback: ${HOLD_HOTKEY_LABEL} toggles listening`);
  }
}

/** Register the hold-to-dictate hotkey (Ctrl+Shift+E / Cmd+Shift+E): start on press, end on release. */
export async function registerHoldDictationShortcuts(onStart: () => void, onEnd: () => void) {
  callbacks = { onStart, onEnd };
  holdActive = false;
  comboPressedAt = null;
  tapToggleActive = false;

  const poller = await loadHoldKeyPoller();

  if (poller) {
    pollTimer = setInterval(() => {
      if (!callbacks) return;

      let comboDown = false;
      try {
        comboDown = poller.isHoldComboPressed();
      } catch (err) {
        console.warn('Key poll error:', err);
        return;
      }

      const now = Date.now();

      if (comboDown) {
        if (comboPressedAt === null) {
          comboPressedAt = now;
        }
        if (!holdActive && now - comboPressedAt >= MIN_HOLD_MS) {
          holdActive = true;
          callbacks.onStart();
        }
      } else {
        comboPressedAt = null;
        if (holdActive) {
          holdActive = false;
          callbacks.onEnd();
        }
      }
    }, POLL_MS);

    console.log(`Hold-to-dictate registered: ${HOLD_HOTKEY_LABEL} (${isMac ? 'CoreGraphics' : 'Win32'} poll)`);
    return;
  }

  registerTapToggleFallback(
    () => callbacks?.onStart(),
    () => callbacks?.onEnd()
  );
}

export function unregisterHoldDictationShortcuts() {
  holdActive = false;
  comboPressedAt = null;
  tapToggleActive = false;
  callbacks = null;

  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }

  try {
    globalShortcut.unregister(HOLD_HOTKEY_ACCELERATOR);
  } catch {
    // ignore
  }
}
