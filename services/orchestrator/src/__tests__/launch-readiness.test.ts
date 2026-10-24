import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MUTE_STORAGE_KEY,
  ONBOARDING_RESET_KEYS,
  ONBOARDING_STORAGE_KEY,
  PRODUCT_USER_DATA_DIR,
  createOnboardingRecord,
  isMicrophoneAccessBlocked,
  isOnboardingResetKey,
  parseOnboardingRecord,
  resetOnboardingKeysOnly,
  serializeOnboardingRecord,
  shouldEnsureMicrophoneForVoiceAction,
  shouldPromptMicrophoneAtStartup,
  shouldPromptMicrophoneForGetStarted,
  shouldPromptMicrophoneForOnboarding,
  shouldPromptScreenCaptureAtStartup,
} from '@screentutor/shared';

const DESKTOP = join(__dirname, '../../../../apps/desktop');

function memoryStore(initial: Record<string, string> = {}) {
  const data = { ...initial };
  return {
    getItem: (k: string) => (k in data ? data[k] : null),
    setItem: (k: string, v: string) => {
      data[k] = v;
    },
    removeItem: (k: string) => {
      delete data[k];
    },
    snapshot: () => ({ ...data }),
  };
}

describe('permission policy (pure)', () => {
  it('forbids microphone prompts at startup, onboarding, and Get started', () => {
    expect(shouldPromptMicrophoneAtStartup()).toBe(false);
    expect(shouldPromptMicrophoneForOnboarding()).toBe(false);
    expect(shouldPromptMicrophoneForGetStarted()).toBe(false);
    expect(shouldPromptScreenCaptureAtStartup()).toBe(false);
    expect(shouldEnsureMicrophoneForVoiceAction()).toBe(true);
  });

  it('treats denied/restricted mic as blocked without starting capture', () => {
    expect(isMicrophoneAccessBlocked('denied')).toBe(true);
    expect(isMicrophoneAccessBlocked('restricted')).toBe(true);
    expect(isMicrophoneAccessBlocked('granted')).toBe(false);
    expect(isMicrophoneAccessBlocked('not-determined')).toBe(false);
  });
});

describe('onboarding reset preserves unrelated preferences', () => {
  it('removes only onboarding keys and keeps mute', () => {
    const local = memoryStore({
      [ONBOARDING_STORAGE_KEY]: serializeOnboardingRecord(createOnboardingRecord('completed')),
      [MUTE_STORAGE_KEY]: 'true',
      unrelated_demo_key: 'keep-me',
    });
    const session = memoryStore({
      quicky_onboarding_v1_session_auto: '1',
    });

    resetOnboardingKeysOnly(local, session);

    expect(local.getItem(ONBOARDING_STORAGE_KEY)).toBeNull();
    expect(session.getItem('quicky_onboarding_v1_session_auto')).toBeNull();
    expect(local.getItem(MUTE_STORAGE_KEY)).toBe('true');
    expect(local.getItem('unrelated_demo_key')).toBe('keep-me');
    expect(ONBOARDING_RESET_KEYS).toEqual([
      'quicky_onboarding_v1',
      'quicky_onboarding_v1_session_auto',
    ]);
    expect(isOnboardingResetKey(MUTE_STORAGE_KEY)).toBe(false);
  });

  it('keeps completed/dismissed status across parse round-trips', () => {
    for (const status of ['completed', 'dismissed'] as const) {
      const raw = serializeOnboardingRecord(createOnboardingRecord(status));
      expect(parseOnboardingRecord(raw).status).toBe(status);
    }
  });
});

describe('desktop wiring — startup mic + voice path', () => {
  it('does not call ensureMicrophone / askForMediaAccess during app.whenReady', () => {
    const main = readFileSync(join(DESKTOP, 'src/main/index.ts'), 'utf8');
    const readyBlock = main.slice(main.indexOf('app.whenReady()'), main.indexOf("app.on('will-quit'"));
    expect(readyBlock).toContain('getPermissionStatus()');
    expect(readyBlock).not.toMatch(/ensureMicrophone\s*\(/);
    expect(readyBlock).not.toMatch(/askForMediaAccess\s*\(/);
    expect(main).toContain("ipcMain.handle('ensure-microphone'");
    expect(main).toContain("app.setPath('userData'");
    expect(main.indexOf("app.setPath('userData'")).toBeLessThan(main.indexOf('app.setName('));
  });

  it('permissions helper only prompts when microphone is not-determined', () => {
    const src = readFileSync(join(DESKTOP, 'src/main/permissions.ts'), 'utf8');
    expect(src).toContain("askForMediaAccess('microphone')");
    expect(src).toContain("=== 'not-determined'");
    expect(src).toContain('Must NOT be called from app startup');
  });

  it('Voice path ensures microphone before starting transcription', () => {
    const app = readFileSync(join(DESKTOP, 'src/renderer/App.tsx'), 'utf8');
    const voiceFn = app.slice(app.indexOf('const startVoiceRecording'), app.indexOf('const stopVoiceRecordingAndSubmit'));
    expect(voiceFn).toContain('ensureMicrophoneAccess');
    expect(voiceFn.indexOf('ensureMicrophoneAccess')).toBeLessThan(voiceFn.indexOf('transcriptionProvider.startSession'));
    expect(voiceFn).toContain("status.microphone === 'denied'");
    expect(voiceFn).toContain("status.microphone === 'restricted'");
  });

  it('preload exposes ensureMicrophoneAccess for Voice only', () => {
    const preload = readFileSync(join(DESKTOP, 'src/preload/index.ts'), 'utf8');
    expect(preload).toContain('ensureMicrophoneAccess');
    expect(preload).toContain("invoke('ensure-microphone')");
  });

  it('dev onboarding reset is localhost-gated and does not clear all storage', () => {
    const app = readFileSync(join(DESKTOP, 'src/renderer/App.tsx'), 'utf8');
    expect(app).toContain('__quickyResetOnboarding');
    expect(app).toContain("host === 'localhost'");
    expect(app).not.toContain('localStorage.clear(');
    const storage = readFileSync(join(DESKTOP, 'src/renderer/onboardingStorage.ts'), 'utf8');
    expect(storage).toContain('resetOnboardingKeysOnly');
    expect(storage).not.toMatch(/localStorage\.clear\s*\(/);
    expect(storage).not.toMatch(/sessionStorage\.clear\s*\(/);
  });

  it('preserves rebrand userData identity and mute key', () => {
    expect(PRODUCT_USER_DATA_DIR).toBe('@screentutor/desktop');
    expect(MUTE_STORAGE_KEY).toBe('screentutor_muted');
    const brand = readFileSync(join(DESKTOP, '../..', 'packages/shared/src/brand.ts'), 'utf8');
    expect(brand).toContain("PRODUCT_USER_DATA_DIR = '@screentutor/desktop'");
  });

  it('capture failure still fails the active turn (no stuck Scanning)', () => {
    const history = readFileSync(join(DESKTOP, 'src/renderer/hooks/useChatHistory.ts'), 'utf8');
    expect(history).toContain('failActiveTurn');
    const app = readFileSync(join(DESKTOP, 'src/renderer/App.tsx'), 'utf8');
    expect(app).toContain('failActiveTurn');
  });

  it('Help getting started is gated while tutoring is busy', () => {
    const app = readFileSync(join(DESKTOP, 'src/renderer/App.tsx'), 'utf8');
    expect(app).toContain('canOpenGettingStartedFromHelp');
  });
});
