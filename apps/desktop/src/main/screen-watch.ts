import { desktopCapturer, screen, type Rectangle } from 'electron';
import { isScreenCaptureBlocked } from './permissions.js';

/**
 * Guided lessons wait for the learner to act. This watches their screen with
 * small, cheap captures and reports once it has changed and then held still
 * (a click took effect, a piece was moved), so the tutor can look again.
 */

/** Width of the watch captures (pixels): enough to see a toolbar icon change */
const SAMPLE_WIDTH = 480;
const SAMPLE_EVERY_MS = 350;
/** Let the overlay finish its last strokes (~650 ms) and the pointer settle before the "before" picture */
const BASELINE_DELAY_MS = 1200;
/** A pixel counts as changed when its brightness moved by more than this */
const PIXEL_DELTA = 24;
/** This many changed pixels means the learner did something (a toolbar icon is ~100) */
const CHANGED_PIXELS = 40;
/** At most this many changing pixels between samples means the screen has settled */
const SETTLED_PIXELS = 12;

export type WatchResult = 'changed' | 'cancelled';

export interface WatchOptions {
  /** Display to watch (the one the last screenshot came from); default: under the cursor */
  displayId?: string | null;
  /** Screen areas to ignore, in screen DIPs — e.g. the animated launcher */
  ignore?: () => Rectangle[];
}

interface Sample {
  luma: Uint8Array;
  width: number;
  height: number;
}

let current: { cancelled: boolean } | null = null;

export function stopWatchingScreen(): void {
  if (current) current.cancelled = true;
  current = null;
}

export async function watchForScreenChange(options: WatchOptions = {}): Promise<WatchResult> {
  stopWatchingScreen();
  const run = { cancelled: false };
  current = run;
  if (isScreenCaptureBlocked()) return 'cancelled';

  const displays = screen.getAllDisplays();
  const display =
    displays.find((d) => String(d.id) === options.displayId) ??
    screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const height = Math.round((SAMPLE_WIDTH * display.bounds.height) / display.bounds.width);

  const sample = async (): Promise<Sample | null> => {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: SAMPLE_WIDTH, height },
    });
    const source = sources.find((s) => s.display_id === String(display.id)) ?? sources[0];
    if (!source) return null;
    const size = source.thumbnail.getSize();
    const bgra = source.thumbnail.toBitmap();
    const luma = new Uint8Array(size.width * size.height);
    for (let i = 0, p = 0; i < luma.length; i++, p += 4) {
      luma[i] = (bgra[p] * 29 + bgra[p + 1] * 150 + bgra[p + 2] * 77) >> 8;
    }
    return { luma, width: size.width, height: size.height };
  };

  /** Pixels that differ between two samples, outside the ignored areas. */
  const changedPixels = (a: Sample, b: Sample): number => {
    if (a.width !== b.width || a.height !== b.height) return Number.MAX_SAFE_INTEGER;
    const sx = a.width / display.bounds.width;
    const sy = a.height / display.bounds.height;
    const masks = (options.ignore?.() ?? []).map((r) => ({
      x1: Math.floor((r.x - display.bounds.x) * sx) - 2,
      y1: Math.floor((r.y - display.bounds.y) * sy) - 2,
      x2: Math.ceil((r.x + r.width - display.bounds.x) * sx) + 2,
      y2: Math.ceil((r.y + r.height - display.bounds.y) * sy) + 2,
    }));
    let count = 0;
    for (let y = 0; y < a.height; y++) {
      for (let x = 0; x < a.width; x++) {
        const i = y * a.width + x;
        if (Math.abs(a.luma[i] - b.luma[i]) <= PIXEL_DELTA) continue;
        if (masks.some((m) => x >= m.x1 && x <= m.x2 && y >= m.y1 && y <= m.y2)) continue;
        count++;
      }
    }
    return count;
  };

  const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  try {
    await pause(BASELINE_DELAY_MS);
    if (run.cancelled) return 'cancelled';
    const baseline = await sample();
    if (!baseline) return 'cancelled';

    let moving: Sample | null = null;
    while (!run.cancelled) {
      await pause(SAMPLE_EVERY_MS);
      if (run.cancelled) break;
      const now = await sample();
      if (!now) continue;
      if (!moving) {
        if (changedPixels(baseline, now) >= CHANGED_PIXELS) moving = now;
      } else {
        // Changed: wait until it stops changing (an animation, a menu sliding open).
        if (changedPixels(moving, now) <= SETTLED_PIXELS) {
          if (current === run) current = null;
          return 'changed';
        }
        moving = now;
      }
    }
  } catch (err) {
    console.warn('[ScreenWatch] Watching failed:', err);
  }
  return 'cancelled';
}
