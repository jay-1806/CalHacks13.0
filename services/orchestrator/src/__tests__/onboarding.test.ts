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
  it('keeps welcome inside the buddy panel and wires Help IPC', () => {
    const appSrc = readFileSync(join(DESKTOP_ROOT, 'src/renderer/App.tsx'), 'utf8');
    expect(appSrc).toContain('WelcomeOnboarding');
    expect(appSrc).toContain('handleWelcomeGetStarted');
    expect(appSrc).toContain('setFocusInputToken');
    expect(appSrc).toContain('onOpenGettingStarted');
    expect(appSrc).toContain('placeTutorPanel');
    expect(appSrc).toContain('__quickyResetOnboarding');
    expect(appSrc).toContain("host === 'localhost'");
    expect(appSrc).not.toContain('new BrowserWindow');
  });

  it('installs Help → Getting Started in the native menu', () => {
    const mainSrc = readFileSync(join(DESKTOP_ROOT, 'src/main/index.ts'), 'utf8');
    expect(mainSrc).toContain('installApplicationMenu');
    expect(mainSrc).toContain("label: 'Getting Started'");
    expect(mainSrc).toContain("label: 'Help'");
    expect(mainSrc).toContain("send('onOpenGettingStarted')");
    expect(mainSrc).toContain('Menu.setApplicationMenu');
  });

  it('exposes onOpenGettingStarted through preload', () => {
    const preload = readFileSync(join(DESKTOP_ROOT, 'src/preload/index.ts'), 'utf8');
    expect(preload).toContain('onOpenGettingStarted');
    expect(preload).toContain("subscribe('onOpenGettingStarted'");
  });

  it('welcome copy uses Quicky.AI and the three-step guide', () => {
    const welcome = readFileSync(join(DESKTOP_ROOT, 'src/renderer/components/WelcomeOnboarding.tsx'), 'utf8');
    expect(welcome).toContain('PRODUCT_DISPLAY_NAME');
    expect(welcome).toContain('Learn right on your screen.');
    expect(welcome).toContain('Ask. Watch. Understand.');
    expect(welcome).toContain('Open the floating menu');
    expect(welcome).toContain('Choose how to ask');
    expect(welcome).toContain('Follow the explanation');
    expect(welcome).toContain('Get started');
    expect(welcome).toContain('Not now');
    expect(welcome).not.toMatch(/Quicke\.AI|ScreenTutor/);
    const welcomeCss = readFileSync(
      join(DESKTOP_ROOT, 'src/renderer/components/WelcomeOnboarding.css'),
      'utf8'
    );
    expect(welcomeCss).toContain('prefers-reduced-motion');
  });
});
