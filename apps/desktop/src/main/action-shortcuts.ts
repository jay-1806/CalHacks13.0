import { globalShortcut } from 'electron';
import * as Sentry from '@sentry/node';
import {
  QUICKY_HOTKEY_CAPTURE,
  QUICKY_HOTKEY_STOP_FALLBACK,
  QUICKY_HOTKEY_TEXT,
  QUICKY_HOTKEY_VOICE,
  hotkeyLabel,
  type QuickyHotkeyAction,
} from '@screentutor/shared';
import { isMac } from './platform.js';

export type ActionShortcutHandler = (action: QuickyHotkeyAction) => void;

const OWNED = new Set<string>();
let actionHandler: ActionShortcutHandler | null = null;
let escapeRegistered = false;
let escapeAvailable = false;
let activityActive = false;
let registeredOnce = false;

function tryRegister(accelerator: string, fn: () => void): boolean {
  try {
    // Avoid duplicate registration during HMR / window recreation.
    if (OWNED.has(accelerator)) {
      globalShortcut.unregister(accelerator);
      OWNED.delete(accelerator);
    }
    const ok = globalShortcut.register(accelerator, fn);
    if (ok) {
      OWNED.add(accelerator);
      return true;
    }
    console.warn(`[Hotkeys] Failed to register ${accelerator}`);
    Sentry.captureMessage(`Global hotkey ${accelerator} registration failed.`);
    return false;
  } catch (err) {
    console.warn(`[Hotkeys] Error registering ${accelerator}:`, err);
    return false;
  }
}

function unregisterOwned(accelerator: string) {
  if (!OWNED.has(accelerator)) return;
  try {
    globalShortcut.unregister(accelerator);
  } catch {
    // ignore
  }
  OWNED.delete(accelerator);
}

function platformKey(): 'darwin' | 'win32' | string {
  return process.platform;
}

/**
 * Register Voice / Capture / Text / Stop-fallback after app ready.
 * Idempotent across HMR: owned accelerators are replaced, not stacked.
 */
export function registerActionShortcuts(onAction: ActionShortcutHandler): {
  registered: Record<string, boolean>;
  escapeAvailable: boolean;
  labels: Record<string, string>;
} {
  actionHandler = onAction;
  const platform = platformKey();

  const registered = {
    voice: tryRegister(QUICKY_HOTKEY_VOICE, () => actionHandler?.('voice')),
    capture: tryRegister(QUICKY_HOTKEY_CAPTURE, () => actionHandler?.('capture')),
    text: tryRegister(QUICKY_HOTKEY_TEXT, () => actionHandler?.('text')),
    stopFallback: tryRegister(QUICKY_HOTKEY_STOP_FALLBACK, () => actionHandler?.('stop')),
  };

  registeredOnce = true;
  escapeAvailable = false;

  console.log(
    `[Hotkeys] Voice=${registered.voice} Capture=${registered.capture} Text=${registered.text} StopFallback=${registered.stopFallback}`
  );

  return {
    registered,
    escapeAvailable,
    labels: {
      voice: hotkeyLabel(QUICKY_HOTKEY_VOICE, platform),
      capture: hotkeyLabel(QUICKY_HOTKEY_CAPTURE, platform),
      text: hotkeyLabel(QUICKY_HOTKEY_TEXT, platform),
      stopFallback: hotkeyLabel(QUICKY_HOTKEY_STOP_FALLBACK, platform),
      escape: 'Esc',
    },
  };
}

/**
 * Temporarily bind Escape globally while Voice/teaching is active.
 * Unregisters as soon as activity ends. Never leaves Escape hijacked while idle.
 */
export function setEscapeActivityActive(active: boolean): { escapeAvailable: boolean } {
  activityActive = active;

  if (!active) {
    if (escapeRegistered) {
      unregisterOwned('Escape');
      escapeRegistered = false;
    }
    escapeAvailable = false;
    return { escapeAvailable: false };
  }

  if (escapeRegistered) {
    return { escapeAvailable };
  }

  escapeAvailable = tryRegister('Escape', () => {
    if (!activityActive) return;
    actionHandler?.('stop');
  });
  escapeRegistered = escapeAvailable;

  if (!escapeAvailable) {
    console.warn(
      `[Hotkeys] Escape unavailable globally — use in-app Esc or ${hotkeyLabel(QUICKY_HOTKEY_STOP_FALLBACK, platformKey())}`
    );
  } else {
    console.log(`[Hotkeys] Temporary Escape registered (${isMac ? 'macOS' : 'Windows/other'})`);
  }

  return { escapeAvailable };
}

export function unregisterActionShortcuts() {
  actionHandler = null;
  activityActive = false;
  escapeRegistered = false;
  escapeAvailable = false;
  for (const accel of [...OWNED]) {
    unregisterOwned(accel);
  }
  registeredOnce = false;
}

export function getActionShortcutStatus() {
  return {
    registeredOnce,
    escapeAvailable,
    activityActive,
    owned: [...OWNED],
  };
}
