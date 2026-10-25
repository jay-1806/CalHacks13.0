/**
 * Pure Voice interaction helpers for Quicky.AI (Part 6.6 / 6.6.2).
 * Click Voice → listen → transcript → Chat processing → teach when first step ready.
 * Escape stops the active phase without resuming late work.
 */

/** Minimum Chat visibility while processing (readability). Readiness still wins if slower. */
export const VOICE_CHAT_MIN_VISIBLE_MS = 2000;
/** @deprecated Prefer VOICE_CHAT_MIN_VISIBLE_MS — no idle pre-submit countdown. */
export const VOICE_PREVIEW_MS = VOICE_CHAT_MIN_VISIBLE_MS;
/** Trailing silence after speech has been detected before auto-finalize. */
export const VOICE_ENDPOINT_SILENCE_MS = 1500;
/** No meaningful speech after mic ready → recover instead of indefinite Listening. */
export const VOICE_NO_SPEECH_MS = 9000;
export const VOICE_MAX_RECORDING_MS = 60_000;

/** Live Chat draft model for one Voice session (interim + finalized segments). */
export interface VoiceTranscriptDraft {
  sessionId: number;
  /** Stable finalized text (append-only for delta providers; replaced for cumulative). */
  finalized: string;
  /** Current interim / cumulative in-progress text. */
  interim: string;
  revision: number;
  finalizedOnce: boolean;
}

export function createVoiceTranscriptDraft(sessionId: number): VoiceTranscriptDraft {
  return {
    sessionId,
    finalized: '',
    interim: '',
    revision: 0,
    finalizedOnce: false,
  };
}

/** Display string for Chat: prefer interim when present, else finalized. */
export function displayedVoiceTranscript(draft: VoiceTranscriptDraft): string {
  const interim = draft.interim.trim();
  if (interim) return draft.interim;
  return draft.finalized;
}

/**
 * Apply a provider transcript update into one Chat draft.
 * - cumulative: replace interim (Cartesia turn.update / Web Speech interim)
 * - final cumulative: lock finalized, clear interim
 * - final delta: append to finalized (Cartesia manual is_final deltas)
 * Ignores updates for other sessions or after finalization (unless force).
 */
export function applyVoiceTranscriptUpdate(
  draft: VoiceTranscriptDraft,
  update: {
    sessionId: number;
    text: string;
    isFinal: boolean;
    /** When true, text is the full turn so far (replace). Default true for live UX. */
    cumulative?: boolean;
  }
): VoiceTranscriptDraft {
  if (update.sessionId !== draft.sessionId) return draft;
  if (draft.finalizedOnce && !update.isFinal) return draft;

  const cumulative = update.cumulative !== false;
  const text = update.text ?? '';

  if (update.isFinal) {
    if (draft.finalizedOnce) return draft;
    const finalized = cumulative ? text : `${draft.finalized}${text}`;
    return {
      ...draft,
      finalized,
      interim: '',
      revision: draft.revision + 1,
      finalizedOnce: true,
    };
  }

  if (cumulative) {
    return {
      ...draft,
      interim: text,
      revision: draft.revision + 1,
    };
  }

  return {
    ...draft,
    interim: `${draft.finalized}${text}`,
    revision: draft.revision + 1,
  };
}

/** Cartesia Auto STT (`/stt/turns/websocket`) event → draft + endpoint signal. */
export function reduceCartesiaTurnEvent(
  draft: VoiceTranscriptDraft,
  event: { type?: string; transcript?: string }
): { draft: VoiceTranscriptDraft; endpoint: boolean } {
  const type = event.type;
  if (type === 'turn.update' || type === 'turn.eager_end') {
    return {
      draft: applyVoiceTranscriptUpdate(draft, {
        sessionId: draft.sessionId,
        text: event.transcript ?? '',
        isFinal: false,
        cumulative: true,
      }),
      endpoint: false,
    };
  }
  if (type === 'turn.end') {
    return {
      draft: applyVoiceTranscriptUpdate(draft, {
        sessionId: draft.sessionId,
        text: event.transcript ?? '',
        isFinal: true,
        cumulative: true,
      }),
      endpoint: true,
    };
  }
  return { draft, endpoint: false };
}

/** Electron accelerators (macOS Cmd / Windows Ctrl). */
export const QUICKY_HOTKEY_VOICE = 'CommandOrControl+Alt+1';
export const QUICKY_HOTKEY_CAPTURE = 'CommandOrControl+Alt+2';
export const QUICKY_HOTKEY_TEXT = 'CommandOrControl+Alt+3';
/** Fallback Stop when temporary Escape registration fails. */
export const QUICKY_HOTKEY_STOP_FALLBACK = 'CommandOrControl+Alt+0';
export const QUICKY_HOTKEY_ESCAPE = 'Escape';

export type QuickyHotkeyAction = 'voice' | 'capture' | 'text' | 'stop';

export function hotkeyLabel(accelerator: string, platform: 'darwin' | 'win32' | string): string {
  const isMac = platform === 'darwin';
  return accelerator
    .replace(/CommandOrControl/g, isMac ? 'Cmd' : 'Ctrl')
    .replace(/Alt/g, isMac ? 'Option' : 'Alt')
    .replace(/\+/g, isMac ? ' + ' : '+');
}

export type VoicePhase =
  | 'idle'
  | 'requesting_permission'
  | 'listening'
  | 'finalizing'
  | 'transcribing'
  | 'capturing'
  | 'chat_processing'
  | 'teaching'
  | 'stopped'
  | 'cancelled'
  | 'error'
  /** @deprecated Part 6.6.2 — idle countdown removed; mapped to chat_processing. */
  | 'previewing'
  /** @deprecated Use chat_processing. */
  | 'submitting';

export type VoiceStopReason =
  | 'user_escape'
  | 'user_cancel'
  | 'user_stop_button'
  | 'hotkey'
  | 'error'
  | 'complete';

/** True while Escape / Stop should cancel in-flight Voice or teaching work. */
export function isVoiceActivityPhase(phase: VoicePhase): boolean {
  return (
    phase === 'requesting_permission' ||
    phase === 'listening' ||
    phase === 'finalizing' ||
    phase === 'transcribing' ||
    phase === 'previewing' ||
    phase === 'submitting' ||
    phase === 'capturing' ||
    phase === 'chat_processing' ||
    phase === 'teaching'
  );
}

/** Terminal outcomes that reject late callbacks. */
export function isVoiceTerminalPhase(phase: VoicePhase): boolean {
  return phase === 'idle' || phase === 'stopped' || phase === 'cancelled' || phase === 'error';
}

/**
 * Apply a Stop request. Idempotent: already-terminal phases stay put.
 * Completed explanation cards are preserved by the UI; this only advances phase.
 */
export function applyVoiceStop(phase: VoicePhase, _reason: VoiceStopReason): VoicePhase {
  if (isVoiceTerminalPhase(phase) && phase !== 'idle') return phase;
  if (phase === 'idle') return 'idle';
  if (
    phase === 'previewing' ||
    phase === 'listening' ||
    phase === 'transcribing' ||
    phase === 'finalizing'
  ) {
    return 'cancelled';
  }
  if (
    phase === 'submitting' ||
    phase === 'capturing' ||
    phase === 'chat_processing' ||
    phase === 'teaching'
  ) {
    return 'stopped';
  }
  return 'cancelled';
}

/** Whether a late transcript/SSE/TTS event may still mutate UI. */
export function shouldAcceptVoiceCallback(opts: {
  eventSessionId: number;
  activeSessionId: number;
  phase: VoicePhase;
}): boolean {
  if (opts.eventSessionId !== opts.activeSessionId) return false;
  return !isVoiceTerminalPhase(opts.phase) || opts.phase === 'idle';
}

/**
 * Begin tutoring immediately once the transcript is ready (no idle countdown).
 * @deprecated Name kept for tests; use shouldBeginVoiceTeaching.
 */
export function shouldAutoSubmitPreview(opts: {
  phase: VoicePhase;
  sessionId: number;
  previewSessionId: number;
  transcript: string;
  edited: boolean;
}): boolean {
  return shouldBeginVoiceTeaching(opts);
}

/** Start tutoring once for a valid Voice session transcript. */
export function shouldBeginVoiceTeaching(opts: {
  phase: VoicePhase;
  sessionId: number;
  previewSessionId: number;
  transcript: string;
  edited: boolean;
}): boolean {
  if (opts.edited) return false;
  if (opts.sessionId !== opts.previewSessionId) return false;
  if (!opts.transcript.trim()) return false;
  return (
    opts.phase === 'transcribing' ||
    opts.phase === 'capturing' ||
    opts.phase === 'chat_processing' ||
    opts.phase === 'previewing' ||
    opts.phase === 'submitting'
  );
}

/**
 * Hide Chat for teaching when the first step is ready and the minimum
 * visible duration has elapsed (or processing already took longer).
 */
export function shouldHideChatForFirstStep(opts: {
  firstStepReady: boolean;
  chatOpenedAtMs: number;
  nowMs: number;
  minVisibleMs?: number;
  cancelled: boolean;
}): boolean {
  if (opts.cancelled || !opts.firstStepReady) return false;
  const min = opts.minVisibleMs ?? VOICE_CHAT_MIN_VISIBLE_MS;
  return opts.nowMs - opts.chatOpenedAtMs >= min;
}

/**
 * Silence endpointing: only count silence after the user has spoken.
 * Prevents a pre-speech timer from truncating the question.
 */
export function shouldFinalizeFromSilence(opts: {
  hasSpoken: boolean;
  silenceMs: number;
  thresholdMs?: number;
}): boolean {
  if (!opts.hasSpoken) return false;
  return opts.silenceMs >= (opts.thresholdMs ?? VOICE_ENDPOINT_SILENCE_MS);
}

/** Recover when the mic is open but no speech energy arrives. */
export function shouldRecoverFromNoSpeech(opts: {
  hasSpoken: boolean;
  waitingMs: number;
  thresholdMs?: number;
}): boolean {
  if (opts.hasSpoken) return false;
  return opts.waitingMs >= (opts.thresholdMs ?? VOICE_NO_SPEECH_MS);
}
