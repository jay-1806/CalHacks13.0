import { sanitizeDrawShape } from './draw-shape-sanitize.js';

export interface PointEvent {
  type: 'point';
  index: number;
  x: number;
  y: number;
  label: string;
}

export interface DrawShapeEvent {
  type: 'draw';
  index: number;
  shape: CanvasDrawShape;
}

export interface ClearDrawingsEvent {
  type: 'clear';
  index: number;
}

export type StreamEvent = PointEvent | DrawShapeEvent | ClearDrawingsEvent;

export interface CanvasDrawShape {
  /**
   * `work` is a written solution line (e.g. an equation) placed in blank space; unlike
   * other shapes it stays on screen for the rest of the explanation.
   */
  kind: 'circle' | 'rect' | 'arrow' | 'underline' | 'highlight' | 'label' | 'rightangle' | 'work';
  /** Normalized 0–1 coordinates; meaning depends on kind */
  coords: number[];
  label?: string;
  /**
   * The middle of the figure this mark belongs to (normalized), set by the overlay:
   * side marks sit just outside the figure and corner marks open into it.
   */
  toward?: { x: number; y: number };
}

export interface ParsedStreamText {
  visibleText: string;
  events: StreamEvent[];
}

const POINT_TAG_REGEX = /\[POINT:([^\]]+)\]/gi;
const DRAW_TAG_REGEX = /\[DRAW:([^\]]+)\]/gi;

interface RawTagMatch {
  start: number;
  end: number;
  /** null for a tag that could not be parsed: it is removed from the text but emits nothing */
  event: Omit<PointEvent, 'index'> | Omit<DrawShapeEvent, 'index'> | Omit<ClearDrawingsEvent, 'index'> | null;
}

function parsePointContent(content: string): Omit<PointEvent, 'index' | 'type'> | null {
  const trimmed = content.trim();
  if (trimmed.toLowerCase() === 'none') return null;

  const parts = trimmed.split(':');
  if (parts.length < 2) return null;

  const coords = parts[0].split(',');
  if (coords.length !== 2) return null;

  const x = parseFloat(coords[0]);
  const y = parseFloat(coords[1]);
  if (isNaN(x) || isNaN(y)) return null;

  let label = parts.slice(1).join(':').trim();
  const screenMatch = label.toLowerCase().match(/^screen(\d+)$/);
  if (screenMatch) {
    label = parts.slice(1, -1).join(':').trim();
  }

  return { x, y, label };
}

function parseDrawContent(content: string): CanvasDrawShape | 'clear' | null {
  const trimmed = content.trim();
  if (trimmed.toLowerCase() === 'clear') return 'clear';

  const parts = trimmed.split(':');
  if (parts.length < 2) return null;

  const kind = parts[0].toLowerCase();
  const coordPart = parts[1];
  const label = parts.length > 2 ? parts.slice(2).join(':').trim() : undefined;
  const nums = coordPart.split(',').map((n) => parseFloat(n.trim()));

  switch (kind) {
    case 'circle':
      if (nums.length < 3 || nums.some(isNaN)) return null;
      return { kind: 'circle', coords: nums.slice(0, 3), label };
    case 'rect':
    case 'highlight':
      if (nums.length < 4 || nums.some(isNaN)) return null;
      return { kind: kind as 'rect' | 'highlight', coords: nums.slice(0, 4), label };
    case 'arrow':
    case 'underline':
      if (nums.length < 4 || nums.some(isNaN)) return null;
      return { kind: kind as 'arrow' | 'underline', coords: nums.slice(0, 4), label };
    case 'label':
      if (nums.length < 2 || nums.some(isNaN)) return null;
      return { kind: 'label', coords: nums.slice(0, 2), label: label || 'label' };
    case 'work':
      if (nums.length < 2 || nums.some(isNaN) || !label) return null;
      return { kind: 'work', coords: nums.slice(0, 2), label };
    case 'rightangle': {
      if (nums.length < 2 || nums.some(isNaN)) return null;
      const size = nums.length >= 3 && !isNaN(nums[2]) ? nums[2] : 0.02;
      return { kind: 'rightangle', coords: [nums[0], nums[1], size] };
    }
    default:
      return null;
  }
}

function findAllTags(text: string): RawTagMatch[] {
  const matches: RawTagMatch[] = [];

  const pointRegex = new RegExp(POINT_TAG_REGEX.source, 'gi');
  let match: RegExpExecArray | null;
  while ((match = pointRegex.exec(text)) !== null) {
    const parsed = parsePointContent(match[1]);
    // An unparseable tag ([POINT:none], letters for coords) still gets stripped, with no
    // event, so it never reaches the bubble text or the voice.
    matches.push({
      start: match.index,
      end: match.index + match[0].length,
      event: parsed ? { type: 'point', ...parsed } : null,
    });
  }

  const drawRegex = new RegExp(DRAW_TAG_REGEX.source, 'gi');
  while ((match = drawRegex.exec(text)) !== null) {
    const parsed = parseDrawContent(match[1]);
    if (parsed === 'clear') {
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        event: { type: 'clear' },
      });
    } else {
      const sanitized = parsed ? sanitizeDrawShape(parsed) : null;
      matches.push({
        start: match.index,
        end: match.index + match[0].length,
        event: sanitized ? { type: 'draw', shape: sanitized } : null,
      });
    }
  }

  return matches.sort((a, b) => a.start - b.start);
}

/** Parse inline [POINT] and [DRAW] tags, returning clean visible text and ordered events. */
export function parseStreamTags(text: string): ParsedStreamText {
  if (!text) {
    return { visibleText: '', events: [] };
  }

  const matches = findAllTags(text);
  const events: StreamEvent[] = [];
  let visibleText = '';
  let lastIndex = 0;

  for (const tag of matches) {
    visibleText += text.substring(lastIndex, tag.start);
    if (tag.event) events.push({ ...tag.event, index: visibleText.length } as StreamEvent);
    lastIndex = tag.end;
  }

  visibleText += text.substring(lastIndex);

  return { visibleText: collapseDisplayWhitespace(visibleText), events };
}

function collapseDisplayWhitespace(text: string): string {
  return text
    .replace(/[ \t]+/g, ' ')
    .replace(/\s+([.,!?;:])/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Strip spatial tags for TTS — inserts POINT labels so speech stays coherent. */
export function stripStreamTags(text: string): string {
  if (!text) return '';
  return parseStreamTags(text).visibleText;
}
