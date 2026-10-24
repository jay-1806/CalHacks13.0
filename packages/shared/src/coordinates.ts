import type { ScreenMetadata } from './schemas/tutor.js';
import type { CaptureRegion } from './capture-region.js';
import { mapPointThroughCaptureRegion } from './capture-region.js';

export interface CapturedDisplay {
  screenNumber: number;
  imageWidthPixels: number;
  imageHeightPixels: number;
  displayWidth: number;
  displayHeight: number;
  displayFrameX: number;
  displayFrameY: number;
  displayScaleFactor: number;
  isCursorDisplay: boolean;
}

export interface MapCoordinatesParams {
  x: number;
  y: number;
  screenNumber?: number | null;
  displays: CapturedDisplay[];
}

export interface MappedCoordinatesResult {
  globalX: number;
  globalY: number;
  targetDisplay: CapturedDisplay;
}

export interface DisplayLocalCoordinates {
  localX: number;
  localY: number;
  targetDisplay: CapturedDisplay;
}

/**
 * Maps normalized image coordinates (0.0–1.0) to global screen DIP coordinates.
 */
export function mapCoordinatesToGlobal({
  x,
  y,
  screenNumber,
  displays,
  captureRegion,
}: MapCoordinatesParams & { captureRegion?: CaptureRegion | null }): MappedCoordinatesResult | null {
  if (displays.length === 0) {
    return null;
  }

  let targetDisplay = displays.find((d) => d.isCursorDisplay);
  if (screenNumber && typeof screenNumber === 'number') {
    const matchedDisplay = displays.find((d) => d.screenNumber === screenNumber);
    if (matchedDisplay) {
      targetDisplay = matchedDisplay;
    }
  }

  if (!targetDisplay) {
    targetDisplay = displays[0];
  }

  const mapped = mapPointThroughCaptureRegion(x, y, captureRegion);
  const clampedX = Math.max(0, Math.min(mapped.x, 1.0));
  const clampedY = Math.max(0, Math.min(mapped.y, 1.0));

  const dipX = clampedX * targetDisplay.displayWidth;
  const dipY = clampedY * targetDisplay.displayHeight;

  const globalX = targetDisplay.displayFrameX + dipX;
  const globalY = targetDisplay.displayFrameY + dipY;

  return {
    globalX,
    globalY,
    targetDisplay,
  };
}

/** Map normalized image coords to pixel coords within the target display (overlay-local). */
export function mapNormalizedToDisplayLocal(
  x: number,
  y: number,
  displays: CapturedDisplay[],
  screenNumber?: number | null,
  captureRegion?: CaptureRegion | null
): DisplayLocalCoordinates | null {
  const mapped = mapCoordinatesToGlobal({ x, y, screenNumber, displays, captureRegion });
  if (!mapped) return null;

  return {
    localX: mapped.globalX - mapped.targetDisplay.displayFrameX,
    localY: mapped.globalY - mapped.targetDisplay.displayFrameY,
    targetDisplay: mapped.targetDisplay,
  };
}

/** Prompt block so the model tags against the exact screenshot dimensions. */
export function buildCoordinateGuide(meta?: ScreenMetadata | null): string {
  if (!meta) {
    return `COORDINATE SYSTEM: All [POINT:x,y] and [DRAW:*] tags use normalized fractions 0.0–1.0 on the attached screenshot (x=0 left, x=1 right, y=0 top, y=1 bottom). Place the pointer at the visual CENTER of each element you name.`;
  }

  const imageW = meta.imageWidth ?? meta.width ?? 1920;
  const imageH = meta.imageHeight ?? meta.height ?? 1080;
  const screenNum = meta.screenNumber ?? 1;

  const regionNote = meta.captureRegion
    ? `\nThe image is a CROPPED region of the screen (not the full display). Tags are relative to this crop only.`
    : '';

  return `COORDINATE SYSTEM (CRITICAL — read before tagging):
The attached screenshot is exactly ${imageW}×${imageH} pixels (screen ${screenNum}).${regionNote}
Every [POINT:x,y] and [DRAW:*] coordinate MUST be a normalized fraction 0.0–1.0 on THIS image:
  • x=0.0 → left edge of the image    x=1.0 → right edge
  • y=0.0 → top edge of the image     y=1.0 → bottom edge
  • x=0.5, y=0.5 → exact center of the image
Estimate each tag by locating the element's center in the image, then express it as a fraction.
Example: a triangle vertex about 20% from the left and 55% down → [POINT:0.20,0.55:vertex]
Use the SAME x,y for [DRAW:circle] / [DRAW:highlight] in that step.
Do NOT use pixel numbers (e.g. 960). Do NOT guess from a different aspect ratio.`;
}

export function captureResultToScreenMetadata(result: {
  width: number;
  height: number;
  screenNumber: number;
  displayId: string;
  displayWidth: number;
  displayHeight: number;
  scaleFactor: number;
  captureRegion?: CaptureRegion;
  isRegionCapture?: boolean;
}) {
  return {
    displayId: result.displayId,
    imageWidth: result.width,
    imageHeight: result.height,
    width: result.displayWidth,
    height: result.displayHeight,
    displayWidth: result.displayWidth,
    displayHeight: result.displayHeight,
    screenNumber: result.screenNumber,
    scaleFactor: result.scaleFactor,
    coordinateSpace: 'normalized_image' as const,
    captureRegion: result.captureRegion,
    isRegionCapture: result.isRegionCapture,
  };
}
