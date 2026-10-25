import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ONBOARDING_SESSION_AUTO_KEY,
  ONBOARDING_STORAGE_KEY,
  canOpenGettingStartedFromHelp,
  createOnboardingRecord,
  isTutoringBusy,
  nextStatusAfterDismiss,
  nextStatusAfterGetStarted,
  parseOnboardingRecord,
  serializeOnboardingRecord,
  shouldAutoShowOnboarding,
  shouldDeferOnboardingAutoShow,
  shouldMarkDismissOnWelcomeMinimize,
} from '@screentutor/shared';

const DESKTOP_ROOT = join(__dirname, '../../../../apps/desktop');

describe('onboarding preference contract', () => {
  it('uses the versioned quicky_onboarding_v1 key', () => {
    expect(ONBOARDING_STORAGE_KEY).toBe('quicky_onboarding_v1');
    expect(ONBOARDING_SESSION_AUTO_KEY).toBe('quicky_onboarding_v1_session_auto');
  });

  it('treats missing storage as never shown', () => {
    expect(parseOnboardingRecord(null).status).toBe('never');
    expect(parseOnboardingRecord('').status).toBe('never');
    expect(shouldAutoShowOnboarding('never')).toBe(true);
  });

  it('does not auto-show after completed or dismissed', () => {
    expect(shouldAutoShowOnboarding('completed')).toBe(false);
    expect(shouldAutoShowOnboarding('dismissed')).toBe(false);
  });

  it('marks get started as completed', () => {
    expect(nextStatusAfterGetStarted('never')).toBe('completed');
    expect(nextStatusAfterGetStarted('dismissed')).toBe('completed');
  });

  it('marks not-now / first minimize as dismissed without clearing completed', () => {
    expect(nextStatusAfterDismiss('never')).toBe('dismissed');
    expect(nextStatusAfterDismiss('dismissed')).toBe('dismissed');
    expect(nextStatusAfterDismiss('completed')).toBe('completed');
    expect(shouldMarkDismissOnWelcomeMinimize('never')).toBe(true);
    expect(shouldMarkDismissOnWelcomeMinimize('completed')).toBe(false);
  });

  it('round-trips records and fails safe on corrupt JSON', () => {
    const record = createOnboardingRecord('completed');
    const raw = serializeOnboardingRecord(record);
    expect(parseOnboardingRecord(raw).status).toBe('completed');
    expect(parseOnboardingRecord('{not-json').status).toBe('never');
    expect(parseOnboardingRecord('{"version":1,"status":"weird"}').status).toBe('never');
    expect(parseOnboardingRecord('{"version":99,"status":"completed"}').status).toBe('never');
  });
});

describe('onboarding busy gates', () => {
  it('defers auto-show while voice, capture, or tutoring is active', () => {
    expect(shouldDeferOnboardingAutoShow({ isRecordingVoice: true })).toBe(true);
    expect(shouldDeferOnboardingAutoShow({ isSelectingRegion: true })).toBe(true);
    expect(shouldDeferOnboardingAutoShow({ isLoading: true })).toBe(true);
    expect(shouldDeferOnboardingAutoShow({ isStreaming: true })).toBe(true);
    expect(shouldDeferOnboardingAutoShow({ isSpeaking: true })).toBe(true);
    expect(shouldDeferOnboardingAutoShow({ isScanning: true })).toBe(true);
    expect(shouldDeferOnboardingAutoShow({ isConversationBusy: true })).toBe(true);
    expect(shouldDeferOnboardingAutoShow({})).toBe(false);
  });

  it('blocks Help reopen during an active session', () => {
    expect(canOpenGettingStartedFromHelp({ isConversationBusy: true })).toBe(false);
    expect(canOpenGettingStartedFromHelp({ isRecordingVoice: true })).toBe(false);
    expect(canOpenGettingStartedFromHelp({})).toBe(true);
    expect(isTutoringBusy({ isSpeaking: true })).toBe(true);
  });
});

describe('onboarding app wiring', () => {
  it('keeps buddy App free of BrowserWindow and preserves reset helper', () => {
    const appSrc = readFileSync(join(DESKTOP_ROOT, 'src/renderer/App.tsx'), 'utf8');
    expect(appSrc).toContain('placeTutorPanel');
    expect(appSrc).toContain('__quickyResetOnboarding');
    expect(appSrc).toContain("host === 'localhost'");
    expect(appSrc).not.toContain('new BrowserWindow');
    expect(appSrc).toContain('WelcomeOnboarding');
    expect(appSrc).toContain('shouldAutoShowOnboarding');
    expect(appSrc).toContain('onOpenGettingStarted');
  });

  it('installs Help → Getting Started via onOpenGettingStarted IPC', () => {
    const mainSrc = readFileSync(join(DESKTOP_ROOT, 'src/main/index.ts'), 'utf8');
    expect(mainSrc).toContain('installApplicationMenu');
    expect(mainSrc).toContain("label: 'Getting Started'");
    expect(mainSrc).toContain("label: 'Help'");
    expect(mainSrc).toContain("send('onOpenGettingStarted')");
    expect(mainSrc).toContain('Menu.setApplicationMenu');
    expect(mainSrc).not.toContain('createOrFocusWelcomeWindow');
  });

  it('exposes Getting Started IPC through preload', () => {
    const preload = readFileSync(join(DESKTOP_ROOT, 'src/preload/index.ts'), 'utf8');
    expect(preload).toContain('onOpenGettingStarted');
    expect(preload).not.toContain('welcomeStartLearning');
  });

  it('embedded Welcome onboarding uses Quicky.AI SEE/EXPLAIN/GUIDE', () => {
    const welcome = readFileSync(
      join(DESKTOP_ROOT, 'src/renderer/components/WelcomeOnboarding.tsx'),
      'utf8'
    );
    expect(welcome).toContain('PRODUCT_DISPLAY_NAME');
    expect(welcome).toContain('SEE');
    expect(welcome).toContain('EXPLAIN');
    expect(welcome).toContain('GUIDE');
    expect(welcome).not.toMatch(/Quicke\.AI|ScreenTutor/);
  });
});
