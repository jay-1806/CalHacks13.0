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
  startOverlayNarration: (payload: {
    spokenText: string;
    overlayText: string;
    durationMs: number;
    captureRegion?: { x: number; y: number; width: number; height: number } | null;
  }) => ipcRenderer.send('start-overlay-narration', payload),
  finishOverlayNarration: () => ipcRenderer.send('finish-overlay-narration'),
  onOverlayNarrationStart: (callback: (payload: {
    spokenText: string;
    overlayText: string;
    durationMs: number;
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
  openPermissionSettings: (kind: 'screen' | 'microphone') => ipcRenderer.send('open-permission-settings', kind),
  setIgnoreMouseEvents: (ignore: boolean, options?: { forward: boolean }) => ipcRenderer.send('set-ignore-mouse-events', ignore, options),
  onCursorMove: (callback: (point: { x: number; y: number }) => void) => {
    ipcRenderer.on('cursor-move', (_event, point) => callback(point));
  },
  onFlyToPoint: (callback: (point: { x: number; y: number }) => void) => {
    ipcRenderer.on('onFlyToPoint', (_event, point) => callback(point));
  },
  logToServer: (message: string) => ipcRenderer.send('log-to-server', message),
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

declare global {
  interface Window {
    electronAPI: typeof electronAPI;
  }
}
