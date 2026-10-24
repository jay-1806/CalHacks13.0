import { patchConsole, mapNormalizedToDisplayLocal } from '@screentutor/shared';
patchConsole();

import { app, BrowserWindow, ipcMain, screen } from 'electron';
import { join } from 'path';
import { is } from '@electron-toolkit/utils';
import {
  captureScreen,
  captureScreenRegion,
  updateCapturedDisplays,
  capturedDisplays,
  lastCaptureRegion,
  getCursorDisplayMeta,
  type CaptureResult,
} from './screenshot.js';
import { isWindowDenied, togglePrivacyMode, getPrivacyMode, getActiveWindowTitle } from './privacy.js';
import { registerHoldDictationShortcuts, unregisterHoldDictationShortcuts } from './shortcuts.js';
import { isMac } from './platform.js';
import { ensureMicrophone, getPermissionStatus, openPermissionSettings, type PermissionKind } from './permissions.js';
import * as Sentry from '@sentry/node';
import { initSentry } from './sentry.js';

// Initialize Sentry crash reporting
initSentry();

let mainWindow: BrowserWindow;
let overlayWindow: BrowserWindow;
let regionSelectActive = false;

function setOverlayInteractive(interactive: boolean) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  if (interactive) {
    overlayWindow.setIgnoreMouseEvents(false);
    overlayWindow.setFocusable(true);
    raiseOverlayWindow();
    overlayWindow.show();
    overlayWindow.focus();
  } else {
    overlayWindow.setIgnoreMouseEvents(true);
    overlayWindow.setFocusable(false);
  }
}

function restoreMainWindowMouseEvents() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.setIgnoreMouseEvents(false);
}

function endRegionSelect() {
  regionSelectActive = false;
  setOverlayInteractive(false);
  restoreMainWindowMouseEvents();
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('onRegionSelectCancel');
  }
}

const TOPMOST_LEVEL = 'screen-saver' as const;
const PANEL_WIDTH = 380;
const PANEL_HEIGHT = 580;
const COLLAPSED_SIZE = 96;
const WINDOW_MARGIN = 16;

function positionPanel(width: number, height: number) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const display = screen.getPrimaryDisplay();
  const { x, y, width: workW, height: workH } = display.workArea;

  const winWidth = width;
  const winHeight = height > 0 ? height : width;

  mainWindow.setBounds(
    {
      x: x + workW - winWidth - WINDOW_MARGIN,
      y: y + workH - winHeight - WINDOW_MARGIN,
      width: winWidth,
      height: winHeight,
    },
    true
  );
}

function raiseMainWindow(focus = false) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.setAlwaysOnTop(true, TOPMOST_LEVEL);
  mainWindow.show();
  if (focus) {
    mainWindow.focus();
    // Windows can demote z-order on focus; re-assert after focus.
    mainWindow.setAlwaysOnTop(true, TOPMOST_LEVEL);
  }
}

function positionOverlayOnDisplay(display: {
  displayFrameX: number;
  displayFrameY: number;
  displayWidth: number;
  displayHeight: number;
}) {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  overlayWindow.setBounds({
    x: display.displayFrameX,
    y: display.displayFrameY,
    width: display.displayWidth,
    height: display.displayHeight,
  });
  raiseOverlayWindow();
}

function setDictationGlow(active: boolean) {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    raiseOverlayWindow();
    overlayWindow.webContents.send('onDictationGlow', { active });
  }
}

function notifyHoldDictationStart() {
  console.log('[Main] Hold dictation started');
  setDictationGlow(true);
  if (mainWindow && !mainWindow.isDestroyed()) {
    raiseMainWindow(false);
    mainWindow.webContents.send('onHoldDictationStart');
  }
}

function notifyHoldDictationEnd() {
  console.log('[Main] Hold dictation ended');
  setDictationGlow(false);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('onHoldDictationEnd');
  }
}

function syncOverlayToCapture(capture: CaptureResult) {
  positionOverlayOnDisplay(capture);
}

function createWindow() {
  try {
    mainWindow = new BrowserWindow({
      width: COLLAPSED_SIZE,
      height: COLLAPSED_SIZE,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      resizable: false,
      hasShadow: false,
      show: false,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
      },
    });

    mainWindow.setAlwaysOnTop(true, TOPMOST_LEVEL);
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    mainWindow.once('ready-to-show', () => {
      positionPanel(COLLAPSED_SIZE, COLLAPSED_SIZE);
      mainWindow.showInactive();
      raiseMainWindow();
    });

    mainWindow.on('blur', () => {
      const bounds = mainWindow.getBounds();
      if (bounds.width > COLLAPSED_SIZE || bounds.height > COLLAPSED_SIZE) {
        raiseMainWindow();
      }
    });

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '/index.html');
    } else {
      mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
    }
  } catch (error) {
    Sentry.captureException(error);
    console.error('Failed to create main window:', error);
  }
}

function raiseOverlayWindow() {
  if (!overlayWindow || overlayWindow.isDestroyed()) return;
  overlayWindow.setAlwaysOnTop(true, TOPMOST_LEVEL);
}

function createOverlay() {
  try {
    const cursorMeta = getCursorDisplayMeta();
    const bounds = cursorMeta
      ? {
          x: cursorMeta.displayFrameX,
          y: cursorMeta.displayFrameY,
          width: cursorMeta.displayWidth,
          height: cursorMeta.displayHeight,
        }
      : screen.getPrimaryDisplay().bounds;

    overlayWindow = new BrowserWindow({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      transparent: true,
      frame: false,
      hasShadow: false,
      alwaysOnTop: true,
      focusable: false,
      resizable: false,
      skipTaskbar: true,
      // macOS clamps windows below the menu bar unless this is set; the overlay must cover the whole display.
      enableLargerThanScreen: isMac,
      show: false, // Prevent flashing, show once ready-to-show fires
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
        backgroundThrottling: false,
      },
    });

    overlayWindow.setAlwaysOnTop(true, TOPMOST_LEVEL);
    // macOS: keep the overlay visible over full-screen apps and on every Space.
    overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    overlayWindow.setIgnoreMouseEvents(true); // fully click-through

    overlayWindow.once('ready-to-show', () => {
      console.log('[Main] overlayWindow ready-to-show; calling showInactive()');
      overlayWindow.showInactive();
    });

    overlayWindow.webContents.on('did-finish-load', () => {
      console.log('[Main] overlayWindow did-finish-load');
    });

    overlayWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      console.error(`[Main] overlayWindow did-fail-load: ${errorCode} - ${errorDescription}`);
    });

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      overlayWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '/overlay.html');
    } else {
      overlayWindow.loadFile(join(__dirname, '../renderer/overlay.html'));
    }
  } catch (error) {
    Sentry.captureException(error);
    console.error('Failed to create overlay window:', error);
  }
}

app.whenReady().then(() => {
  try {
    updateCapturedDisplays();
    createWindow();
    createOverlay();

    void registerHoldDictationShortcuts(notifyHoldDictationStart, notifyHoldDictationEnd);

    if (isMac) {
      const status = getPermissionStatus();
      console.log(`[Permissions] screen=${status.screen} microphone=${status.microphone}`);
      void ensureMicrophone().catch((err) => console.warn('[Permissions] Microphone request failed:', err));
    }

    console.log('ScreenTutor AI Started');
  } catch (error) {
    Sentry.captureException(error);
    console.error('App ready startup failure:', error);
  }
});

app.on('will-quit', () => {
  unregisterHoldDictationShortcuts();
});

// IPC Handlers
ipcMain.handle('capture-screen', async () => {
  const result = await captureScreen();
  if (result) {
    syncOverlayToCapture(result);
  }
  return result;
});

ipcMain.handle('start-region-select', async () => {
  if (regionSelectActive) return { ok: false, reason: 'already_active' };

  updateCapturedDisplays();
  const meta = getCursorDisplayMeta();
  if (meta) {
    positionOverlayOnDisplay({
      displayFrameX: meta.displayFrameX,
      displayFrameY: meta.displayFrameY,
      displayWidth: meta.displayWidth,
      displayHeight: meta.displayHeight,
    });
  }

  regionSelectActive = true;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setIgnoreMouseEvents(true, { forward: true });
  }
  setOverlayInteractive(true);
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('onRegionSelectStart');
  }
  // Re-assert after renderer effects that may toggle click-through (AnnotationOverlay).
  setTimeout(() => {
    if (regionSelectActive) setOverlayInteractive(true);
  }, 0);
  return { ok: true };
});

ipcMain.on('cancel-region-select', () => {
  endRegionSelect();
});

ipcMain.handle('confirm-region-select', async (_event, rect: { x: number; y: number; width: number; height: number }) => {
  try {
    const result = await captureScreenRegion(rect);
    endRegionSelect();
    if (result) {
      syncOverlayToCapture(result);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('onScreenCaptured', result);
      }
      return { ok: true };
    }
    return { ok: false, reason: 'capture_failed' };
  } catch (err) {
    endRegionSelect();
    Sentry.captureException(err);
    return { ok: false, reason: 'error' };
  }
});

ipcMain.on('set-dictation-glow', (_event, active: boolean) => {
  setDictationGlow(!!active);
});

ipcMain.on('send-drawings', (event, drawings) => {
  console.log(`[Main] IPC "send-drawings" received with ${drawings?.length} command(s)`);
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    console.log(`[Main] Forwarding ${drawings?.length} drawing command(s) to overlayWindow`);
    raiseOverlayWindow();
    overlayWindow.webContents.send('onOverlayDrawings', drawings);
  } else {
    console.warn(`[Main] Cannot forward drawings: overlayWindow is ${overlayWindow ? 'destroyed' : 'null'}`);
  }
});

ipcMain.on('send-overlay-point', (event, data) => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('onOverlayPoint', data);
  }
});

ipcMain.on('clear-overlay', () => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('onOverlayClear');
  }
});

ipcMain.on('restore-explanation', (_event, payload) => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    raiseOverlayWindow();
    overlayWindow.webContents.send('onRestoreExplanation', payload);
  }
});

ipcMain.on('explanation-ready', (_event, payload) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('onExplanationReady', payload);
  }
});

ipcMain.on('explanation-minimized', (_event, payload) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('onExplanationMinimized', payload);
  }
});

ipcMain.on('explanation-updated', (_event, payload) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('onExplanationUpdated', payload);
  }
});

ipcMain.on('log-to-server', (event, message) => {
  console.log(`[Renderer LOG] ${message}`);
});

ipcMain.handle('toggle-privacy-mode', () => {
  return togglePrivacyMode();
});

ipcMain.handle('get-privacy-mode', () => {
  return getPrivacyMode();
});

ipcMain.on('set-main-size', (_event, width, height) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const panelHeight = height > 0 ? height : width;
    positionPanel(width, panelHeight);
    if (width > COLLAPSED_SIZE || panelHeight > COLLAPSED_SIZE) {
      raiseMainWindow(true);
    } else if (!regionSelectActive) {
      raiseOverlayWindow();
      raiseMainWindow();
    }
  }
});

ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) {
    if (regionSelectActive && win === overlayWindow && ignore) {
      return;
    }
    win.setIgnoreMouseEvents(ignore, options);
  }
});

ipcMain.on('start-overlay-narration', (_event, payload) => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('onOverlayNarrationStart', {
      ...payload,
      captureRegion: lastCaptureRegion,
    });
  }
});

ipcMain.on('overlay-narration-step', (_event, index: number) => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('onOverlayNarrationStep', index);
  }
});

ipcMain.on('finish-overlay-narration', () => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('onOverlayNarrationFinish');
  }
});

ipcMain.on('fly-to-point', (event, x, y, screenNumber, text) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (capturedDisplays.length === 0) {
      updateCapturedDisplays();
    }

    const local = mapNormalizedToDisplayLocal(x, y, capturedDisplays, screenNumber, lastCaptureRegion);
    if (!local) {
      console.warn('fly-to-point: No target display identified.');
      return;
    }

    positionOverlayOnDisplay(local.targetDisplay);

    const debugCoordinates = process.env.DEBUG_COORDINATES === 'true';
    if (debugCoordinates) {
      console.log(`[DEBUG_COORDINATES] fly-to-point norm=(${x}, ${y}) screen=${screenNumber}`);
      console.log(`[DEBUG_COORDINATES] overlay-local=(${local.localX}, ${local.localY}) display=${local.targetDisplay.screenNumber}`);
    }

    if (overlayWindow && !overlayWindow.isDestroyed() && text !== undefined) {
      raiseOverlayWindow();
      overlayWindow.webContents.send('onOverlayPoint', {
        pointTarget: {
          x: local.localX,
          y: local.localY,
          screenNumber: local.targetDisplay.screenNumber,
        },
        text,
      });
    }
  }
});

ipcMain.handle('get-sentry-config', () => {
  return {
    enabled: process.env.SENTRY_ENABLED === 'true',
    dsn: process.env.SENTRY_DSN || ''
  };
});

ipcMain.on('simulate-overlay-error', () => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('trigger-overlay-error');
  }
});

ipcMain.handle('get-active-window-title', async () => {
  return await getActiveWindowTitle();
});

ipcMain.handle('get-permission-status', () => getPermissionStatus());

ipcMain.on('open-permission-settings', (_event, kind: PermissionKind) => {
  if (kind === 'screen' || kind === 'microphone') openPermissionSettings(kind);
});
