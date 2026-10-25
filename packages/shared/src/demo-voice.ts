/**
 * Quicky.AI Demo Voice mode (Part 6.6.5).
 *
 * Isolated, reversible hackathon switch: simulates ONLY the listening /
 * recognition stage. Screen capture, Claude tutoring, Cartesia TTS, and
 * on-screen teaching remain the real pipeline.
 *
 * Set DEMO_VOICE_MODE to false to restore the real STT path.
 */

import type { VoicePhase } from './voice-interaction.js';

/** Flip to false after the hackathon to re-enable real microphone STT. */
export const DEMO_VOICE_MODE = true;

/** Simulated listening duration before auto-submit. */
export const DEMO_VOICE_DURATION_MS = 3000;

/**
 * Hardcoded user question. Claude must still solve whatever is on the
 * captured screen — this text is not a predetermined lesson.
 */
export const DEMO_VOICE_QUESTION = 'Explain me the problem on the screen.';

/** Listening chrome — same as real Voice so the demo looks realistic. */
export const DEMO_VOICE_LISTEN_HINT = 'Listening…';

/** True when Voice must skip getUserMedia / Cartesia STT / SpeechRecognition. */
export function shouldBypassRealStt(demoMode: boolean = DEMO_VOICE_MODE): boolean {
  return demoMode === true;
}

/**
 * Whether the demo listen timer may complete into capture + tutoring.
 * Esc / session bump / phase change must all block submission.
 */
export function shouldCompleteDemoListen(opts: {
  demoMode: boolean;
  eventSessionId: number;
  activeSessionId: number;
  phase: VoicePhase;
}): boolean {
  if (!opts.demoMode) return false;
  if (opts.eventSessionId !== opts.activeSessionId) return false;
  return opts.phase === 'listening';
}

/** Listening chrome label — identical in demo and real modes. */
export function demoVoiceListenLabel(_demoMode: boolean = DEMO_VOICE_MODE): string {
  return 'Listening…';
}
