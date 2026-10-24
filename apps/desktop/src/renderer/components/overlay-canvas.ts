import type { CanvasDrawShape } from '@screentutor/shared';
import { inkStroke, joinStrokes, penEase, seededRandom, sketchEllipse, sketchLine, type InkStyle, type Pt } from './sketch';

/** The pointer: a small bright cursor, distinct from the orange ink */
const POINTER_COLOR = '#2f7bff';
const POINTER_PULSE_MS = 1400;
const ARRIVAL_BURST_MS = 400;
/** How long the pen takes to draw one mark */
export const DRAW_STROKE_MS = 650;

/** Handwriting for labels and working, bundled with the app (@fontsource/caveat). */
export const HAND_FONT = '"Caveat", "Segoe Print", "Bradley Hand", cursive';

/** Pen colours: bright enough to read over black diagram lines, with a dark halo for white pages. */
const INK = '#ff5b2e';
const INK_ACCENT = '#ffb000';
const INK_HALO = 'rgba(10, 12, 20, 0.55)';
const MARKER = 'rgba(255, 214, 0, 0.38)';

export function setupCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const dpr = window.devicePixelRatio || 1;
  const W = window.innerWidth;
  const H = window.innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  console.log('[canvas] initialized', canvas.width, 'x', canvas.height, 'dpr=', dpr);
  return ctx;
}

function labelFontSize(equation: boolean): number {
  return equation ? 24 : 22;
}

export function drawCanvasLabel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  options?: { equation?: boolean; alpha?: number }
) {
  const alpha = options?.alpha ?? 1;
  const equation = options?.equation ?? false;
  ctx.save();
  ctx.globalAlpha *= alpha;
  const fontSize = labelFontSize(equation);
  ctx.font = `700 ${fontSize}px ${HAND_FONT}`;
  const paddingX = 12;
  const paddingY = 4;
  const textWidth = ctx.measureText(text).width;
  const boxW = textWidth + paddingX * 2;
  const boxH = fontSize + paddingY * 2;
  const boxX = x - boxW / 2;
  const boxY = y - boxH - 10;

  ctx.fillStyle = 'rgba(14, 16, 28, 0.9)';
  ctx.strokeStyle = equation ? 'rgba(255, 214, 102, 0.75)' : 'rgba(255, 91, 46, 0.8)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, boxW, boxH, 10);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = equation ? '#fff1c1' : '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, boxY + boxH / 2 + 1);
  ctx.restore();
}

function workFontSize(minDim: number): number {
  return Math.round(Math.max(24, Math.min(40, minDim * 0.034)));
}

function workBox(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, minDim: number) {
  const fontSize = workFontSize(minDim);
  ctx.font = `700 ${fontSize}px ${HAND_FONT}`;
  const padX = fontSize * 0.5;
  const padY = fontSize * 0.2;
  const w = ctx.measureText(text).width + padX * 2;
  const h = fontSize + padY * 2;
  return { x: Math.min(x, ctx.canvas.clientWidth - w - 8), y: y - h / 2, w, h, padX, fontSize };
}

/**
 * A written solution line ("working"), left-anchored at (x, y): a small board
 * the line is handwritten onto from left to right as `progress` goes 0 → 1.
 */
export function drawWorkLine(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  minDim: number,
  progress = 1
) {
  ctx.save();
  const box = workBox(ctx, x, y, text, minDim);
  ctx.fillStyle = 'rgba(14, 16, 28, 0.88)';
  ctx.strokeStyle = 'rgba(255, 214, 102, 0.7)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(box.x, box.y, box.w, box.h, 12);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.rect(box.x, box.y, box.padX + (box.w - box.padX) * Math.max(0, Math.min(1, progress)), box.h);
  ctx.clip();
  ctx.fillStyle = '#fff1c1';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, box.x + box.padX, y + 1);
  ctx.restore();
}

interface ShapeInk {
  key: string;
  strokes: Pt[][];
}

/** Stroke geometry per shape and screen size: built once, so the wobble doesn't shimmer. */
const inkCache = new WeakMap<CanvasDrawShape, ShapeInk>();

/** Which way a corner mark opens: into the figure (or the middle of the screen if unknown). */
function inward(v: number, mid: number): number {
  return v <= mid ? 1 : -1;
}

/** Where a side mark's label goes: off its midpoint, on the outside of the figure. */
function labelOutside(shape: CanvasDrawShape, W: number, H: number): Pt {
  const [a, b, c, d] = shape.coords;
  const mid = { x: ((a + c) / 2) * W, y: ((b + d) / 2) * H };
  if (!shape.toward) return mid;
  const dx = (c - a) * W;
  const dy = (d - b) * H;
  const len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len;
  let ny = dx / len;
  if (nx * (mid.x - shape.toward.x * W) + ny * (mid.y - shape.toward.y * H) < 0) {
    nx = -nx;
    ny = -ny;
  }
  // The chip is drawn above its anchor, so pull it down a little when going downward.
  return { x: mid.x + nx * 34, y: mid.y + ny * 34 + (ny > 0.5 ? 34 : 0) };
}

function buildStrokes(shape: CanvasDrawShape, W: number, H: number): Pt[][] {
  const rand = seededRandom(`${shape.kind}:${shape.coords.join(',')}`);
  const minDim = Math.min(W, H);
  const [a, b, c, d] = shape.coords;

  switch (shape.kind) {
    case 'circle':
      return [sketchEllipse(a * W, b * H, Math.max(14, c * minDim), rand)];
    case 'rect': {
      const x1 = a * W;
      const y1 = b * H;
      const x2 = (a + c) * W;
      const y2 = (b + d) * H;
      return [
        joinStrokes([
          sketchLine({ x: x1, y: y1 }, { x: x2, y: y1 }, rand),
          sketchLine({ x: x2, y: y1 }, { x: x2, y: y2 }, rand),
          sketchLine({ x: x2, y: y2 }, { x: x1, y: y2 }, rand),
          sketchLine({ x: x1, y: y2 }, { x: x1, y: y1 }, rand),
        ]),
      ];
    }
    case 'highlight': {
      // One marker swipe across the middle, as tall as the region.
      const midY = (b + d / 2) * H;
      const tilt = (rand() - 0.5) * Math.min(6, d * H * 0.15);
      return [sketchLine({ x: a * W, y: midY + tilt }, { x: (a + c) * W, y: midY - tilt }, rand)];
    }
    case 'underline':
      return [sketchLine({ x: a * W, y: b * H }, { x: c * W, y: d * H }, rand)];
    case 'arrow': {
      const from = { x: a * W, y: b * H };
      const to = { x: c * W, y: d * H };
      const shaft = sketchLine(from, to, rand);
      const tip = shaft[shaft.length - 1];
      const angle = Math.atan2(to.y - from.y, to.x - from.x);
      const head = Math.max(12, Math.min(24, Math.hypot(to.x - from.x, to.y - from.y) * 0.14));
      const barb = (side: number) => {
        const spread = Math.PI / 7 + (rand() - 0.5) * 0.15;
        return sketchLine(
          tip,
          { x: tip.x - head * Math.cos(angle + side * spread), y: tip.y - head * Math.sin(angle + side * spread) },
          rand
        );
      };
      return [shaft, barb(-1), barb(1)];
    }
    case 'rightangle': {
      const s = Math.max(16, (c ?? 0.02) * minDim);
      const px = a * W;
      const py = b * H;
      const mid = shape.toward ? { x: shape.toward.x * W, y: shape.toward.y * H } : { x: W / 2, y: H / 2 };
      const dx = inward(px, mid.x) * s;
      const dy = inward(py, mid.y) * s;
      return [
        joinStrokes([
          sketchLine({ x: px + dx, y: py }, { x: px + dx, y: py + dy }, rand),
          sketchLine({ x: px + dx, y: py + dy }, { x: px, y: py + dy }, rand),
        ]),
      ];
    }
    default:
      return [];
  }
}

function shapeStrokes(shape: CanvasDrawShape, W: number, H: number): Pt[][] {
  const key = `${W}x${H}`;
  const cached = inkCache.get(shape);
  if (cached?.key === key) return cached.strokes;
  const strokes = buildStrokes(shape, W, H);
  inkCache.set(shape, { key, strokes });
  return strokes;
}

function strokeLength(pts: Pt[]): number {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return len;
}

/** Draw strokes in order, the pen moving at one speed across all of them. */
function drawStrokes(ctx: CanvasRenderingContext2D, strokes: Pt[][], progress: number, style: InkStyle) {
  const lens = strokes.map(strokeLength);
  const total = lens.reduce((s, l) => s + l, 0) || 1;
  let reach = progress * total;
  strokes.forEach((pts, i) => {
    if (reach <= 0) return;
    inkStroke(ctx, pts, Math.min(1, reach / (lens[i] || 1)), style);
    reach -= lens[i];
  });
}

export function inkWidth(minDim: number): number {
  return Math.max(3.5, Math.min(7, minDim * 0.0045));
}

/** How far outside a figure's side its arrow is drawn, in screen pixels. */
export function sideMarkGap(minDim: number): number {
  return inkWidth(minDim) * 2 + 8;
}

export function drawShapeOnCanvas(
  ctx: CanvasRenderingContext2D,
  shape: CanvasDrawShape,
  W: number,
  H: number,
  alpha: number,
  progress = 1
) {
  const t = penEase(progress);
  ctx.save();
  ctx.globalAlpha = alpha;

  const minDim = Math.min(W, H);
  const [a, b, c, d] = shape.coords;
  const pen: InkStyle = { color: INK, width: inkWidth(minDim), halo: INK_HALO };
  const labelAlpha = t > 0.85 ? (t - 0.85) / 0.15 : 0;

  switch (shape.kind) {
    case 'circle': {
      drawStrokes(ctx, shapeStrokes(shape, W, H), t, pen);
      if (labelAlpha && shape.label) {
        drawCanvasLabel(ctx, a * W, b * H - c * minDim, shape.label, { alpha: labelAlpha });
      }
      break;
    }
    case 'rect':
    case 'rightangle':
      drawStrokes(ctx, shapeStrokes(shape, W, H), t, pen);
      break;
    case 'highlight':
      drawStrokes(ctx, shapeStrokes(shape, W, H), t, {
        color: MARKER,
        width: Math.max(14, d * H),
        taper: false,
      });
      break;
    case 'underline':
    case 'arrow': {
      const accent = shape.kind === 'arrow' && /hypot/i.test(shape.label ?? '');
      drawStrokes(ctx, shapeStrokes(shape, W, H), t, accent ? { ...pen, color: INK_ACCENT } : pen);
      if (labelAlpha && shape.label) {
        const at = labelOutside(shape, W, H);
        drawCanvasLabel(ctx, at.x, at.y, shape.label, { alpha: labelAlpha });
      }
      break;
    }
    case 'label': {
      const text = shape.label ?? '';
      const equation = /[=²√^+\-*/()]/.test(text);
      const scale = 0.92 + 0.08 * t;
      ctx.translate(a * W, b * H);
      ctx.scale(scale, scale);
      ctx.translate(-a * W, -b * H);
      drawCanvasLabel(ctx, a * W, b * H, text, { equation, alpha: t });
      break;
    }
    case 'work':
      // Handwritten left to right as it appears; stays for the rest of the explanation.
      drawWorkLine(ctx, a * W, b * H, shape.label ?? '', minDim, progress);
      break;
  }

  ctx.restore();
}

export interface PointerTrailPoint {
  x: number;
  y: number;
  age: number;
}

/** How far the cursor's tip sits from the target's centre (CSS px) */
const CURSOR_TIP_OFFSET = 6;

/** Arrow cursor outline, tip at (0, 0), pointing up and to the left (CSS px). */
const CURSOR_SHAPE: Array<[number, number]> = [
  [0, 0],
  [0, 17],
  [4.4, 13.2],
  [7.3, 19.8],
  [10.2, 18.5],
  [7.4, 12],
  [13, 12],
];

/**
 * The teaching pointer: a small arrow cursor whose tip sits on the target, so it
 * points at a digit or label without covering it. A thin ring keeps pulsing out
 * from the tip so it is easy to spot; a white edge keeps it readable on any page.
 */
export function drawEnhancedPointer(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  timestamp: number,
  label: string,
  trail: PointerTrailPoint[],
  arrivalBurst: { startTime: number } | null
) {
  ctx.save();

  // Trail while moving: a few small fading dots.
  for (const pt of trail) {
    const fade = Math.max(0, 1 - pt.age / 6);
    if (fade <= 0) continue;
    ctx.globalAlpha = fade * 0.45;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 1.5 + fade * 2, 0, Math.PI * 2);
    ctx.fillStyle = POINTER_COLOR;
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Pulse: a thin ring that grows from the tip and fades, over and over.
  const pulse = (timestamp % POINTER_PULSE_MS) / POINTER_PULSE_MS;
  ctx.beginPath();
  ctx.arc(x, y, 3 + pulse * 14, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(47, 123, 255, ${0.6 * (1 - pulse)})`;
  ctx.lineWidth = 2;
  ctx.stroke();

  if (arrivalBurst) {
    const t = Math.min(1, (timestamp - arrivalBurst.startTime) / ARRIVAL_BURST_MS);
    if (t < 1) {
      ctx.beginPath();
      ctx.arc(x, y, 4 + t * 22, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(47, 123, 255, ${0.7 * (1 - t)})`;
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }
  }

  // The cursor: soft shadow, white edge, blue body.
  ctx.beginPath();
  // The tip rests just off the target's lower-right, touching it rather than covering it.
  const tx = x + CURSOR_TIP_OFFSET;
  const ty = y + CURSOR_TIP_OFFSET * 1.4;
  CURSOR_SHAPE.forEach(([cx, cy], i) => (i === 0 ? ctx.moveTo(tx + cx, ty + cy) : ctx.lineTo(tx + cx, ty + cy)));
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(10, 14, 24, 0.45)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetY = 1;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = POINTER_COLOR;
  ctx.fill();
  ctx.restore();

  if (label) {
    drawCanvasLabel(ctx, x, y - 8, label);
  }
}
