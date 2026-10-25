import { describe, expect, it, vi } from 'vitest';
import {
  DEMO_VOICE_DURATION_MS,
  DEMO_VOICE_MODE,
  DEMO_VOICE_QUESTION,
  demoVoiceListenLabel,
  shouldBypassRealStt,
  shouldCompleteDemoListen,
} from '@screentutor/shared';

describe('Demo Voice mode (Part 6.6.5)', () => {
  it('enables an isolated demo switch with a 3s listen and hardcoded question', () => {
    expect(DEMO_VOICE_MODE).toBe(true);
    expect(DEMO_VOICE_DURATION_MS).toBe(3000);
    expect(DEMO_VOICE_QUESTION).toBe('Explain me the problem on the screen.');
    expect(shouldBypassRealStt(true)).toBe(true);
    expect(shouldBypassRealStt(false)).toBe(false);
  });

  it('does not request real STT when demo mode is on', () => {
    // Contract: callers must skip getUserMedia / Cartesia / SpeechRecognition.
    expect(shouldBypassRealStt(DEMO_VOICE_MODE)).toBe(true);
  });

  it('keeps listening chrome realistic (no Demo badge)', () => {
    expect(demoVoiceListenLabel(true)).toBe('Listening…');
    expect(demoVoiceListenLabel(false)).toBe('Listening…');
    expect(demoVoiceListenLabel(true)).not.toMatch(/demo/i);
  });

  it('only completes the demo listen for the active listening session', () => {
    expect(
      shouldCompleteDemoListen({
        demoMode: true,
        eventSessionId: 3,
        activeSessionId: 3,
        phase: 'listening',
      })
    ).toBe(true);

    expect(
      shouldCompleteDemoListen({
        demoMode: true,
        eventSessionId: 3,
        activeSessionId: 4,
        phase: 'listening',
      })
    ).toBe(false);

    expect(
      shouldCompleteDemoListen({
        demoMode: true,
        eventSessionId: 3,
        activeSessionId: 3,
        phase: 'cancelled',
      })
    ).toBe(false);

    expect(
      shouldCompleteDemoListen({
        demoMode: false,
        eventSessionId: 3,
        activeSessionId: 3,
        phase: 'listening',
      })
    ).toBe(false);
  });

  it('does not fire the demo timer before DEMO_VOICE_DURATION_MS', () => {
    vi.useFakeTimers();
    let fired = false;
    const sessionId = 1;
    const active = { id: 1, phase: 'listening' as const };
    const handle = setTimeout(() => {
      if (
        shouldCompleteDemoListen({
          demoMode: true,
          eventSessionId: sessionId,
          activeSessionId: active.id,
          phase: active.phase,
        })
      ) {
        fired = true;
      }
    }, DEMO_VOICE_DURATION_MS);

    vi.advanceTimersByTime(DEMO_VOICE_DURATION_MS - 1);
    expect(fired).toBe(false);
    vi.advanceTimersByTime(1);
    expect(fired).toBe(true);
    clearTimeout(handle);
    vi.useRealTimers();
  });

  it('Esc-invalidated sessions never submit the hardcoded question', () => {
    const sessionId = 9;
    // After Esc, active session bumps and phase leaves listening.
    expect(
      shouldCompleteDemoListen({
        demoMode: true,
        eventSessionId: sessionId,
        activeSessionId: sessionId + 1,
        phase: 'idle',
      })
    ).toBe(false);
  });

  it('uses one hardcoded question string per attempt (no duplicates in config)', () => {
    expect(DEMO_VOICE_QUESTION.split('\n').length).toBe(1);
    expect(DEMO_VOICE_QUESTION.trim().length).toBeGreaterThan(0);
  });
});
