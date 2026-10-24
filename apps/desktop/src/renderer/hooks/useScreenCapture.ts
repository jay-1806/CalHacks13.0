import { useState, useEffect, useCallback, useRef } from 'react';
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
  /** The capture behind the current answer (used to place its drawings and to retry it) */
  const [screenshot, setScreenshot] = useState<ScreenshotCapture | null>(null);
  /** An area the user selected that hasn't been asked about yet */
  const [pendingRegion, setPendingRegion] = useState<ScreenshotCapture | null>(null);
  const pendingRegionRef = useRef<ScreenshotCapture | null>(null);
  const [isSelectingRegion, setIsSelectingRegion] = useState(false);

  const setPending = (region: ScreenshotCapture | null) => {
    pendingRegionRef.current = region;
    setPendingRegion(region);
  };

  useEffect(() => {
    // Guard: Vite may serve this module to a non-Electron client (e.g. IDE browser on :5173).
    if (typeof window.electronAPI?.onScreenCaptured !== 'function') return;

    window.electronAPI.onScreenCaptured((data: ScreenshotCapture) => {
      if (data) {
        setScreenshot(data);
        if (data.isRegionCapture) setPending(data);
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

  /**
   * The screenshot to send with a new question: the area the user just selected
   * (used for that one question), otherwise a fresh capture of the screen. Never a
   * capture from an earlier question, or the tutor would answer the old problem.
   */
  const screenshotForQuestion = useCallback(async () => {
    const region = pendingRegionRef.current;
    if (region) {
      setPending(null);
      setScreenshot(region);
      return region;
    }
    return captureScreen();
  }, [captureScreen]);

  /** Drop the selected area; the next question uses the full screen. */
  const clearScreenshot = useCallback(() => {
    setPending(null);
    setScreenshot(null);
  }, []);

  return {
    screenshot,
    pendingRegion,
    screenshotForQuestion,
    captureScreen,
    startRegionSelect,
    isSelectingRegion,
    clearScreenshot,
    getScreenMetadata: () => getScreenMetadata(screenshot),
  };
}
