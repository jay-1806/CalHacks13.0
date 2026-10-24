import { describe, it, expect } from 'vitest';
import {
  mapCoordinatesToGlobal,
  mapNormalizedToDisplayLocal,
  CapturedDisplay,
} from '@screentutor/shared';

describe('Coordinate Mapping Logic', () => {
  const displays: CapturedDisplay[] = [
    {
      screenNumber: 1,
      imageWidthPixels: 1920,
      imageHeightPixels: 1080,
      displayWidth: 1920,
      displayHeight: 1080,
      displayFrameX: 0,
      displayFrameY: 0,
      displayScaleFactor: 1.0,
      isCursorDisplay: true,
    },
    {
      screenNumber: 2,
      imageWidthPixels: 3840,
      imageHeightPixels: 2160,
      displayWidth: 1920,
      displayHeight: 1080,
      displayFrameX: 1920,
      displayFrameY: 0,
      displayScaleFactor: 2.0,
      isCursorDisplay: false,
    },
  ];

  it('maps normalized center to display center', () => {
    const res = mapCoordinatesToGlobal({
      x: 0.5,
      y: 0.5,
      screenNumber: 1,
      displays,
    });

    expect(res).not.toBeNull();
    expect(res!.globalX).toBe(960);
    expect(res!.globalY).toBe(540);
    expect(res!.targetDisplay.screenNumber).toBe(1);
  });

  it('maps normalized coords on secondary display', () => {
    const res = mapCoordinatesToGlobal({
      x: 0.5,
      y: 0.5,
      screenNumber: 2,
      displays,
    });

    expect(res).not.toBeNull();
    expect(res!.globalX).toBe(2880);
    expect(res!.globalY).toBe(540);
    expect(res!.targetDisplay.screenNumber).toBe(2);
  });

  it('clamps normalized coords above 1.0', () => {
    const res = mapCoordinatesToGlobal({
      x: 1.5,
      y: -0.2,
      screenNumber: 1,
      displays,
    });

    expect(res).not.toBeNull();
    expect(res!.globalX).toBe(1920);
    expect(res!.globalY).toBe(0);
  });

  it('maps to overlay-local pixels on cursor display', () => {
    const res = mapNormalizedToDisplayLocal(0.25, 0.75, displays);

    expect(res).not.toBeNull();
    expect(res!.localX).toBe(480);
    expect(res!.localY).toBe(810);
    expect(res!.targetDisplay.screenNumber).toBe(1);
  });

  it('defaults to cursor display when screen number omitted', () => {
    const res = mapCoordinatesToGlobal({
      x: 0.1,
      y: 0.1,
      displays,
    });

    expect(res!.targetDisplay.screenNumber).toBe(1);
    expect(res!.globalX).toBe(192);
    expect(res!.globalY).toBe(108);
  });

  it('returns null if the displays list is empty', () => {
    const res = mapCoordinatesToGlobal({
      x: 0.5,
      y: 0.5,
      displays: [],
    });
    expect(res).toBeNull();
  });
});
