import { describe, it, expect, beforeEach } from 'vitest';
import { PrivacyGuard, PrivacyBlockedError, privacyGuard } from '../privacy/privacy-guard.js';
import { PRIVACY_DENYLIST } from '@screentutor/shared';
import type { TutorInput } from '@screentutor/shared';

// Minimal valid input factory
function makeInput(overrides: Partial<TutorInput> = {}): TutorInput {
  return {
    userId: 'u1',
    sessionId: 's1',
    mode: 'explain',
    question: 'Explain this',
    ...overrides,
  };
}

describe('PRIVACY_DENYLIST', () => {
  it('contains all 16 required terms', () => {
    const required = [
      'password', '1password', 'keychain', 'bank', 'banking',
      'healthcare', 'messages', 'private', 'incognito', 'secret',
      'wallet', 'authenticator', 'email', 'login', 'stripe', 'checkout',
    ];
    for (const term of required) {
      expect(PRIVACY_DENYLIST).toContain(term);
    }
    expect(PRIVACY_DENYLIST.length).toBeGreaterThanOrEqual(16);
  });
});

describe('PrivacyGuard.isDenied', () => {
  const guard = new PrivacyGuard();

  it('blocks when privacy mode is on', () => {
    expect(guard.isDenied(undefined, true)).toBe(true);
  });

  it('blocks when window title contains a denylist term (case-insensitive)', () => {
    expect(guard.isDenied('1Password Extension', false)).toBe(true);
    expect(guard.isDenied('KEYCHAIN Access', false)).toBe(true);
    expect(guard.isDenied('Chase Banking App', false)).toBe(true);
    expect(guard.isDenied('Stripe Dashboard', false)).toBe(true);
    expect(guard.isDenied('Checkout - Amazon', false)).toBe(true);
    expect(guard.isDenied('Email Inbox', false)).toBe(true);          // contains 'email'
    expect(guard.isDenied('Incognito Tab', false)).toBe(true);
    expect(guard.isDenied('Secret Project', false)).toBe(true);
    expect(guard.isDenied('Crypto Wallet', false)).toBe(true);
    expect(guard.isDenied('Authenticator App', false)).toBe(true);
    expect(guard.isDenied('Login Page - GitHub', false)).toBe(true);
    expect(guard.isDenied('Private Browsing', false)).toBe(true);
    expect(guard.isDenied('Healthcare Portal', false)).toBe(true);
    expect(guard.isDenied('Messages', false)).toBe(true);
  });

  it('allows neutral windows', () => {
    expect(guard.isDenied('VS Code - main.ts', false)).toBe(false);
    expect(guard.isDenied('Quicky.AI', false)).toBe(false);
    expect(guard.isDenied('ScreenTutor', false)).toBe(false); // legacy internal label
    expect(guard.isDenied('Khan Academy', false)).toBe(false);
    expect(guard.isDenied('Desmos Graphing Calculator', false)).toBe(false);
  });

  it('blocks everything when both privacy mode and denied title', () => {
    expect(guard.isDenied('VS Code', true)).toBe(true);
  });
});

describe('PrivacyGuard.getBlockReason', () => {
  const guard = new PrivacyGuard();

  it('returns privacy mode message when active', () => {
    const reason = guard.getBlockReason(undefined, true);
    expect(reason).toContain('Privacy mode');
  });

  it('returns a denylist term in reason for 1Password Extension', () => {
    const reason = guard.getBlockReason('1Password Extension', false);
    // 'password' is found before '1password' in the list — both are valid blocks
    expect(reason).not.toBeNull();
    expect(reason!.toLowerCase()).toMatch(/password|1password/);
  });

  it('returns null for safe windows', () => {
    expect(guard.getBlockReason('VS Code', false)).toBeNull();
  });
});

describe('PrivacyGuard.assertAllowed', () => {
  const guard = new PrivacyGuard();

  it('throws PrivacyBlockedError for privacy mode', () => {
    const input = makeInput({ privacyMode: true });
    expect(() => guard.assertAllowed(input)).toThrow(PrivacyBlockedError);
  });

  it('throws PrivacyBlockedError for denied window title', () => {
    const input = makeInput({ appMetadata: { windowTitle: '1Password' } });
    expect(() => guard.assertAllowed(input)).toThrow(PrivacyBlockedError);
  });

  it('does not throw for safe input', () => {
    const input = makeInput({ appMetadata: { windowTitle: 'VS Code' } });
    expect(() => guard.assertAllowed(input)).not.toThrow();
  });

  it('PrivacyBlockedError has correct name', () => {
    const input = makeInput({ privacyMode: true });
    try {
      guard.assertAllowed(input);
    } catch (err: any) {
      expect(err.name).toBe('PrivacyBlockedError');
      expect(err.reason).toContain('Privacy mode');
    }
  });
});

describe('PrivacyGuard feature gates', () => {
  const guard = new PrivacyGuard();

  it('isScreenshotAllowed returns false in privacy mode', () => {
    expect(guard.isScreenshotAllowed(makeInput({ privacyMode: true }))).toBe(false);
  });

  it('isScreenshotAllowed returns false for denied window', () => {
    expect(guard.isScreenshotAllowed(makeInput({ appMetadata: { windowTitle: 'Stripe' } }))).toBe(false);
  });

  it('isScreenshotAllowed returns true for safe window', () => {
    expect(guard.isScreenshotAllowed(makeInput({ appMetadata: { windowTitle: 'VS Code' } }))).toBe(true);
  });

  it('isMemoryWriteAllowed returns false in privacy mode', () => {
    expect(guard.isMemoryWriteAllowed(makeInput({ privacyMode: true }), true)).toBe(false);
  });

  it('isMemoryWriteAllowed returns false when memory disabled globally', () => {
    expect(guard.isMemoryWriteAllowed(makeInput(), false)).toBe(false);
  });

  it('isMemoryWriteAllowed returns true when safe and enabled', () => {
    expect(guard.isMemoryWriteAllowed(makeInput(), true)).toBe(true);
  });
});

describe('singleton privacyGuard', () => {
  it('is an instance of PrivacyGuard', () => {
    expect(privacyGuard).toBeInstanceOf(PrivacyGuard);
  });
});
