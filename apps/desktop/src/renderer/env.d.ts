export {};

declare global {
  interface ElectronAPI {
    platform: string;
    getPermissionStatus: () => Promise<{ platform: string; screen: string; microphone: string }>;
    openPermissionSettings: (kind: 'screen' | 'microphone') => void;
    captureScreen: () => Promise<any>;
    startRegionSelect: () => Promise<{ ok: boolean; reason?: string }>;
    cancelRegionSelect: () => void;
    confirmRegionSelect: (rect: { x: number; y: number; width: number; height: number }) => Promise<{ ok: boolean; reason?: string }>;
    onRegionSelectStart: (callback: () => void) => void;
    onRegionSelectCancel: (callback: () => void) => void;
    sendDrawings: (drawings: any[]) => void;
    clearOverlay: () => void;
    restoreExplanation: (payload: import('./types/explanation').OverlayExplanationPayload) => void;
    notifyExplanationReady: (payload: { anchorX: number; anchorY: number; text: string }) => void;
    notifyExplanationMinimized: (payload: { anchorX: number; anchorY: number; dragOffsetX: number; dragOffsetY: number; text: string }) => void;
    notifyExplanationUpdated: (payload: { anchorX: number; anchorY: number; dragOffsetX: number; dragOffsetY: number; text: string }) => void;
    togglePrivacyMode: () => Promise<boolean>;
    getPrivacyMode: () => Promise<boolean>;
    onScreenCaptured: (callback: (data: any) => void) => void;
    onHotkeyTriggered: (callback: () => void) => void;
    onHoldDictationStart: (callback: () => void) => void;
    onHoldDictationEnd: (callback: () => void) => void;
    onDictationGlow: (callback: (data: { active: boolean }) => void) => void;
    setDictationGlow: (active: boolean) => void;
    onOverlayDrawings: (callback: (drawings: any[]) => void) => void;
    onOverlayPoint: (callback: (data: { pointTarget: any; text: string }) => void) => void;
    onOverlayClear: (callback: () => void) => void;
    onRestoreExplanation: (callback: (payload: import('./types/explanation').OverlayExplanationPayload) => void) => void;
    onExplanationReady: (callback: (payload: { anchorX: number; anchorY: number; text: string }) => void) => void;
    onExplanationMinimized: (callback: (payload: { anchorX: number; anchorY: number; dragOffsetX: number; dragOffsetY: number; text: string }) => void) => void;
    onExplanationUpdated: (callback: (payload: { anchorX: number; anchorY: number; dragOffsetX: number; dragOffsetY: number; text: string }) => void) => void;
    setMainSize: (width: number, height: number) => void;
    startOverlayNarration: (payload: {
      spokenText: string;
      overlayText: string;
      captureRegion?: { x: number; y: number; width: number; height: number } | null;
    }) => void;
    finishOverlayNarration: () => void;
    overlayNarrationStep: (index: number) => void;
    onOverlayNarrationStep: (callback: (index: number) => void) => void;
    onOverlayNarrationStart: (callback: (payload: {
      spokenText: string;
      overlayText: string;
      captureRegion?: { x: number; y: number; width: number; height: number } | null;
    }) => void) => void;
    onOverlayNarrationFinish: (callback: () => void) => void;
    flyToPoint: (x: number, y: number, screenNumber?: number, text?: string) => void;
    getSentryConfig: () => Promise<{ enabled: boolean; dsn: string }>;
    simulateOverlayError: () => void;
    onTriggerOverlayError: (callback: () => void) => void;
    getActiveWindowTitle: () => Promise<string | null>;
    setIgnoreMouseEvents: (ignore: boolean, options?: { forward: boolean }) => void;
    onCursorMove: (callback: (point: { x: number; y: number }) => void) => void;
    onFlyToPoint: (callback: (point: { x: number; y: number }) => void) => void;
    logToServer: (message: string) => void;
  }

  interface Window {
    electronAPI: ElectronAPI;
  }
}
