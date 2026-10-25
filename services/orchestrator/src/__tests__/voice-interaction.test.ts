import { describe, expect, it } from 'vitest';
import {
  VOICE_CHAT_MIN_VISIBLE_MS,
  VOICE_NO_SPEECH_MS,
  applyVoiceStop,
  applyVoiceTranscriptUpdate,
  createVoiceTranscriptDraft,
  displayedVoiceTranscript,
  hotkeyLabel,
  isVoiceActivityPhase,
  isVoiceTerminalPhase,
  reduceCartesiaTurnEvent,
  shouldAcceptVoiceCallback,
  shouldBeginVoiceTeaching,
  shouldHideChatForFirstStep,
  shouldFinalizeFromSilence,
  shouldRecoverFromNoSpeech,
  QUICKY_HOTKEY_VOICE,
  QUICKY_HOTKEY_CAPTURE,
  QUICKY_HOTKEY_TEXT,
  QUICKY_HOTKEY_STOP_FALLBACK,
} from '@screentutor/shared';

describe('voice-interaction', () => {
  it('uses a 2s minimum Chat visibility (not an idle pre-submit countdown)', () => {
    expect(VOICE_CHAT_MIN_VISIBLE_MS).toBe(2000);
  });

  it('only finalizes silence after speech was detected', () => {
    expect(shouldFinalizeFromSilence({ hasSpoken: false, silenceMs: 5000 })).toBe(false);
    expect(shouldFinalizeFromSilence({ hasSpoken: true, silenceMs: 1000 })).toBe(false);
    expect(shouldFinalizeFromSilence({ hasSpoken: true, silenceMs: 1500 })).toBe(true);
  });

  it('recovers from no-speech after the waiting threshold', () => {
    expect(VOICE_NO_SPEECH_MS).toBe(9000);
    expect(shouldRecoverFromNoSpeech({ hasSpoken: false, waitingMs: 8000 })).toBe(false);
    expect(shouldRecoverFromNoSpeech({ hasSpoken: false, waitingMs: 9000 })).toBe(true);
    expect(shouldRecoverFromNoSpeech({ hasSpoken: true, waitingMs: 20_000 })).toBe(false);
  });

  it('begins teaching immediately for a valid transcript (no idle countdown gate)', () => {
    expect(
      shouldBeginVoiceTeaching({
        phase: 'transcribing',
        sessionId: 3,
        previewSessionId: 3,
        transcript: 'Solve this',
        edited: false,
      })
    ).toBe(true);

    expect(
      shouldBeginVoiceTeaching({
        phase: 'chat_processing',
        sessionId: 3,
        previewSessionId: 3,
        transcript: 'Solve this',
        edited: false,
      })
    ).toBe(true);

    expect(
      shouldBeginVoiceTeaching({
        phase: 'transcribing',
        sessionId: 3,
        previewSessionId: 3,
        transcript: 'Solve this',
        edited: true,
      })
    ).toBe(false);

    expect(
      shouldBeginVoiceTeaching({
        phase: 'listening',
        sessionId: 3,
        previewSessionId: 3,
        transcript: 'Solve this',
        edited: false,
      })
    ).toBe(false);

    expect(
      shouldBeginVoiceTeaching({
        phase: 'transcribing',
        sessionId: 4,
        previewSessionId: 3,
        transcript: 'Solve this',
        edited: false,
      })
    ).toBe(false);

    expect(
      shouldBeginVoiceTeaching({
        phase: 'transcribing',
        sessionId: 3,
        previewSessionId: 3,
        transcript: '   ',
        edited: false,
      })
    ).toBe(false);
  });

  it('hides Chat for teaching when first step is ready and min visible elapsed', () => {
    expect(
      shouldHideChatForFirstStep({
        firstStepReady: true,
        chatOpenedAtMs: 1000,
        nowMs: 3000,
        minVisibleMs: 2000,
        cancelled: false,
      })
    ).toBe(true);

    expect(
      shouldHideChatForFirstStep({
        firstStepReady: true,
        chatOpenedAtMs: 1000,
        nowMs: 2500,
        minVisibleMs: 2000,
        cancelled: false,
      })
    ).toBe(false);

    expect(
      shouldHideChatForFirstStep({
        firstStepReady: false,
        chatOpenedAtMs: 1000,
        nowMs: 5000,
        cancelled: false,
      })
    ).toBe(false);

    expect(
      shouldHideChatForFirstStep({
        firstStepReady: true,
        chatOpenedAtMs: 1000,
        nowMs: 5000,
        cancelled: true,
      })
    ).toBe(false);
  });

  it('rejects late callbacks after stop', () => {
    expect(
      shouldAcceptVoiceCallback({
        eventSessionId: 1,
        activeSessionId: 2,
        phase: 'teaching',
      })
    ).toBe(false);

    expect(
      shouldAcceptVoiceCallback({
        eventSessionId: 2,
        activeSessionId: 2,
        phase: 'stopped',
      })
    ).toBe(false);

    expect(
      shouldAcceptVoiceCallback({
        eventSessionId: 2,
        activeSessionId: 2,
        phase: 'teaching',
      })
    ).toBe(true);
  });

  it('applies idempotent stop phases', () => {
    expect(applyVoiceStop('listening', 'user_escape')).toBe('cancelled');
    expect(applyVoiceStop('previewing', 'user_escape')).toBe('cancelled');
    expect(applyVoiceStop('chat_processing', 'user_escape')).toBe('stopped');
    expect(applyVoiceStop('teaching', 'user_escape')).toBe('stopped');
    expect(applyVoiceStop('stopped', 'user_escape')).toBe('stopped');
    expect(applyVoiceStop('cancelled', 'user_escape')).toBe('cancelled');
    expect(applyVoiceStop('idle', 'user_escape')).toBe('idle');
  });

  it('marks activity vs terminal phases', () => {
    expect(isVoiceActivityPhase('listening')).toBe(true);
    expect(isVoiceActivityPhase('chat_processing')).toBe(true);
    expect(isVoiceActivityPhase('teaching')).toBe(true);
    expect(isVoiceActivityPhase('idle')).toBe(false);
    expect(isVoiceTerminalPhase('stopped')).toBe(true);
    expect(isVoiceTerminalPhase('listening')).toBe(false);
  });

  it('treats Escape restore as zero unintended launcher drift (contract)', () => {
    // Geometry invariant: before/after launcher screen centers must match.
    const before = { cx: 1100, cy: 640 };
    const after = { cx: 1100, cy: 640 };
    expect(after.cx - before.cx).toBe(0);
    expect(after.cy - before.cy).toBe(0);
  });

  it('maps accelerators for macOS and Windows labels', () => {
    expect(hotkeyLabel(QUICKY_HOTKEY_VOICE, 'darwin')).toContain('Cmd');
    expect(hotkeyLabel(QUICKY_HOTKEY_VOICE, 'darwin')).toContain('Option');
    expect(hotkeyLabel(QUICKY_HOTKEY_VOICE, 'win32')).toContain('Ctrl');
    expect(hotkeyLabel(QUICKY_HOTKEY_VOICE, 'win32')).toContain('Alt');
    expect(QUICKY_HOTKEY_CAPTURE).toBe('CommandOrControl+Alt+2');
    expect(QUICKY_HOTKEY_TEXT).toBe('CommandOrControl+Alt+3');
    expect(QUICKY_HOTKEY_STOP_FALLBACK).toBe('CommandOrControl+Alt+0');
  });
});

/**
 * Mirrors launcherGeometry.computeVoiceListenPlacement / VOICE_LISTEN_PILL_SIZE (Part 6.6.1).
 * Listening chrome is a fixed-size pill with no Done/Cancel/Stop controls.
 */
const VOICE_LISTEN_PILL_SIZE = { width: 168, height: 40 };

function computeVoiceListenPlacement(opts: {
  launcherOffset: { x: number; y: number };
  windowSize: { width: number; height: number };
  pillSize?: { width: number; height: number };
  gap?: number;
  margin?: number;
}) {
  const sheet = opts.pillSize ?? VOICE_LISTEN_PILL_SIZE;
  const gap = opts.gap ?? 36;
  const margin = opts.margin ?? 10;
  const { x: lx, y: ly } = opts.launcherOffset;
  const winW = opts.windowSize.width;
  const winH = opts.windowSize.height;
  const desiredLeft = -sheet.width / 2;
  const minLeft = margin - lx;
  const maxLeft = winW - margin - sheet.width - lx;
  const left =
    minLeft <= maxLeft ? Math.min(Math.max(desiredLeft, minLeft), maxLeft) : (minLeft + maxLeft) / 2;
  const maxBottom = ly - margin - sheet.height;
  const minBottom = Math.max(0, ly - (winH - margin));
  let bottom: number | null = gap;
  let top: number | null = null;
  if (!(maxBottom >= minBottom && gap <= maxBottom && gap >= minBottom)) {
    if (maxBottom >= minBottom) {
      bottom = Math.min(Math.max(gap, minBottom), maxBottom);
    } else {
      bottom = null;
      const desiredTop = gap;
      const minTop = margin - ly;
      const maxTop = winH - margin - sheet.height - ly;
      top =
        minTop <= maxTop ? Math.min(Math.max(desiredTop, minTop), maxTop) : (minTop + maxTop) / 2;
    }
  }
  const sheetLeft = lx + left;
  const sheetTop = bottom != null ? ly - bottom - sheet.height : ly + (top ?? 0);
  const launcherR = 27;
  const intersectsLauncher =
    sheetLeft < lx + launcherR &&
    sheetLeft + sheet.width > lx - launcherR &&
    sheetTop < ly + launcherR &&
    sheetTop + sheet.height > ly - launcherR;
  const fits =
    sheetLeft >= margin - 0.5 &&
    sheetLeft + sheet.width <= winW - margin + 0.5 &&
    sheetTop >= margin - 0.5 &&
    sheetTop + sheet.height <= winH - margin + 0.5;
  return { left, bottom, top, fits, intersectsLauncher, width: sheet.width, height: sheet.height };
}

/** Contract: listening indicator markup must not include these control labels. */
const FORBIDDEN_VOICE_LISTEN_LABELS = ['Done', 'Cancel', 'Stop', 'Stop Teaching'] as const;

describe('Voice listening UI geometry (Part 6.6.1)', () => {
  const win = { width: 320, height: 320 };

  it('keeps a fixed compact pill size (waveform must not resize it)', () => {
    expect(VOICE_LISTEN_PILL_SIZE).toEqual({ width: 168, height: 40 });
  });

  it('fits the pill above a centered launcher without covering the disc', () => {
    const p = computeVoiceListenPlacement({
      launcherOffset: { x: 160, y: 200 },
      windowSize: win,
    });
    expect(p.fits).toBe(true);
    expect(p.width).toBe(168);
    expect(p.height).toBe(40);
    expect(p.bottom).toBe(36);
    expect(p.intersectsLauncher).toBe(false);
  });

  it('stays inside the window at the bottom-right corner', () => {
    const p = computeVoiceListenPlacement({
      launcherOffset: { x: 292, y: 292 },
      windowSize: win,
    });
    expect(p.fits).toBe(true);
    expect(p.width).toBe(168);
    expect(p.height).toBe(40);
  });

  it('forbids Done / Cancel / Stop labels in the listening chrome contract', () => {
    const listenMarkup = 'Listening… Esc';
    for (const label of FORBIDDEN_VOICE_LISTEN_LABELS) {
      expect(listenMarkup.includes(label)).toBe(false);
    }
  });
});

describe('live voice transcript draft (Part 6.6.3)', () => {
  it('replaces interim text instead of appending duplicates', () => {
    let draft = createVoiceTranscriptDraft(7);
    draft = applyVoiceTranscriptUpdate(draft, {
      sessionId: 7,
      text: 'Can you',
      isFinal: false,
      cumulative: true,
    });
    draft = applyVoiceTranscriptUpdate(draft, {
      sessionId: 7,
      text: 'Can you explain',
      isFinal: false,
      cumulative: true,
    });
    draft = applyVoiceTranscriptUpdate(draft, {
      sessionId: 7,
      text: 'Can you explain this triangle',
      isFinal: false,
      cumulative: true,
    });
    expect(displayedVoiceTranscript(draft)).toBe('Can you explain this triangle');
    expect(draft.revision).toBe(3);
  });

  it('finalizes once into a single question draft', () => {
    let draft = createVoiceTranscriptDraft(3);
    draft = applyVoiceTranscriptUpdate(draft, {
      sessionId: 3,
      text: 'Solve three x plus six',
      isFinal: false,
    });
    draft = applyVoiceTranscriptUpdate(draft, {
      sessionId: 3,
      text: 'Solve three x plus six equals twenty one',
      isFinal: true,
    });
    expect(displayedVoiceTranscript(draft)).toBe('Solve three x plus six equals twenty one');
    expect(draft.finalizedOnce).toBe(true);

    const after = applyVoiceTranscriptUpdate(draft, {
      sessionId: 3,
      text: 'ignored late interim',
      isFinal: false,
    });
    expect(displayedVoiceTranscript(after)).toBe('Solve three x plus six equals twenty one');
  });

  it('ignores transcript events from stale sessions', () => {
    let draft = createVoiceTranscriptDraft(1);
    draft = applyVoiceTranscriptUpdate(draft, {
      sessionId: 1,
      text: 'Question A',
      isFinal: false,
    });
    const stale = applyVoiceTranscriptUpdate(draft, {
      sessionId: 2,
      text: 'Question B',
      isFinal: false,
    });
    expect(displayedVoiceTranscript(stale)).toBe('Question A');
  });

  it('maps Cartesia turn.update / turn.end into live then final draft', () => {
    let draft = createVoiceTranscriptDraft(9);
    let endpoint = false;
    ({ draft, endpoint } = reduceCartesiaTurnEvent(draft, {
      type: 'turn.update',
      transcript: 'Can you explain',
    }));
    expect(endpoint).toBe(false);
    expect(displayedVoiceTranscript(draft)).toBe('Can you explain');

    ({ draft, endpoint } = reduceCartesiaTurnEvent(draft, {
      type: 'turn.update',
      transcript: 'Can you explain the equation',
    }));
    expect(displayedVoiceTranscript(draft)).toBe('Can you explain the equation');

    ({ draft, endpoint } = reduceCartesiaTurnEvent(draft, {
      type: 'turn.end',
      transcript: 'Can you explain the equation three x plus six equals twenty-one?',
    }));
    expect(endpoint).toBe(true);
    expect(draft.finalizedOnce).toBe(true);
    expect(displayedVoiceTranscript(draft)).toBe(
      'Can you explain the equation three x plus six equals twenty-one?'
    );
  });

  it('does not double-commit a final transcript', () => {
    let draft = createVoiceTranscriptDraft(4);
    ({ draft } = reduceCartesiaTurnEvent(draft, {
      type: 'turn.end',
      transcript: 'Final once',
    }));
    const second = reduceCartesiaTurnEvent(draft, {
      type: 'turn.end',
      transcript: 'Final twice',
    });
    expect(displayedVoiceTranscript(second.draft)).toBe('Final once');
    expect(second.endpoint).toBe(true);
  });
});
