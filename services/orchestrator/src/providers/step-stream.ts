import { prepareOverlayText, stripForTts, type TutorStreamStep } from '@screentutor/shared';

/** A step's text on one line: steps are joined with newlines, so a stray one would split it. */
export function oneLine(text: unknown): string {
  return String(text ?? '')
    .replace(/\s*\n+\s*/g, ' ')
    .trim();
}

/**
 * Turns the raw steps Claude writes ({ spoken, visual }) into the steps the app
 * plays, one at a time as they arrive. Each step's overlay is computed exactly as
 * the finished answer's overlayText will be (board squares resolved, tags
 * refined): every earlier step is processed again with it, and processing a
 * prefix gives the same lines as processing the whole answer.
 */
export class TutorStepStreamer {
  private spoken: string[] = [];
  private visual: string[] = [];

  constructor(private readonly onStep: (step: TutorStreamStep) => void) {}

  push(raw: unknown): void {
    const step = (raw ?? {}) as { spoken?: unknown; visual?: unknown };
    this.spoken.push(oneLine(step.spoken));
    this.visual.push(oneLine(step.visual));
    const index = this.visual.length - 1;
    const { overlayText } = prepareOverlayText(this.spoken.join('\n'), this.visual.join('\n'));
    this.onStep({
      index,
      spoken: stripForTts(this.spoken[index]),
      overlay: overlayText.split('\n')[index] ?? '',
    });
  }
}
