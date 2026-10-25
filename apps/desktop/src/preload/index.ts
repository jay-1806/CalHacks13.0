import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

/** Listen on a channel; returns a function that stops listening (for effect cleanups). */
function subscribe(channel: string, listener: (event: IpcRendererEvent, ...args: any[]) => void): () => void {
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

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
    return subscribe('onScreenCaptured', (_event, data) => callback(data));
  },
  onRegionSelectStart: (callback: () => void) => {
    return subscribe('onRegionSelectStart', () => callback());
  },
  onRegionSelectCancel: (callback: () => void) => {
    return subscribe('onRegionSelectCancel', () => callback());
  },
  onHotkeyTriggered: (callback: () => void) => {
    return subscribe('onHotkeyTriggered', () => callback());
  },
  onHoldDictationStart: (callback: () => void) => {
    return subscribe('onHoldDictationStart', () => callback());
  },
  onHoldDictationEnd: (callback: () => void) => {
    return subscribe('onHoldDictationEnd', () => callback());
  },
  /** Voice / Capture / Text / Stop global accelerators. */
  onActionHotkey: (callback: (action: 'voice' | 'capture' | 'text' | 'stop') => void) => {
    return subscribe('onActionHotkey', (_event, action) => callback(action));
  },
  /** Enable/disable temporary global Escape while Voice or teaching is active. */
  setEscapeActivityActive: (active: boolean) =>
    ipcRenderer.invoke('set-escape-activity-active', active) as Promise<{ escapeAvailable: boolean }>,
  onDictationGlow: (callback: (data: { active: boolean }) => void) => {
    return subscribe('onDictationGlow', (_event, data) => callback(data));
  },
  setDictationGlow: (active: boolean) => ipcRenderer.send('set-dictation-glow', active),
  onOverlayDrawings: (callback: (drawings: any[]) => void) => {
    return subscribe('onOverlayDrawings', (_event, drawings) => callback(drawings));
  },
  onOverlayPoint: (callback: (data: any) => void) => {
    return subscribe('onOverlayPoint', (_event, data) => callback(data));
  },
  onOverlayClear: (callback: () => void) => {
    return subscribe('onOverlayClear', () => callback());
  },
  onRestoreExplanation: (callback: (payload: any) => void) => {
    return subscribe('onRestoreExplanation', (_event, payload) => callback(payload));
  },
  onExplanationReady: (callback: (payload: any) => void) => {
    return subscribe('onExplanationReady', (_event, payload) => callback(payload));
  },
  onExplanationMinimized: (callback: (payload: any) => void) => {
    return subscribe('onExplanationMinimized', (_event, payload) => callback(payload));
  },
  onExplanationUpdated: (callback: (payload: any) => void) => {
    return subscribe('onExplanationUpdated', (_event, payload) => callback(payload));
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
  /** The narration ended. With `awaiting`, a guided lesson waits for the learner: keep the marks up. */
  finishOverlayNarration: (payload?: { awaiting?: string; preserve?: boolean }) =>
    ipcRenderer.send('finish-overlay-narration', payload),
  /** Resolves 'changed' once the learner's screen has changed and settled (guided lessons). */
  watchScreenChange: () => ipcRenderer.invoke('watch-screen-change') as Promise<'changed' | 'cancelled'>,
  stopWatchingScreen: () => ipcRenderer.send('stop-watching-screen'),
  /** The next step of a narration that is still being written (streamed answer). */
  appendOverlayNarrationStep: (step: { spoken: string; overlay: string }) =>
    ipcRenderer.send('append-overlay-narration-step', step),
  onOverlayNarrationAppend: (callback: (step: { spoken: string; overlay: string }) => void) => {
    return subscribe('onOverlayNarrationAppend', (_event, step) => callback(step));
  },
  /** The finished answer's full overlay text (kept for "show explanation again"). */
  updateOverlayText: (text: string) => ipcRenderer.send('update-overlay-text', text),
  onOverlayText: (callback: (text: string) => void) => {
    return subscribe('onOverlayText', (_event, text) => callback(text));
  },
  /** Step `index` of the narration started being heard: the overlay shows that step. */
  overlayNarrationStep: (index: number) => ipcRenderer.send('overlay-narration-step', index),
  onOverlayNarrationStep: (callback: (index: number) => void) => {
    return subscribe('onOverlayNarrationStep', (_event, index) => callback(index));
  },
  onOverlayNarrationStart: (callback: (payload: {
    spokenText: string;
    overlayText: string;
    captureRegion?: { x: number; y: number; width: number; height: number } | null;
  }) => void) => {
    return subscribe('onOverlayNarrationStart', (_event, payload) => callback(payload));
  },
  onOverlayNarrationFinish: (callback: (payload: { awaiting?: string; preserve?: boolean }) => void) => {
    return subscribe('onOverlayNarrationFinish', (_event, payload) => callback(payload ?? {}));
  },
  flyToPoint: (x: number, y: number, screenNumber?: number, text?: string) => ipcRenderer.send('fly-to-point', x, y, screenNumber, text),
  getSentryConfig: () => ipcRenderer.invoke('get-sentry-config'),
  simulateOverlayError: () => ipcRenderer.send('simulate-overlay-error'),
  onTriggerOverlayError: (callback: () => void) => {
    return subscribe('trigger-overlay-error', () => callback());
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
    return subscribe('cursor-move', (_event, point) => callback(point));
  },
  onFlyToPoint: (callback: (point: { x: number; y: number }) => void) => {
    return subscribe('onFlyToPoint', (_event, point) => callback(point));
  },
  logToServer: (message: string) => ipcRenderer.send('log-to-server', message),
  /** Help → Getting Started (native menu). */
  onOpenGettingStarted: (callback: () => void) => {
    return subscribe('onOpenGettingStarted', () => callback());
  },
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

declare global {
  interface Window {
    electronAPI: typeof electronAPI;
  }
}
