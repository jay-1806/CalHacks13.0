import { parsePointTag, parseFirstPointTag } from './point-parser.js';
import { parseStreamTags } from './stream-tag-parser.js';
import { refineOverlayAnnotationTags } from './overlay-refine.js';
import { resolveBoardTags } from './chess-board.js';
import type { PointTarget } from './schemas/tutor.js';

export interface PreparedOverlayText {
  /** Raw text with spatial tags — sent to overlay renderer */
  overlayText: string;
  /** Tag-free text for speech bubble / chat display */
  displayText: string;
  pointTarget: PointTarget;
  hasSpatialTags: boolean;
}

const SPATIAL_TAG_PATTERN = /\[(POINT|DRAW):/i;

export function prepareOverlayText(
  spokenText: string,
  visualText?: string
): PreparedOverlayText {
  const rawSpoken = spokenText || '';
  const rawVisual = visualText || '';

  let overlayText = rawVisual || rawSpoken;
  if (!SPATIAL_TAG_PATTERN.test(overlayText) && SPATIAL_TAG_PATTERN.test(rawSpoken)) {
    overlayText = rawSpoken;
  }
  if (!overlayText.trim()) {
    overlayText = '[POINT:none]';
  }

  // Chess: squares named against the [BOARD] become coordinates before anything else reads them.
  overlayText = resolveBoardTags(overlayText);
  overlayText = refineOverlayAnnotationTags(overlayText);

  const hasPointTag = /\[POINT:[^\]]+\]/i.test(overlayText);
  if (!hasPointTag) {
    overlayText = overlayText.trim() ? `${overlayText.trim()} [POINT:none]` : '[POINT:none]';
  }

  const firstPoint = parseFirstPointTag(overlayText);
  const { pointTarget: fallbackTarget } = parsePointTag(overlayText);
  const pointTarget = firstPoint.x !== null ? firstPoint : fallbackTarget;

  const { visibleText: displayText } = parseStreamTags(overlayText);

  return {
    overlayText,
    displayText,
    pointTarget,
    hasSpatialTags: SPATIAL_TAG_PATTERN.test(overlayText),
  };
}

export function stripForTts(text: string): string {
  return parseStreamTags(text).visibleText;
}
