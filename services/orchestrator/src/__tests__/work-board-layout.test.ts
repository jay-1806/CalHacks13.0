import { describe, it, expect } from 'vitest';
import {
  buildInkGridFromRgba,
  chooseWorkRail,
  estimateWorkBoardSize,
  figureOccupancyFromShapes,
  inkDensityInRect,
  layoutWorkBoards,
  placeWorkBoard,
  relocateWorkShapes,
  syncPointerToRelocatedWork,
  workBoardsOverlap,
  type CanvasDrawShape,
} from '@screentutor/shared';

const W = 1440;
const H = 900;

function work(x: number, y: number, label: string): CanvasDrawShape {
  return { kind: 'work', coords: [x, y], label };
}

function arrow(coords: number[]): CanvasDrawShape {
  return { kind: 'arrow', coords };
}

describe('estimateWorkBoardSize', () => {
  it('grows with text length', () => {
    const short = estimateWorkBoardSize('x=3', W, H);
    const long = estimateWorkBoardSize('First, identify the given angles at B and C carefully', W, H);
    expect(long.w).toBeGreaterThan(short.w);
    expect(short.h).toBeGreaterThan(0);
  });
});

describe('chooseWorkRail', () => {
  it('prefers the side with more blank space, not a fixed upper-right corner', () => {
    // Figure occupies the right half — left gutter should win.
    const leftHeavy = chooseWorkRail({
      figure: { x: 0.45, y: 0.15, w: 0.5, h: 0.7 },
    });
    expect(leftHeavy.id).toBe('left');

    // Figure on the left — right gutter should win.
    const rightHeavy = chooseWorkRail({
      figure: { x: 0.05, y: 0.15, w: 0.45, h: 0.7 },
    });
    expect(rightHeavy.id).toBe('right');
  });

  it('is deterministic for identical inputs', () => {
    const fig = { x: 0.2, y: 0.2, w: 0.4, h: 0.5 };
    expect(chooseWorkRail({ figure: fig })).toEqual(chooseWorkRail({ figure: fig }));
  });

  it('does not invent a covering right rail when the figure fills the page', () => {
    const crowded = chooseWorkRail({
      figure: { x: 0.05, y: 0.05, w: 0.9, h: 0.9 },
    });
    // Must not claim a full-height 0.32 right strip over the diagram.
    expect(crowded.safe).toBe(false);
    expect(overlapArea(crowded, { x: 0.05, y: 0.05, w: 0.9, h: 0.9 })).toBeGreaterThan(0);
  });

  it('rejects a right gutter that is ink-heavy even when geometrically wide', () => {
    // White left, dark right half.
    const width = 48;
    const height = 32;
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const dark = x >= width / 2;
        rgba[i] = dark ? 20 : 245;
        rgba[i + 1] = dark ? 20 : 245;
        rgba[i + 2] = dark ? 20 : 245;
        rgba[i + 3] = 255;
      }
    }
    const grid = buildInkGridFromRgba(rgba, width, height, 24, 16);
    expect(inkDensityInRect(grid, { x: 0.55, y: 0.1, w: 0.4, h: 0.8 })).toBeGreaterThan(0.3);
    const rail = chooseWorkRail({
      figure: { x: 0.35, y: 0.2, w: 0.2, h: 0.5 },
      inkGrid: grid,
    });
    expect(rail.id).toBe('left');
  });
});

function overlapArea(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number }
): number {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w);
  const y1 = Math.min(a.y + a.h, b.y + b.h);
  if (x1 <= x0 || y1 <= y0) return 0;
  return (x1 - x0) * (y1 - y0);
}

describe('layoutWorkBoards cumulative stack', () => {
  const figure = { x: 0.1, y: 0.2, w: 0.45, h: 0.55 };

  it('keeps one board for step 1', () => {
    const layout = layoutWorkBoards({
      texts: ['Observe the 60° angle at B.'],
      canvasW: W,
      canvasH: H,
      figure,
    });
    expect(layout.boards).toHaveLength(1);
    expect(layout.boards[0].index).toBe(0);
  });

  it('adds step 2 while preserving step 1 without overlap', () => {
    const layout = layoutWorkBoards({
      texts: ['Observe the 60° angle at B.', 'Now examine the 50° angle at C.'],
      canvasW: W,
      canvasH: H,
      figure,
    });
    expect(layout.boards).toHaveLength(2);
    expect(layout.boards.map((b) => b.index)).toEqual([0, 1]);
    const a = layout.boards[0];
    const b = layout.boards[1];
    expect(
      workBoardsOverlap(
        { coords: [a.x, a.y + a.h / 2], label: a.label },
        { coords: [b.x, b.y + b.h / 2], label: b.label },
        W,
        H
      )
    ).toBe(false);
  });

  it('preserves three and four cards in order without pairwise overlap', () => {
    const texts = [
      'Step 1: given angles',
      'Step 2: look at triangle BEF',
      'Step 3: relate 20° and 30°',
      'Step 4: conclude x = 30°',
    ];
    const layout = layoutWorkBoards({ texts, canvasW: W, canvasH: H, figure });
    expect(layout.boards).toHaveLength(4);
    for (let i = 0; i < layout.boards.length; i++) {
      for (let j = i + 1; j < layout.boards.length; j++) {
        const a = layout.boards[i];
        const b = layout.boards[j];
        expect(
          workBoardsOverlap(
            { coords: [a.x, a.y + a.h / 2], label: a.label },
            { coords: [b.x, b.y + b.h / 2], label: b.label },
            W,
            H
          )
        ).toBe(false);
      }
    }
  });

  it('keeps boards inside the rail and away from the figure core', () => {
    const layout = layoutWorkBoards({
      texts: ['A', 'B', 'C'],
      canvasW: W,
      canvasH: H,
      figure,
    });
    for (const b of layout.boards) {
      expect(b.x).toBeGreaterThanOrEqual(layout.rail.x - 0.001);
      expect(b.x + b.w).toBeLessThanOrEqual(layout.rail.x + layout.rail.w + 0.001);
      // Boards should not sit in the middle of the figure occupancy.
      const boardCenterX = b.x + b.w / 2;
      const boardCenterY = b.y + b.h / 2;
      const inFigure =
        boardCenterX > figure.x &&
        boardCenterX < figure.x + figure.w &&
        boardCenterY > figure.y &&
        boardCenterY < figure.y + figure.h;
      expect(inFigure).toBe(false);
    }
  });

  it('updates the same step identity when text grows (relayout, no duplicate index)', () => {
    const short = layoutWorkBoards({
      texts: ['First, identify'],
      canvasW: W,
      canvasH: H,
      figure,
    });
    const grown = layoutWorkBoards({
      texts: ['First, identify the given angles at B and the 20° wedge at E.'],
      canvasW: W,
      canvasH: H,
      figure,
    });
    expect(short.boards).toHaveLength(1);
    expect(grown.boards).toHaveLength(1);
    expect(grown.boards[0].h).toBeGreaterThanOrEqual(short.boards[0].h);
    expect(grown.boards[0].w).toBeGreaterThan(short.boards[0].w);
  });

  it('marks the rail scrollable when many boards exceed the region and keeps all steps', () => {
    // Enough boards that a full-height gutter cannot show them all at once.
    const texts = Array.from({ length: 40 }, (_, i) => `Detailed working line number ${i + 1} with extra words`);
    const layout = layoutWorkBoards({
      texts,
      canvasW: W,
      canvasH: H,
      figure: { x: 0.02, y: 0.02, w: 0.74, h: 0.96 },
      activeIndex: 39,
    });
    expect(layout.boards).toHaveLength(40);
    expect(layout.scrollable).toBe(true);
    expect(layout.contentHeight).toBeGreaterThan(layout.rail.h);
    // Active board should be brought into the visible rail band.
    const active = layout.boards[39];
    expect(active.y).toBeGreaterThanOrEqual(layout.rail.y - 0.002);
    expect(active.y).toBeLessThanOrEqual(layout.rail.y + layout.rail.h + 0.002);
  });

  it('does not steal focus scroll when autoScrollActive is false', () => {
    const texts = Array.from({ length: 40 }, (_, i) => `Line ${i}`);
    const layout = layoutWorkBoards({
      texts,
      canvasW: W,
      canvasH: H,
      figure: { x: 0.02, y: 0.02, w: 0.74, h: 0.96 },
      activeIndex: 39,
      scrollY: 0,
      autoScrollActive: false,
    });
    expect(layout.scrollable).toBe(true);
    expect(layout.scrollY).toBe(0);
  });
});

describe('relocateWorkShapes / placeWorkBoard', () => {
  it('leaves diagram marks alone and restacks overlapping model work coords', () => {
    const shapes: CanvasDrawShape[] = [
      arrow([0.2, 0.3, 0.4, 0.5]),
      work(0.72, 0.3, 'Step one equation'),
      work(0.72, 0.3, 'Step two same coords'),
      work(0.72, 0.31, 'Step three nearly same'),
    ];
    const { shapes: next, layout } = relocateWorkShapes(shapes, W, H);
    expect(next[0]).toEqual(shapes[0]);
    expect(layout.boards).toHaveLength(3);
    const works = next.filter((s) => s.kind === 'work');
    expect(workBoardsOverlap(works[0], works[1], W, H)).toBe(false);
    expect(workBoardsOverlap(works[1], works[2], W, H)).toBe(false);
  });

  it('placeWorkBoard appends without overlapping prior work', () => {
    const existing: CanvasDrawShape[] = [
      arrow([0.15, 0.2, 0.35, 0.55]),
      work(0.7, 0.25, 'Already placed'),
    ];
    const { shape } = placeWorkBoard(work(0.7, 0.25, 'New board'), existing, W, H);
    expect(shape.kind).toBe('work');
    expect(workBoardsOverlap(existing[1], shape, W, H)).toBe(false);
  });

  it('figureOccupancyFromShapes ignores work boards', () => {
    const occ = figureOccupancyFromShapes([
      arrow([0.2, 0.2, 0.5, 0.6]),
      work(0.8, 0.2, 'should not expand figure'),
    ]);
    expect(occ).not.toBeNull();
    expect(occ!.x + occ!.w).toBeLessThan(0.75);
  });
});

describe('syncPointerToRelocatedWork', () => {
  it('moves a work-adjacent pointer to the relocated board', () => {
    const synced = syncPointerToRelocatedWork({
      pointer: { x: 0.7, y: 0.3 },
      previousWork: { x: 0.72, y: 0.3 },
      nextWork: { x: 0.78, y: 0.22 },
    });
    expect(synced).toMatchObject({ y: 0.22, label: '' });
    expect(synced!.x).toBeLessThan(0.78);
  });

  it('leaves diagram-targeted pointers alone', () => {
    const synced = syncPointerToRelocatedWork({
      pointer: { x: 0.26, y: 0.79 },
      previousWork: { x: 0.72, y: 0.3 },
      nextWork: { x: 0.78, y: 0.22 },
    });
    expect(synced).toBeNull();
  });
});

describe('Canvas launcher close ordering contract', () => {
  /**
   * Mirrors Part 6.5 / 6.5.2 finishClose: pending actions run first; compact
   * restore is skipped for canvas and panel modes.
   */
  function finishCloseOrder(opts: {
    mode: 'canvas' | 'panel' | null;
    pendingAction: (() => void) | null;
    onMenuExitComplete: () => void;
  }): string[] {
    const log: string[] = [];
    const shouldRestore = opts.mode !== 'canvas' && opts.mode !== 'panel';
    log.push('pending');
    opts.pendingAction?.();
    log.push('clear-arc');
    if (shouldRestore) {
      opts.onMenuExitComplete();
      log.push('exit-complete-done');
    } else {
      log.push('exit-complete-skipped');
    }
    return log;
  }

  it('runs the Canvas action and skips compact restore', () => {
    let canvasOpen = false;
    let shrunk = false;
    const log = finishCloseOrder({
      mode: 'canvas',
      pendingAction: () => {
        canvasOpen = true;
      },
      onMenuExitComplete: () => {
        shrunk = true;
      },
    });
    expect(log[0]).toBe('pending');
    expect(canvasOpen).toBe(true);
    expect(shrunk).toBe(false);
    expect(log).toContain('exit-complete-skipped');
  });

  it('skips compact restore for Text so Chat is not clipped', () => {
    let expanded = false;
    let shrunk = false;
    finishCloseOrder({
      mode: 'panel',
      pendingAction: () => {
        expanded = true;
      },
      onMenuExitComplete: () => {
        shrunk = true;
      },
    });
    expect(expanded).toBe(true);
    expect(shrunk).toBe(false);
  });

  it('still restores compact when no panel/canvas action', () => {
    let shrunk = false;
    finishCloseOrder({
      mode: null,
      pendingAction: null,
      onMenuExitComplete: () => {
        shrunk = true;
      },
    });
    expect(shrunk).toBe(true);
  });
});
