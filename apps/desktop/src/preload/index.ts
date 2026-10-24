import { contextBridge, ipcRenderer } from 'electron';

const electronAPI = {
  /** 'darwin' | 'win32' | 'linux' — lets the UI show Cmd vs Ctrl. */
  platform: process.platform,
  captureScreen: () => ipcRenderer.invoke('capture-screen'),
  startRegionSelect: () => ipcRenderer.invoke('start-region-select'),
  cancelRegionSelect: () => ipcRenderer.send('cancel-region-select'),
  confirmRegionSelect: (rect: { x: number; y: number; width: number; height: number }) =>
    ipcRenderer.invoke('confirm-region-select', rect),
  sendDrawings: (drawings: any[]) => ipcRenderer.send('send-drawings', drawings),
  clearOverlay: () => ipcRenderer.send('clear-overlay'),
  restoreExplanation: (payload: any) => ipcRenderer.send('restore-explanation', payload),
  notifyExplanationReady: (payload: any) => ipcRenderer.send('explanation-ready', payload),
  notifyExplanationMinimized: (payload: any) => ipcRenderer.send('explanation-minimized', payload),
  notifyExplanationUpdated: (payload: any) => ipcRenderer.send('explanation-updated', payload),
  togglePrivacyMode: () => ipcRenderer.invoke('toggle-privacy-mode'),
  getPrivacyMode: () => ipcRenderer.invoke('get-privacy-mode'),
  onScreenCaptured: (callback: (data: any) => void) => {
    ipcRenderer.on('onScreenCaptured', (_event, data) => callback(data));
  },
  onRegionSelectStart: (callback: () => void) => {
    ipcRenderer.on('onRegionSelectStart', () => callback());
  },
  onRegionSelectCancel: (callback: () => void) => {
    ipcRenderer.on('onRegionSelectCancel', () => callback());
  },
  onHotkeyTriggered: (callback: () => void) => {
    ipcRenderer.on('onHotkeyTriggered', () => callback());
  },
  onHoldDictationStart: (callback: () => void) => {
    ipcRenderer.on('onHoldDictationStart', () => callback());
  },
  onHoldDictationEnd: (callback: () => void) => {
    ipcRenderer.on('onHoldDictationEnd', () => callback());
  },
  onDictationGlow: (callback: (data: { active: boolean }) => void) => {
    ipcRenderer.on('onDictationGlow', (_event, data) => callback(data));
  },
  setDictationGlow: (active: boolean) => ipcRenderer.send('set-dictation-glow', active),
  onOverlayDrawings: (callback: (drawings: any[]) => void) => {
    ipcRenderer.on('onOverlayDrawings', (_event, drawings) => callback(drawings));
  },
  onOverlayPoint: (callback: (data: any) => void) => {
    ipcRenderer.on('onOverlayPoint', (_event, data) => callback(data));
  },
  onOverlayClear: (callback: () => void) => {
    ipcRenderer.on('onOverlayClear', () => callback());
  },
  onRestoreExplanation: (callback: (payload: any) => void) => {
    ipcRenderer.on('onRestoreExplanation', (_event, payload) => callback(payload));
  },
  onExplanationReady: (callback: (payload: any) => void) => {
    ipcRenderer.on('onExplanationReady', (_event, payload) => callback(payload));
  },
  onExplanationMinimized: (callback: (payload: any) => void) => {
    ipcRenderer.on('onExplanationMinimized', (_event, payload) => callback(payload));
  },
  onExplanationUpdated: (callback: (payload: any) => void) => {
    ipcRenderer.on('onExplanationUpdated', (_event, payload) => callback(payload));
  },
  setMainSize: (width: number, height: number) => ipcRenderer.send('set-main-size', width, height),
  /** Resize buddy window while preserving the user-chosen launcher center. */
  setMainSizeAtAnchor: (width: number, height: number) =>
    ipcRenderer.send('set-main-size-at-anchor', width, height),
  /**
   * Place the tutor panel (preferred 420×620) near the launcher anchor (awaitable).
   * Does not overwrite the launcher anchor. Pass requestId to ignore stale replies.
   */
  placeTutorPanel: (payload: { width: number; height: number; requestId: number }) =>
    ipcRenderer.invoke('place-tutor-panel', payload) as Promise<{
      bounds: { x: number; y: number; width: number; height: number } | null;
      anchor: { cx: number; cy: number };
      epoch: number;
      requestId: number | null;
    } | null>,
  /** Exact buddy bounds for arc menu; resolves after Electron applies them. */
  setMainBounds: (bounds: { x: number; y: number; width: number; height: number }) =>
    ipcRenderer.invoke('set-main-bounds', bounds) as Promise<{
      x: number;
      y: number;
      width: number;
      height: number;
    } | null>,
  /** Move the buddy window (top-left screen coords); clamped to the nearest display work area. */
  moveMainWindow: (x: number, y: number) => ipcRenderer.send('move-main-window', x, y),
  getMainBounds: (): Promise<{
    x: number;
    y: number;
    width: number;
    height: number;
    workArea: { x: number; y: number; width: number; height: number };
    anchor: { cx: number; cy: number };
  } | null> => ipcRenderer.invoke('get-main-bounds'),
  /** Diagnostic: buddy vs overlay BrowserWindows (no secrets). */
  getWindowInventory: (): Promise<
    Array<{
      id: number;
      role: 'buddy' | 'overlay' | 'other';
      visible: boolean;
      bounds: { x: number; y: number; width: number; height: number };
    }>
  > => ipcRenderer.invoke('get-window-inventory'),
  startOverlayNarration: (payload: {
    spokenText: string;
    overlayText: string;
    captureRegion?: { x: number; y: number; width: number; height: number } | null;
  }) => ipcRenderer.send('start-overlay-narration', payload),
  finishOverlayNarration: () => ipcRenderer.send('finish-overlay-narration'),
  /** Step `index` of the narration started being heard: the overlay shows that step. */
  overlayNarrationStep: (index: number) => ipcRenderer.send('overlay-narration-step', index),
  onOverlayNarrationStep: (callback: (index: number) => void) => {
    ipcRenderer.on('onOverlayNarrationStep', (_event, index) => callback(index));
  },
  onOverlayNarrationStart: (callback: (payload: {
    spokenText: string;
    overlayText: string;
    captureRegion?: { x: number; y: number; width: number; height: number } | null;
  }) => void) => {
    ipcRenderer.on('onOverlayNarrationStart', (_event, payload) => callback(payload));
  },
  onOverlayNarrationFinish: (callback: () => void) => {
    ipcRenderer.on('onOverlayNarrationFinish', () => callback());
  },
  flyToPoint: (x: number, y: number, screenNumber?: number, text?: string) => ipcRenderer.send('fly-to-point', x, y, screenNumber, text),
  getSentryConfig: () => ipcRenderer.invoke('get-sentry-config'),
  simulateOverlayError: () => ipcRenderer.send('simulate-overlay-error'),
  onTriggerOverlayError: (callback: () => void) => {
    ipcRenderer.on('trigger-overlay-error', () => callback());
  },
  getActiveWindowTitle: (): Promise<string | null> => ipcRenderer.invoke('get-active-window-title'),
  getPermissionStatus: (): Promise<{ platform: string; screen: string; microphone: string }> =>
    ipcRenderer.invoke('get-permission-status'),
  /** User-initiated Voice only — may show the OS mic prompt when not yet decided. */
  ensureMicrophoneAccess: (): Promise<{ platform: string; screen: string; microphone: string }> =>
    ipcRenderer.invoke('ensure-microphone'),
  openPermissionSettings: (kind: 'screen' | 'microphone') => ipcRenderer.send('open-permission-settings', kind),
  setIgnoreMouseEvents: (ignore: boolean, options?: { forward: boolean }) => ipcRenderer.send('set-ignore-mouse-events', ignore, options),
  onCursorMove: (callback: (point: { x: number; y: number }) => void) => {
    ipcRenderer.on('cursor-move', (_event, point) => callback(point));
  },
  onFlyToPoint: (callback: (point: { x: number; y: number }) => void) => {
    ipcRenderer.on('onFlyToPoint', (_event, point) => callback(point));
  },
  logToServer: (message: string) => ipcRenderer.send('log-to-server', message),
  /** Help → Getting Started (native menu). */
  onOpenGettingStarted: (callback: () => void) => {
    ipcRenderer.on('onOpenGettingStarted', () => callback());
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

declare global {
  interface Window {
    electronAPI: typeof electronAPI;
  }
}
