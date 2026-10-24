/**
 * Hand-drawn ink for the overlay: marks become slightly wobbly, tapered pen
 * strokes, like a teacher marking up the page. Each shape's wobble is seeded
 * from its coordinates, so it looks the same on every frame.
 */

export interface Pt {
  x: number;
  y: number;
}

export type Rand = () => number;

/** Deterministic 0–1 random numbers from a string seed (mulberry32). */
export function seededRandom(seed: string): Rand {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function between(rand: Rand, lo: number, hi: number): number {
  return lo + (hi - lo) * rand();
}

/** A hand-drawn straight line: a gentle bow, a little wobble, a slight overshoot past the ends. */
export function sketchLine(a: Pt, b: Pt, rand: Rand): Pt[] {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const ux = (b.x - a.x) / len;
  const uy = (b.y - a.y) / len;
  const bow = between(rand, -1, 1) * Math.min(len * 0.025, 6);
  const wobble = Math.min(1.4, len * 0.01);
  const phase = rand() * Math.PI * 2;
  const freq = between(rand, 1.5, 3);
  const startT = -between(rand, 0, 0.03);
  const endT = 1 + between(rand, 0.01, 0.05);
  const n = Math.max(12, Math.round(len / 5));
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = startT + ((endT - startT) * i) / n;
    const off = bow * Math.sin(Math.PI * Math.min(1, Math.max(0, t))) + wobble * Math.sin(phase + freq * Math.PI * 2 * t);
    pts.push({ x: a.x + ux * len * t - uy * off, y: a.y + uy * len * t + ux * off });
  }
  return pts;
}

/** A hand-drawn loop: a slightly tilted oval that overshoots where it started. */
export function sketchEllipse(cx: number, cy: number, r: number, rand: Rand): Pt[] {
  const rx = r * between(rand, 1.04, 1.14);
  const ry = r * between(rand, 0.88, 0.97);
  const tilt = between(rand, -0.35, 0.35);
  const start = between(rand, -2.5, -1.7); // people start a circle near the top left
  const sweep = Math.PI * 2 + between(rand, 0.3, 0.6);
  const phase = rand() * Math.PI * 2;
  const n = Math.max(40, Math.round((r * Math.PI * 2) / 4));
  const cos = Math.cos(tilt);
  const sin = Math.sin(tilt);
  const pts: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const th = start + sweep * u;
    // Drifts outward a little so the overlap reads as a pen loop, not a closed ring.
    const k = (1 + 0.07 * u) * (1 + 0.025 * Math.sin(3 * th + phase));
    const x = rx * k * Math.cos(th);
    const y = ry * k * Math.sin(th);
    pts.push({ x: cx + x * cos - y * sin, y: cy + x * sin + y * cos });
  }
  return pts;
}

/** Join strokes drawn without lifting the pen (e.g. the sides of a box). */
export function joinStrokes(parts: Pt[][]): Pt[] {
  return parts.flatMap((part, i) => (i === 0 ? part : part.slice(1)));
}

function lengths(pts: Pt[]): number[] {
  const acc = [0];
  for (let i = 1; i < pts.length; i++) {
    acc.push(acc[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  }
  return acc;
}

export interface InkStyle {
  color: string;
  width: number;
  /** Dark outline under the ink so it reads on light and dark backgrounds */
  halo?: string;
  /** Thin the stroke at both ends like a pen (default true) */
  taper?: boolean;
}

/** Draw the first `progress` (0–1) of a stroke, as far as the pen has got. */
export function inkStroke(ctx: CanvasRenderingContext2D, pts: Pt[], progress: number, style: InkStyle): void {
  if (pts.length < 2 || progress <= 0) return;
  const acc = lengths(pts);
  const total = acc[acc.length - 1] || 1;
  const reach = total * Math.min(1, progress);

  const visible: Pt[] = [pts[0]];
  const along: number[] = [0];
  for (let i = 1; i < pts.length; i++) {
    if (acc[i] <= reach) {
      visible.push(pts[i]);
      along.push(acc[i]);
      continue;
    }
    const seg = acc[i] - acc[i - 1] || 1;
    const f = (reach - acc[i - 1]) / seg;
    visible.push({ x: pts[i - 1].x + (pts[i].x - pts[i - 1].x) * f, y: pts[i - 1].y + (pts[i].y - pts[i - 1].y) * f });
    along.push(reach);
    break;
  }
  if (visible.length < 2) return;

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (style.halo) {
    ctx.beginPath();
    ctx.moveTo(visible[0].x, visible[0].y);
    for (const p of visible.slice(1)) ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = style.halo;
    ctx.lineWidth = style.width + 2.2;
    ctx.stroke();
  }

  // Variable-width ink as one filled outline, so translucent ink has no darker overlaps.
  const taper = style.taper ?? true;
  const half = along.map((s) => {
    if (!taper) return style.width / 2;
    const u = s / total;
    return (style.width / 2) * (0.5 + 0.5 * Math.min(1, u / 0.12, (1 - u) / 0.12));
  });
  const left: Pt[] = [];
  const right: Pt[] = [];
  for (let i = 0; i < visible.length; i++) {
    const prev = visible[Math.max(0, i - 1)];
    const next = visible[Math.min(visible.length - 1, i + 1)];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const d = Math.hypot(dx, dy) || 1;
    const nx = -dy / d;
    const ny = dx / d;
    left.push({ x: visible[i].x + nx * half[i], y: visible[i].y + ny * half[i] });
    right.push({ x: visible[i].x - nx * half[i], y: visible[i].y - ny * half[i] });
  }
  ctx.beginPath();
  ctx.moveTo(left[0].x, left[0].y);
  for (const p of left.slice(1)) ctx.lineTo(p.x, p.y);
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
  ctx.closePath();
  ctx.fillStyle = style.color;
  ctx.fill();
}

/** Ease like a hand: a quick start, a steady middle, a gentle stop. */
export function penEase(t: number): number {
  const c = Math.max(0, Math.min(1, t));
  return 0.5 - 0.5 * Math.cos(Math.PI * c);
}
