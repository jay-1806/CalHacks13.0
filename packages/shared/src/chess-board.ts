/**
 * Chess lessons name squares instead of guessing pixel positions. The tutor
 * declares the board once:
 *
 *   [BOARD:x1,y1,x2,y2:white]   corners of the 8×8 squares (top-left, bottom-right,
 *                               0–1 of the screenshot) and which side is at the bottom
 *
 * and then refers to squares by name:
 *
 *   [POINT:e4:label]   [DRAW:square:f7]   [DRAW:move:g1-f3]
 *
 * resolveBoardTags rewrites those into ordinary coordinates, so everything after
 * it (refinement, the overlay) only ever sees numbers.
 */

export interface ChessBoard {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** The side whose pieces are at the bottom of the screen */
  bottom: 'white' | 'black';
}

const BOARD_TAG_REGEX = /\[BOARD:([^\]]*)\]/gi;
const SQUARE_REGEX = /^[a-h][1-8]$/i;

export function parseBoardTag(text: string): ChessBoard | null {
  const match = new RegExp(BOARD_TAG_REGEX.source, 'i').exec(text);
  if (!match) return null;
  const [coordPart, side = 'white'] = match[1].split(':');
  const nums = coordPart.split(',').map((n) => parseFloat(n.trim()));
  if (nums.length < 4 || nums.some((n) => isNaN(n))) return null;
  const [x1, y1, x2, y2] = nums;
  if (!(x2 > x1) || !(y2 > y1)) return null;
  return { x1, y1, x2, y2, bottom: side.trim().toLowerCase() === 'black' ? 'black' : 'white' };
}

export function isSquareName(value: string): boolean {
  return SQUARE_REGEX.test(value.trim());
}

/** Column and row of a square on screen (0,0 = top-left square). */
function cell(board: ChessBoard, square: string): { col: number; row: number } {
  const file = square.toLowerCase().charCodeAt(0) - 97; // a = 0
  const rank = parseInt(square[1], 10) - 1; // 1 = 0
  return board.bottom === 'white' ? { col: file, row: 7 - rank } : { col: 7 - file, row: rank };
}

/** Size of one square, normalized. */
export function squareSize(board: ChessBoard): { w: number; h: number } {
  return { w: (board.x2 - board.x1) / 8, h: (board.y2 - board.y1) / 8 };
}

/** Center of a square, normalized to the screenshot. */
export function squareCenter(board: ChessBoard, square: string): { x: number; y: number } {
  const { col, row } = cell(board, square);
  const { w, h } = squareSize(board);
  return { x: board.x1 + (col + 0.5) * w, y: board.y1 + (row + 0.5) * h };
}

const fmt = (n: number) => String(Math.round(n * 10000) / 10000);

/**
 * Replace square names with coordinates using the [BOARD] tag, and remove the
 * [BOARD] tag itself. Square-named tags without a usable board are dropped.
 */
export function resolveBoardTags(text: string): string {
  if (!text || !/\[BOARD:/i.test(text)) {
    return text ? dropUnresolvedSquareTags(text) : text;
  }
  const board = parseBoardTag(text);
  let out = text.replace(new RegExp(BOARD_TAG_REGEX.source, 'gi'), '');
  if (!board) return dropUnresolvedSquareTags(out);

  const size = squareSize(board);
  out = out.replace(/\[POINT:([a-h][1-8])(:[^\]]*)?\]/gi, (_m, sq: string, label = '') => {
    const c = squareCenter(board, sq);
    return `[POINT:${fmt(c.x)},${fmt(c.y)}${label || ':'}]`;
  });
  out = out.replace(/\[DRAW:square:([a-h][1-8])(:[^\]]*)?\]/gi, (_m, sq: string, label = '') => {
    const c = squareCenter(board, sq);
    return `[DRAW:square:${fmt(c.x)},${fmt(c.y)},${fmt(size.w)},${fmt(size.h)}${label}]`;
  });
  out = out.replace(/\[DRAW:move:([a-h][1-8])\s*[-x]?\s*([a-h][1-8])(:[^\]]*)?\]/gi, (_m, from: string, to: string, label = '') => {
    const a = squareCenter(board, from);
    const b = squareCenter(board, to);
    return `[DRAW:move:${fmt(a.x)},${fmt(a.y)},${fmt(b.x)},${fmt(b.y)}${label}]`;
  });
  return out.replace(/ {2,}/g, ' ');
}

/** Square-named tags mean nothing without a board: drop them rather than draw at random. */
function dropUnresolvedSquareTags(text: string): string {
  return text
    .replace(/\[POINT:[a-h][1-8](:[^\]]*)?\]/gi, '')
    .replace(/\[DRAW:(square|move):[a-h][1-8][^\]]*\]/gi, '');
}
