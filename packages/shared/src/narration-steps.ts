import { pointBesideWork } from './figure-layout.js';
import { parseStreamTags, type StreamEvent } from './stream-tag-parser.js';

export interface NarrationStep {
  /** TTS line for this beat */
  spoken: string;
  /** Bubble text for this beat (tag-free) */
  display: string;
  /** Raw overlay segment (may contain tags) for event parsing */
  overlaySegment: string;
  events: StreamEvent[];
}

function splitLines(text: string): string[] {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Ensure each step begins with a canvas reset so shapes do not pile up. */
function ensureStepClear(segment: string): string {
  if (/\[DRAW:clear\]/i.test(segment)) return segment;
  return `[DRAW:clear] ${segment}`;
}

/** Align spoken + overlay lines into narration beats for synced reveal. */
export function buildNarrationSteps(spokenText: string, overlayText: string): NarrationStep[] {
  const spokenLines = splitLines(spokenText);
  const overlayLines = splitLines(overlayText);

  if (spokenLines.length === 0 && overlayLines.length === 0) {
    return [];
  }

  const lineCount = Math.max(spokenLines.length, overlayLines.length, 1);
  const steps: NarrationStep[] = [];

  for (let i = 0; i < lineCount; i++) {
    // Extra overlay lines get no speech of their own (repeating the last sentence
    // would make the voice say it twice); they play right after the previous step.
    const spoken = spokenLines[i] ?? (i === 0 ? spokenText.trim() : '');
    const overlaySegment = ensureStepClear(
      overlayLines[i] ?? overlayLines[overlayLines.length - 1] ?? overlayText.trim()
    );
    const { visibleText, events } = parseStreamTags(overlaySegment);

    steps.push({
      spoken,
      display: visibleText.trim(),
      overlaySegment,
      events: pointBesideWork(events),
    });
  }

  return steps.filter((s) => s.display || s.spoken || s.events.length > 0);
}

/**
 * Estimated speaking time of one narration step, for when there is no audio to
 * follow (muted). Fitted to Cartesia Sonic on a 9-step geometry explanation:
 * ~1.3 s per sentence (including the pause after it) plus ~66 ms per character.
 */
export function estimateStepDurationMs(spoken: string): number {
  const chars = spoken.trim().length;
  return chars === 0 ? 0 : Math.round(1280 + 66 * chars);
}

/** Rough TTS duration from character count (~14 chars/sec). */
export function estimateSpeechDurationMs(text: string): number {
  const chars = text.trim().length;
  return Math.max(3000, Math.min(120000, chars * 72));
}
