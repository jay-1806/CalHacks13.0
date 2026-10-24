import type { PointTarget } from './schemas/tutor.js';
import { parseStreamTags } from './stream-tag-parser.js';

export interface ParseResult {
  spokenText: string;
  pointTarget: PointTarget;
}

function parsePointFromContent(rawTag: string, content: string): PointTarget | null {
  if (content.toLowerCase() === 'none') {
    return { x: null, y: null, label: '', rawTag };
  }

  const parts = content.split(':');
  if (parts.length < 2) return null;

  const coords = parts[0].split(',');
  if (coords.length !== 2) return null;

  const x = parseFloat(coords[0]);
  const y = parseFloat(coords[1]);
  if (isNaN(x) || isNaN(y)) return null;

  let label = '';
  let screenNumber: number | undefined;

  const lastPart = parts[parts.length - 1].trim();
  const screenMatch = lastPart.toLowerCase().match(/^screen(\d+)$/);

  if (screenMatch) {
    screenNumber = parseInt(screenMatch[1], 10);
    label = parts.slice(1, parts.length - 1).join(':').trim();
  } else {
    const num = parseInt(lastPart, 10);
    if (parts.length >= 3 && !isNaN(num)) {
      screenNumber = num;
      label = parts.slice(1, parts.length - 1).join(':').trim();
    } else {
      label = parts.slice(1).join(':').trim();
    }
  }

  return { x, y, label, rawTag, screenNumber };
}

/** First non-none [POINT] — used to start the pointer near the first explained element. */
export function parseFirstPointTag(text: string): PointTarget {
  const defaultTarget: PointTarget = {
    x: null,
    y: null,
    label: '',
    rawTag: '[POINT:none]',
  };

  if (!text) return defaultTarget;

  const tagRegex = /\[POINT:([^\]]+)\]/gi;
  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(text)) !== null) {
    const parsed = parsePointFromContent(match[0], match[1].trim());
    if (parsed && parsed.x !== null && parsed.y !== null) return parsed;
  }

  return defaultTarget;
}

export function parsePointTag(text: string): ParseResult {
  const defaultTarget: PointTarget = {
    x: null,
    y: null,
    label: '',
    rawTag: '[POINT:none]',
  };

  if (!text) {
    return { spokenText: '', pointTarget: defaultTarget };
  }

  const tagRegex = /\[POINT:([^\]]+)\]/gi;
  let match: RegExpExecArray | null;
  let lastValidTarget: PointTarget | null = null;

  while ((match = tagRegex.exec(text)) !== null) {
    const parsed = parsePointFromContent(match[0], match[1].trim());
    if (parsed) lastValidTarget = parsed;
  }

  return {
    spokenText: parseStreamTags(text).visibleText,
    pointTarget: lastValidTarget || defaultTarget,
  };
}
