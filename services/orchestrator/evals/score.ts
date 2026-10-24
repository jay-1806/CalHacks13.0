import { parseStreamTags, type CanvasDrawShape, type Subject } from '@screentutor/shared';

/** A region a correct answer must point at or mark (0–1 of the screenshot). */
export type Target =
  | { name: string; box: [number, number, number, number] }
  | { name: string; anyOf: [number, number, number, number][] }
  | { name: string; segment: [number, number, number, number]; tolerance: number };

export interface EvalCase {
  id: string;
  image: string;
  question: string;
  subject: Subject;
  targets: Target[];
  /** The answer should show a keyboard shortcut ([DRAW:key]) */
  expectKey?: boolean;
}

export interface CaseScore {
  subjectCorrect: boolean;
  /** Targets the answer pointed at or marked */
  hit: string[];
  missed: string[];
  /** Fraction of targets hit (0–1) */
  targetRecall: number;
  stepsAligned: boolean;
  hasDrawings: boolean;
  keyShown: boolean | null;
  /** Every place the answer aimed at, for debugging misses */
  aims: { x: number; y: number; from: string }[];
}

type Pt = { x: number; y: number };

/** The points an answer aims at: every [POINT] and the center (or ends) of every mark. */
export function aimPoints(overlayText: string): { x: number; y: number; from: string }[] {
  const aims: { x: number; y: number; from: string }[] = [];
  for (const event of parseStreamTags(overlayText).events) {
    if (event.type === 'point') aims.push({ x: event.x, y: event.y, from: 'point' });
    if (event.type === 'draw') aims.push(...shapeAims(event.shape));
  }
  return aims;
}

function shapeAims(shape: CanvasDrawShape): { x: number; y: number; from: string }[] {
  const [a, b, c, d] = shape.coords;
  const at = (x: number, y: number) => ({ x, y, from: shape.kind });
  switch (shape.kind) {
    case 'circle':
    case 'label':
    case 'rightangle':
    case 'gloss':
    case 'square':
      return [at(a, b)];
    case 'rect':
    case 'highlight':
      return [at(a + c / 2, b + d / 2)];
    case 'arrow':
    case 'underline':
      return [at((a + c) / 2, (b + d) / 2)];
    case 'move':
      // Both ends matter in chess: where the piece is and where it goes.
      return [at(a, b), at(c, d)];
    default:
      // Working lines, keycaps: written in free space by design, not aimed at a target.
      return [];
  }
}

function inBox(p: Pt, [x1, y1, x2, y2]: number[]): boolean {
  return p.x >= x1 && p.x <= x2 && p.y >= y1 && p.y <= y2;
}

function distToSegment(p: Pt, [x1, y1, x2, y2]: number[]): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - x1) * dx + (p.y - y1) * dy) / len2));
  return Math.hypot(p.x - (x1 + t * dx), p.y - (y1 + t * dy));
}

export function targetHit(target: Target, aims: Pt[]): boolean {
  if ('box' in target) return aims.some((p) => inBox(p, target.box));
  if ('anyOf' in target) return aims.some((p) => target.anyOf.some((box) => inBox(p, box)));
  return aims.some((p) => distToSegment(p, target.segment) <= target.tolerance);
}

export function scoreAnswer(
  testCase: EvalCase,
  answer: { subject?: string; spokenText: string; overlayText?: string }
): CaseScore {
  const overlay = answer.overlayText ?? '';
  const aims = aimPoints(overlay);
  const hit = testCase.targets.filter((t) => targetHit(t, aims)).map((t) => t.name);
  const missed = testCase.targets.map((t) => t.name).filter((n) => !hit.includes(n));
  const lines = (text: string) => text.split('\n').filter((l) => l.trim()).length;
  const kinds = parseStreamTags(overlay)
    .events.filter((e) => e.type === 'draw')
    .map((e) => (e.type === 'draw' ? e.shape.kind : ''));
  return {
    subjectCorrect: answer.subject === testCase.subject,
    hit,
    missed,
    targetRecall: testCase.targets.length ? hit.length / testCase.targets.length : 1,
    stepsAligned: lines(overlay) === lines(answer.spokenText),
    hasDrawings: kinds.length > 0,
    keyShown: testCase.expectKey ? kinds.includes('key') : null,
    aims,
  };
}
