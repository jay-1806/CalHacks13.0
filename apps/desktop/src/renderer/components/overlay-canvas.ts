import type { CanvasDrawShape } from '@screentutor/shared';

const POINTER_OUTER_R = 14;
const ARRIVAL_BURST_MS = 400;
export const DRAW_STROKE_MS = 450;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

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
  ctx.globalAlpha = alpha;
  const fontSize = equation ? 15 : 13;
  const font = equation
    ? `600 ${fontSize}px "JetBrains Mono", "Fira Code", ui-monospace, monospace`
    : `500 ${fontSize}px Inter, system-ui, sans-serif`;
  ctx.font = font;
  const paddingX = equation ? 14 : 10;
  const paddingY = equation ? 10 : 5;
  const textWidth = ctx.measureText(text).width;
  const boxW = textWidth + paddingX * 2;
  const boxH = fontSize + paddingY * 2;
  const boxX = x - boxW / 2;
  const boxY = y - boxH - 8;

  if (equation) {
    ctx.fillStyle = 'rgba(10, 14, 30, 0.92)';
    ctx.strokeStyle = 'rgba(59, 139, 212, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, 8);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#a8d4ff';
  } else {
    ctx.fillStyle = 'rgba(30, 30, 30, 0.88)';
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, 8);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, boxY + boxH / 2);
  ctx.restore();
}

/** A written solution line ("working"), left-anchored at (x, y) and sized to the screen. */
export function drawWorkLine(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, minDim: number) {
  const fontSize = Math.round(Math.max(18, Math.min(30, minDim * 0.024)));
  ctx.save();
  ctx.shadowBlur = 0;
  ctx.font = `600 ${fontSize}px "JetBrains Mono", "Fira Code", ui-monospace, monospace`;
  const padX = fontSize * 0.6;
  const padY = fontSize * 0.35;
  const boxW = ctx.measureText(text).width + padX * 2;
  const boxH = fontSize + padY * 2;
  const boxX = Math.min(x, ctx.canvas.clientWidth - boxW - 8);
  const boxY = y - boxH / 2;
  ctx.fillStyle = 'rgba(10, 14, 30, 0.86)';
  ctx.strokeStyle = 'rgba(255, 196, 61, 0.85)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(boxX, boxY, boxW, boxH, 10);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffe39a';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, boxX + padX, y);
  ctx.restore();
}

export function drawShapeOnCanvas(
  ctx: CanvasRenderingContext2D,
  shape: CanvasDrawShape,
  W: number,
  H: number,
  alpha: number,
  progress = 1
) {
  const t = easeOutCubic(Math.max(0, Math.min(1, progress)));
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowBlur = 10;

  const minDim = Math.min(W, H);
  const [a, b, c, d] = shape.coords;

  switch (shape.kind) {
    case 'circle': {
      const cx = a * W;
      const cy = b * H;
      const r = c * minDim;
      ctx.strokeStyle = 'rgba(59, 139, 212, 0.92)';
      ctx.fillStyle = 'rgba(59, 139, 212, 0.12)';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = 'rgba(59, 139, 212, 0.5)';
      ctx.beginPath();
      ctx.arc(cx, cy, r * t, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * t);
      ctx.stroke();
      if (t > 0.85 && shape.label) drawCanvasLabel(ctx, cx, cy - r, shape.label, { alpha: (t - 0.85) / 0.15 });
      break;
    }
    case 'rect': {
      const fullW = c * W;
      const fullH = d * H;
      const cx = (a + c / 2) * W;
      const cy = (b + d / 2) * H;
      const w = fullW * t;
      const h = fullH * t;
      ctx.strokeStyle = 'rgba(59, 139, 212, 0.92)';
      ctx.fillStyle = 'rgba(59, 139, 212, 0.15)';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = 'rgba(59, 139, 212, 0.5)';
      ctx.beginPath();
      ctx.roundRect(cx - w / 2, cy - h / 2, w, h, 6);
      ctx.stroke();
      ctx.fill();
      break;
    }
    case 'highlight': {
      const fullW = c * W;
      const fullH = d * H;
      const cx = (a + c / 2) * W;
      const cy = (b + d / 2) * H;
      ctx.fillStyle = `rgba(255, 220, 0, ${0.22 * t})`;
      ctx.shadowColor = 'rgba(255, 200, 0, 0.3)';
      ctx.shadowBlur = 6;
      ctx.fillRect(cx - (fullW * t) / 2, cy - (fullH * t) / 2, fullW * t, fullH * t);
      break;
    }
    case 'underline': {
      const x1 = a * W;
      const y1 = b * H;
      const endX = c * W;
      const endY = d * H;
      const x2 = x1 + (endX - x1) * t;
      const y2 = y1 + (endY - y1) * t;
      ctx.strokeStyle = 'rgba(59, 139, 212, 0.92)';
      ctx.lineWidth = 3;
      ctx.shadowColor = 'rgba(59, 139, 212, 0.5)';
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      if (t > 0.85 && shape.label) {
        drawCanvasLabel(ctx, (x1 + x2) / 2, y1, shape.label, { alpha: (t - 0.85) / 0.15 });
      }
      break;
    }
    case 'arrow': {
      const x1 = a * W;
      const y1 = b * H;
      const endX = c * W;
      const endY = d * H;
      const x2 = x1 + (endX - x1) * t;
      const y2 = y1 + (endY - y1) * t;
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const headLen = 18;
      const isHypotenuse = /hypot/i.test(shape.label ?? '');
      ctx.strokeStyle = isHypotenuse ? 'rgba(255, 112, 67, 0.95)' : 'rgba(79, 195, 247, 0.95)';
      ctx.lineWidth = isHypotenuse ? 3.5 : 2.5;
      ctx.shadowColor = isHypotenuse ? 'rgba(255, 112, 67, 0.5)' : 'rgba(79, 195, 247, 0.5)';
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      if (t > 0.75) {
        const headT = (t - 0.75) / 0.25;
        ctx.globalAlpha = alpha * headT;
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(
          x2 - headLen * Math.cos(angle - Math.PI / 7),
          y2 - headLen * Math.sin(angle - Math.PI / 7)
        );
        ctx.lineTo(
          x2 - headLen * Math.cos(angle + Math.PI / 7),
          y2 - headLen * Math.sin(angle + Math.PI / 7)
        );
        ctx.closePath();
        ctx.fillStyle = ctx.strokeStyle as string;
        ctx.fill();
      }
      if (t > 0.85 && shape.label) {
        drawCanvasLabel(ctx, (x1 + x2) / 2, (y1 + y2) / 2, shape.label, { alpha: (t - 0.85) / 0.15 });
      }
      break;
    }
    case 'label': {
      const text = shape.label ?? '';
      const equation = /[=²√^+\-*/()]/.test(text);
      const scale = 0.92 + 0.08 * t;
      ctx.save();
      ctx.translate(a * W, b * H);
      ctx.scale(scale, scale);
      ctx.translate(-a * W, -b * H);
      drawCanvasLabel(ctx, a * W, b * H, text, { equation, alpha: t });
      ctx.restore();
      break;
    }
    case 'work': {
      // Typed on left-to-right as it appears; stays for the rest of the explanation.
      const text = shape.label ?? '';
      const shown = text.slice(0, Math.max(1, Math.ceil(text.length * t)));
      drawWorkLine(ctx, a * W, b * H, shown, minDim);
      break;
    }
    case 'rightangle': {
      const size = (c ?? 0.02) * minDim * t;
      const px = a * W;
      const py = b * H;
      ctx.strokeStyle = 'rgba(59, 139, 212, 0.95)';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = 'rgba(59, 139, 212, 0.4)';
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + size, py);
      ctx.lineTo(px + size, py + size);
      ctx.stroke();
      break;
    }
  }

  ctx.restore();
}

export interface PointerTrailPoint {
  x: number;
  y: number;
  age: number;
}

export function drawEnhancedPointer(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  timestamp: number,
  label: string,
  trail: PointerTrailPoint[],
  arrivalBurst: { startTime: number } | null
) {
  const idlePhase = (timestamp % 1800) / 1800;
  const idleScale = 1 + 0.25 * Math.sin(idlePhase * Math.PI * 2);
  const idleAlpha = 0.35 + 0.35 * (1 - Math.abs(Math.sin(idlePhase * Math.PI * 2)));

  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, POINTER_OUTER_R * idleScale * 1.8, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(59, 139, 212, ${idleAlpha})`;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();

  if (arrivalBurst) {
    const t = Math.min(1, (timestamp - arrivalBurst.startTime) / ARRIVAL_BURST_MS);
    const burstR = 30 + t * 40;
    const burstAlpha = 0.7 * (1 - t);
    if (burstAlpha > 0.01) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, burstR, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(59, 139, 212, ${burstAlpha})`;
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    }
  }

  for (let i = 0; i < trail.length; i++) {
    const pt = trail[i];
    const fade = Math.max(0, 1 - pt.age / 6);
    if (fade <= 0) continue;
    const r = 4 + fade * 8;
    ctx.save();
    ctx.globalAlpha = fade * 0.5;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(59, 139, 212, 0.6)';
    ctx.fill();
    ctx.restore();
  }

  ctx.save();
  ctx.shadowColor = 'rgba(59, 139, 212, 0.7)';
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.arc(x, y, POINTER_OUTER_R, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(59, 139, 212, 0.92)';
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.fill();
  ctx.restore();

  if (label) {
    drawCanvasLabel(ctx, x, y - POINTER_OUTER_R, label);
  }
}

export function getBubbleMaxWidth(viewportW: number): number {
  return Math.min(480, Math.max(260, viewportW * 0.4));
}

export function clampBubbleToViewport(
  bubble: HTMLDivElement,
  pointerX: number,
  pointerY: number,
  viewportW: number,
  viewportH: number,
  userMoved: boolean,
  dragOffset: { x: number; y: number }
) {
  const maxW = getBubbleMaxWidth(viewportW);
  const maxH = viewportH * 0.7;
  bubble.style.maxWidth = `${maxW}px`;
  bubble.style.maxHeight = `${maxH}px`;

  const bw = Math.min(bubble.offsetWidth || maxW, maxW);
  const bh = Math.min(bubble.offsetHeight || 120, maxH);

  let left: number;
  let top: number;

  if (userMoved) {
    left = pointerX + dragOffset.x;
    top = pointerY + dragOffset.y;
  } else {
    const anchorRight = pointerX > viewportW * 0.55;
    left = anchorRight ? pointerX - bw - 24 : pointerX + 24;
    top = pointerY - 48;
  }

  left = Math.max(16, Math.min(left, viewportW - bw - 16));
  top = Math.max(16, Math.min(top, viewportH - bh - 16));

  bubble.style.left = `${left}px`;
  bubble.style.top = `${top}px`;
  bubble.style.right = 'auto';
  bubble.style.bottom = 'auto';
}
