import { useState, useEffect, useCallback } from 'react';
import { captureResultToScreenMetadata, type ScreenMetadata } from '@screentutor/shared';

export interface ScreenshotCapture {
  base64: string;
  width: number;
  height: number;
  screenNumber?: number;
  displayId?: string;
  displayWidth?: number;
  displayHeight?: number;
  scaleFactor?: number;
  captureRegion?: { x: number; y: number; width: number; height: number };
  isRegionCapture?: boolean;
}

export function getScreenMetadata(
  capture: Partial<ScreenshotCapture> & { base64?: string } | null | undefined
): ScreenMetadata | undefined {
  if (!capture?.screenNumber && !capture?.width) return undefined;
  if (!capture.screenNumber || !capture.width || !capture.height) return undefined;
  return captureResultToScreenMetadata({
    width: capture.width,
    height: capture.height,
    screenNumber: capture.screenNumber,
    displayId: capture.displayId ?? '',
    displayWidth: capture.displayWidth ?? capture.width,
    displayHeight: capture.displayHeight ?? capture.height,
    scaleFactor: capture.scaleFactor ?? 1,
    captureRegion: capture.captureRegion,
    isRegionCapture: capture.isRegionCapture,
  });
}

export function useScreenCapture() {
  const [screenshot, setScreenshot] = useState<ScreenshotCapture | null>(null);
  const [isSelectingRegion, setIsSelectingRegion] = useState(false);

  useEffect(() => {
    window.electronAPI.onScreenCaptured((data: ScreenshotCapture) => {
      if (data) {
        setScreenshot(data);
        setIsSelectingRegion(false);
      }
    });

    window.electronAPI.onRegionSelectCancel(() => {
      setIsSelectingRegion(false);
    });
  }, []);

  const captureScreen = useCallback(async () => {
    const data = await window.electronAPI.captureScreen();
    if (data) setScreenshot(data);
    return data;
  }, []);

  const startRegionSelect = useCallback(async () => {
    setIsSelectingRegion(true);
    const result = await window.electronAPI.startRegionSelect();
    if (!result?.ok) {
      setIsSelectingRegion(false);
    }
    return result;
  }, []);

  const clearScreenshot = useCallback(() => {
    setScreenshot(null);
  }, []);

  return {
    screenshot,
    captureScreen,
    startRegionSelect,
    isSelectingRegion,
    clearScreenshot,
    getScreenMetadata: () => getScreenMetadata(screenshot),
  };
}
