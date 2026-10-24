import type { CanvasDrawShape } from './stream-tag-parser.js';
import { sanitizeDrawShape } from './draw-shape-sanitize.js';

const POINT_INNER = /\[POINT:([^\]]+)\]/i;
/** DRAW bodies may hold one level of brackets (working lines like "= [x²/2]₂⁴"). */
const DRAW_INNER = /\[DRAW:((?:[^\[\]]|\[[^\[\]]*\])+)\]/gi;

const ANCHOR_DRIFT = 0.07;
const MAX_SNAPPED_SPAN = 0.45;

function normalizeForDedupe(text: string): string {
  return text
    .toLowerCase()
    .replace(/[−–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactForDedupe(text: string): string {
  return normalizeForDedupe(text)
    .replace(/[()]/g, '')
    .replace(/[^a-z0-9+\-*/=²^]/g, '');
}

export function labelsEquivalent(a: string, b: string): boolean {
  const na = normalizeForDedupe(a);
  const nb = normalizeForDedupe(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const ca = compactForDedupe(a);
  const cb = compactForDedupe(b);
  return ca.length >= 2 && cb.length >= 2 && ca === cb;
}

export function labelAlreadyInProse(prose: string, label: string): boolean {
  const normalizedLabel = normalizeForDedupe(label);
  if (!normalizedLabel || normalizedLabel.length < 2) return false;

  const normalizedProse = normalizeForDedupe(prose);
  if (normalizedProse.includes(normalizedLabel)) return true;

  const compactProse = compactForDedupe(prose);
  const compactLabel = compactForDedupe(label);
  return compactLabel.length >= 2 && compactProse.includes(compactLabel);
}

function dedupePointContent(content: string, prose: string, drawLabelInStep: string | undefined): string {
  const trimmed = content.trim();
  const parts = trimmed.split(':');
  if (parts.length < 2) return trimmed;

  const coords = parts[0];
  const label = parts.slice(1).join(':').trim();
  if (!label) return trimmed;

  if (
    labelAlreadyInProse(prose, label) ||
    (drawLabelInStep && labelsEquivalent(label, drawLabelInStep))
  ) {
    return `${coords}:`;
  }
  return trimmed;
}

function dedupeDrawInner(
  inner: string,
  prose: string,
  pointLabelInStep: string | undefined
): string | null {
  const trimmed = inner.trim();
  if (trimmed.toLowerCase() === 'clear') return trimmed;

  const parts = trimmed.split(':');
  if (parts.length <= 2) return trimmed;

  const kind = parts[0].toLowerCase();
  const label = parts.slice(2).join(':').trim();
  if (!label) return trimmed;

  const redundantWithProse = labelAlreadyInProse(prose, label);
  const redundantWithPoint =
    pointLabelInStep && labelsEquivalent(label, pointLabelInStep);

  if (redundantWithProse || redundantWithPoint) {
    if (kind === 'label') return null;
    return parts.slice(0, 2).join(':');
  }
  return trimmed;
}

/** Remove tag labels that repeat prose or duplicate the step's POINT label. */
export function dedupeRedundantTagLabels(text: string): string {
  if (!text) return text;

  return text
    .split('\n')
    .map((line) => {
      const drawLabelsInLine: string[] = [];
      for (const m of line.matchAll(/\[DRAW:(?!clear)((?:[^\[\]]|\[[^\[\]]*\])+)\]/gi)) {
        const inner = m[1].trim();
        const parts = inner.split(':');
        if (parts.length > 2) {
          drawLabelsInLine.push(parts.slice(2).join(':'));
        }
      }

      const tagRegex = /\[(POINT|DRAW):((?:[^\[\]]|\[[^\[\]]*\])+)\]/gi;
      let result = '';
      let lastIndex = 0;
      let proseSoFar = '';
      let pointLabelInStep: string | undefined;
      let drawIndex = 0;
      let match: RegExpExecArray | null;

      while ((match = tagRegex.exec(line)) !== null) {
        result += line.substring(lastIndex, match.index);
        proseSoFar += line.substring(lastIndex, match.index);

        const kind = match[1].toUpperCase();
        const content = match[2];

        if (kind === 'POINT') {
          const upcomingDrawLabel = drawLabelsInLine[drawIndex];
          const rewritten = dedupePointContent(content, proseSoFar, upcomingDrawLabel);
          result += `[POINT:${rewritten}]`;
          const parts = rewritten.trim().split(':');
          pointLabelInStep = parts.length > 1 ? parts.slice(1).join(':').trim() : undefined;
        } else if (content.trim().toLowerCase() === 'clear') {
          result += match[0];
          pointLabelInStep = undefined;
          drawIndex = 0;
        } else if (/^\s*(work|key|gloss):/i.test(content)) {
          // Working lines, shortcuts and glosses intentionally repeat the sentence: keep them verbatim.
          result += match[0];
          drawIndex++;
        } else {
          const rewritten = dedupeDrawInner(content, proseSoFar, pointLabelInStep);
          if (rewritten !== null) {
            result += `[DRAW:${rewritten}]`;
          }
          drawIndex++;
        }

        lastIndex = match.index + match[0].length;
      }

      result += line.substring(lastIndex);
      return result;
    })
    .join('\n');
}

/** Drop a shape's canvas label when it duplicates the active pointer label. */
export function stripDuplicateShapeLabel(
  shape: CanvasDrawShape,
  pointerLabel: string | undefined
): CanvasDrawShape {
  // Working lines, shortcuts and glosses carry their own content, not a name for the target.
  if (!shape.label || !pointerLabel || ['work', 'key', 'gloss'].includes(shape.kind)) return shape;
  if (!labelsEquivalent(shape.label, pointerLabel)) return shape;
  return { ...shape, label: undefined };
}

function parsePointCoords(content: string): { x: number; y: number } | null {
  const trimmed = content.trim();
  if (trimmed.toLowerCase() === 'none') return null;
  const parts = trimmed.split(':');
  if (parts.length < 2) return null;
  const coords = parts[0].split(',');
  if (coords.length !== 2) return null;
  const x = parseFloat(coords[0]);
  const y = parseFloat(coords[1]);
  return isNaN(x) || isNaN(y) ? null : { x, y };
}

export function shapeCenter(shape: CanvasDrawShape): { x: number; y: number } {
  const [a, b, c, d] = shape.coords;
  switch (shape.kind) {
    case 'circle':
      return { x: a, y: b };
    case 'rect':
    case 'highlight':
      return { x: a + c / 2, y: b + d / 2 };
    case 'arrow':
    case 'underline':
      return { x: (a + c) / 2, y: (b + d) / 2 };
    case 'label':
    case 'rightangle':
      return { x: a, y: b };
    default:
      return { x: 0.5, y: 0.5 };
  }
}

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function clamp01(n: number): number {
  if (isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/** Snap a line segment (arrow/underline) so it passes through the anchor point. */
function snapLineToPoint(
  shape: CanvasDrawShape,
  point: { x: number; y: number }
): CanvasDrawShape {
  const [x1, y1, x2, y2] = shape.coords;
  const centerDrift = dist({ x: (x1 + x2) / 2, y: (y1 + y2) / 2 }, point);

  const len = Math.hypot(x2 - x1, y2 - y1) || 0.08;
  const dirX = (x2 - x1) / len;
  const dirY = (y2 - y1) / len;

  if (centerDrift <= ANCHOR_DRIFT) {
    return shape;
  }

  const half = Math.min(len / 2, MAX_SNAPPED_SPAN / 2);
  return {
    ...shape,
    coords: [
      clamp01(point.x - dirX * half),
      clamp01(point.y - dirY * half),
      clamp01(point.x + dirX * half),
      clamp01(point.y + dirY * half),
    ],
  };
}

/** Prefer a tight circle at the anchor point instead of a misplaced box. */
export function snapShapeToPoint(
  shape: CanvasDrawShape,
  point: { x: number; y: number } | null
): CanvasDrawShape | null {
  const sanitized = sanitizeDrawShape(shape);
  if (!sanitized) return null;
  if (!point) return sanitized;

  const center = shapeCenter(sanitized);
  const drift = dist(center, point);

  if (sanitized.kind === 'circle') {
    return { ...sanitized, coords: [point.x, point.y, sanitized.coords[2]] };
  }

  if (sanitized.kind === 'rect' || sanitized.kind === 'highlight') {
    if (drift > 0.08) {
      return {
        kind: 'circle',
        coords: [point.x, point.y, 0.035],
        label: sanitized.label,
      };
    }
    const [x, y, w, h] = sanitized.coords;
    const px = Math.max(0, Math.min(1 - w, point.x - w / 2));
    const py = Math.max(0, Math.min(1 - h, point.y - h / 2));
    return { ...sanitized, coords: [px, py, w, h] };
  }

  if (sanitized.kind === 'arrow' || sanitized.kind === 'underline') {
    return snapLineToPoint(sanitized, point);
  }

  if (sanitized.kind === 'label') {
    if (drift > ANCHOR_DRIFT) {
      return { ...sanitized, coords: [point.x, Math.max(0.04, point.y - 0.05)] };
    }
    return sanitized;
  }

  if (sanitized.kind === 'rightangle') {
    return { ...sanitized, coords: [point.x, point.y, sanitized.coords[2]] };
  }

  return sanitized;
}

/**
 * Rewrite overlay tags so draws follow the nearest preceding POINT and cap count.
 * Prevents orphan rectangles floating away from the diagram.
 */
export function refineOverlayAnnotationTags(text: string): string {
  if (!text) return text;

  text = dedupeRedundantTagLabels(text);

  const parts: string[] = [];
  let lastIndex = 0;
  let lastPoint: { x: number; y: number } | null = null;
  let drawCount = 0;
  const MAX_DRAWS = 20;

  const tagRegex = /\[(POINT|DRAW):((?:[^\[\]]|\[[^\[\]]*\])+)\]/gi;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(text)) !== null) {
    parts.push(text.substring(lastIndex, match.index));
    const kind = match[1].toUpperCase();
    const content = match[2];

    if (kind === 'POINT') {
      const pt = parsePointCoords(content);
      if (pt) lastPoint = pt;
      parts.push(match[0]);
    } else if (content.trim().toLowerCase() === 'clear') {
      drawCount = 0;
      parts.push(match[0]);
    } else if (drawCount >= MAX_DRAWS) {
      // drop excess draw tags
    } else {
      const inner = content.trim();
      const kindDraw = inner.split(':')[0]?.toLowerCase();
      const coordPart = inner.split(':')[1];
      const label = inner.split(':').slice(2).join(':');
      const nums = coordPart?.split(',').map((n) => parseFloat(n.trim())) ?? [];

      let shape: CanvasDrawShape | null = null;
      if (kindDraw === 'circle' && nums.length >= 3) {
        shape = { kind: 'circle', coords: nums.slice(0, 3), label };
      } else if ((kindDraw === 'rect' || kindDraw === 'highlight') && nums.length >= 4) {
        shape = { kind: kindDraw as 'rect' | 'highlight', coords: nums.slice(0, 4), label };
      } else if ((kindDraw === 'arrow' || kindDraw === 'underline') && nums.length >= 4) {
        shape = { kind: kindDraw as 'arrow' | 'underline', coords: nums.slice(0, 4), label };
      } else if (kindDraw === 'label' && nums.length >= 2) {
        shape = { kind: 'label', coords: nums.slice(0, 2), label: label || 'label' };
      } else if (kindDraw === 'rightangle' && nums.length >= 2) {
        shape = { kind: 'rightangle', coords: [nums[0], nums[1], nums[2] ?? 0.02] };
      } else if (kindDraw === 'work' && nums.length >= 2 && label) {
        // Working lines live in blank space by design: never snap them to the pointer.
        const work = sanitizeDrawShape({ kind: 'work', coords: nums.slice(0, 2), label });
        if (work) parts.push(formatDrawTag(work));
        shape = null;
      } else if ((kindDraw === 'key' || kindDraw === 'gloss') && nums.length >= 2 && label) {
        // Placed exactly where the tutor asked (a shortcut beside a control, a word's meaning under it).
        const placed = sanitizeDrawShape({ kind: kindDraw, coords: nums.slice(0, 2), label });
        if (placed) {
          drawCount++;
          parts.push(formatDrawTag(placed));
        }
      } else if ((kindDraw === 'square' || kindDraw === 'move') && nums.length >= 4) {
        // Board squares come from exact board geometry: snapping would only move them off it.
        const placed = sanitizeDrawShape({ kind: kindDraw, coords: nums.slice(0, 4), label: label || undefined });
        if (placed) {
          drawCount++;
          parts.push(formatDrawTag(placed));
        }
      }

      if (shape) {
        const snapped = snapShapeToPoint(shape, lastPoint);
        if (snapped) {
          drawCount++;
          parts.push(formatDrawTag(snapped));
        }
      }
    }

    lastIndex = match.index + match[0].length;
  }

  parts.push(text.substring(lastIndex));
  return parts.join('');
}

function formatDrawTag(shape: CanvasDrawShape): string {
  const label = shape.label ? `:${shape.label}` : '';
  switch (shape.kind) {
    case 'circle':
      return `[DRAW:circle:${shape.coords.join(',')}${label}]`;
    case 'rect':
      return `[DRAW:rect:${shape.coords.join(',')}${label}]`;
    case 'highlight':
      return `[DRAW:highlight:${shape.coords.join(',')}${label}]`;
    case 'arrow':
      return `[DRAW:arrow:${shape.coords.join(',')}${label}]`;
    case 'underline':
      return `[DRAW:underline:${shape.coords.join(',')}${label}]`;
    case 'label':
      return `[DRAW:label:${shape.coords.join(',')}${label}]`;
    case 'rightangle':
      return `[DRAW:rightangle:${shape.coords.join(',')}]`;
    case 'work':
    case 'key':
    case 'gloss':
    case 'square':
    case 'move':
      return `[DRAW:${shape.kind}:${shape.coords.join(',')}${label}]`;
    default:
      return '';
  }
}

export { POINT_INNER, DRAW_INNER };
