import {
  patchConsole,
  mapNormalizedToDisplayLocal,
  computeTutorPanelBounds,
  PRODUCT_DISPLAY_NAME,
  PRODUCT_USER_DATA_DIR,
} from '@screentutor/shared';
patchConsole();

import { app, BrowserWindow, ipcMain, Menu, nativeImage, screen } from 'electron';
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
  lastCaptureDisplayId,
} from './screenshot.js';
import { stopWatchingScreen, watchForScreenChange } from './screen-watch.js';
import { isWindowDenied, togglePrivacyMode, getPrivacyMode, getActiveWindowTitle } from './privacy.js';
import { registerHoldDictationShortcuts, unregisterHoldDictationShortcuts } from './shortcuts.js';
import { isMac } from './platform.js';
import { ensureMicrophone, getPermissionStatus, openPermissionSettings, type PermissionKind } from './permissions.js';
import * as Sentry from '@sentry/node';
import { initSentry } from './sentry.js';

// Initialize Sentry crash reporting
initSentry();

/**
 * Official display name is Quicky.AI. Lock userData to the existing
 * `@screentutor/desktop` directory BEFORE setName so preferences / session
 * storage are not orphaned by the rebrand.
 */
const preservedUserData = join(app.getPath('appData'), PRODUCT_USER_DATA_DIR);
app.setPath('userData', preservedUserData);
app.setName(PRODUCT_DISPLAY_NAME);

/**
 * One Quicky.AI desktop process at a time.
 * Duplicate `pnpm dev` / leftover Electron mains were rendering two visible launchers.
 */
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

function resolveAppIconPath(): string {
  // electron-vite main → out/main; build resources live at apps/desktop/build
  return join(__dirname, '../../build/icon.png');
}

function applyNativeAppIcon() {
  const iconPath = resolveAppIconPath();
  const image = nativeImage.createFromPath(iconPath);
  if (image.isEmpty()) {
    console.warn('[Main] Quicky.AI icon missing or unreadable:', iconPath);
    return null;
  }
  if (isMac && app.dock) {
    app.dock.setIcon(image);
  }
  return image;
}

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
const PANEL_WIDTH = 420;
const PANEL_HEIGHT = 620;
/** Keep in sync with renderer panelLayout.COLLAPSED_SIZE. */
const COLLAPSED_SIZE = 96;
const WINDOW_MARGIN = 16;

/** Session-persisted launcher center in screen coordinates (free placement). */
let launcherAnchor: { cx: number; cy: number } | null = null;

function workAreaNear(px: number, py: number) {
  return screen.getDisplayNearestPoint({ x: Math.round(px), y: Math.round(py) }).workArea;
}

function defaultLauncherAnchor() {
  const { x, y, width, height } = screen.getPrimaryDisplay().workArea;
  return {
    cx: x + width - WINDOW_MARGIN - COLLAPSED_SIZE / 2,
    cy: y + height - WINDOW_MARGIN - COLLAPSED_SIZE / 2,
  };
}

function ensureLauncherAnchor() {
  if (!launcherAnchor) launcherAnchor = defaultLauncherAnchor();
  return launcherAnchor;
}

function clampOrigin(x: number, y: number, width: number, height: number, work: Electron.Rectangle) {
  const maxX = work.x + Math.max(0, work.width - width);
  const maxY = work.y + Math.max(0, work.height - height);
  return {
    x: Math.min(Math.max(Math.round(x), work.x), maxX),
    y: Math.min(Math.max(Math.round(y), work.y), maxY),
  };
}

/**
 * Place the tutor panel near the saved launcher anchor (does not mutate the anchor).
 * Replaces the old primary-display bottom-right dock.
 */
function positionPanelNearLauncher(width: number, height: number) {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  const winWidth = width;
  const winHeight = height > 0 ? height : width;
  const anchor = ensureLauncherAnchor();
  const work = workAreaNear(anchor.cx, anchor.cy);
  const placed = computeTutorPanelBounds({
    launcherCenter: anchor,
    launcherSize: COLLAPSED_SIZE,
    panelWidth: winWidth,
    panelHeight: winHeight,
    workArea: work,
    gap: 16,
  });
  mainWindow.setBounds(
    { x: placed.x, y: placed.y, width: placed.width, height: placed.height },
    false
  );
  return mainWindow.getBounds();
}

/** Monotonic token so stale expand/collapse IPC cannot fight the latest layout. */
let buddyBoundsEpoch = 0;

/**
 * Resize the buddy window around the saved launcher anchor.
 * Never overwrites the user-chosen anchor — clamping may nudge the compact
 * window at screen edges, but the remembered desktop position stays put.
 */
function setMainSizeAtAnchor(width: number, height: number) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const winWidth = width;
  const winHeight = height > 0 ? height : width;
  const anchor = ensureLauncherAnchor();
  const work = workAreaNear(anchor.cx, anchor.cy);
  const origin = clampOrigin(anchor.cx - winWidth / 2, anchor.cy - winHeight / 2, winWidth, winHeight, work);
  mainWindow.setBounds({ ...origin, width: winWidth, height: winHeight }, false);
}

/** Exact buddy bounds from the renderer (arc-aware). Does not move the launcher anchor. */
function setMainBoundsExact(x: number, y: number, width: number, height: number) {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  if (![x, y, width, height].every((n) => typeof n === 'number' && Number.isFinite(n))) return null;
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const work = workAreaNear(x + w / 2, y + h / 2);
  const origin = clampOrigin(x, y, w, h, work);
  mainWindow.setBounds({ ...origin, width: w, height: h }, false);
  return mainWindow.getBounds();
}

function moveMainWindow(x: number, y: number) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const bounds = mainWindow.getBounds();
  const work = workAreaNear(x + bounds.width / 2, y + bounds.height / 2);
  const origin = clampOrigin(x, y, bounds.width, bounds.height, work);
  mainWindow.setBounds({ ...origin, width: bounds.width, height: bounds.height }, false);
  // Expanded tutor panel moves freely; only the compact launcher updates the persistent anchor.
  const isTutorPanel = bounds.width >= 300 && bounds.height >= 400;
  if (!isTutorPanel) {
    launcherAnchor = {
      cx: origin.x + bounds.width / 2,
      cy: origin.y + bounds.height / 2,
    };
  }
}

function getMainBoundsPayload() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return null;
  }
  const bounds = mainWindow.getBounds();
  const anchor = ensureLauncherAnchor();
  const work = workAreaNear(anchor.cx, anchor.cy);
  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    workArea: { x: work.x, y: work.y, width: work.width, height: work.height },
    anchor: { cx: anchor.cx, cy: anchor.cy },
  };
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
    if (mainWindow && !mainWindow.isDestroyed()) {
      console.warn('[Main] createWindow skipped — buddy window already exists');
      return;
    }
    const appIcon = applyNativeAppIcon();
    mainWindow = new BrowserWindow({
      width: COLLAPSED_SIZE,
      height: COLLAPSED_SIZE,
      frame: false,
      transparent: true,
      alwaysOnTop: true,
      resizable: false,
      hasShadow: false,
      show: false,
      title: PRODUCT_DISPLAY_NAME,
      ...(appIcon && !appIcon.isEmpty() ? { icon: appIcon } : {}),
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: false,
      },
    });

    mainWindow.setAlwaysOnTop(true, TOPMOST_LEVEL);
    mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    mainWindow.once('ready-to-show', () => {
      setMainSizeAtAnchor(COLLAPSED_SIZE, COLLAPSED_SIZE);
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
    if (overlayWindow && !overlayWindow.isDestroyed()) {
      console.warn('[Main] createOverlay skipped — overlay window already exists');
      return;
    }
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
      title: `${PRODUCT_DISPLAY_NAME} Overlay`,
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

app.on('second-instance', () => {
  if (!gotSingleInstanceLock) return;
  // Focus the existing buddy launcher — do not create another window.
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    raiseMainWindow(true);
  }
});

function installApplicationMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [];
  if (isMac) {
    template.push({ role: 'appMenu' });
  }
  template.push(
    { role: 'editMenu' },
    { role: 'windowMenu' },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Getting Started',
          click: () => {
            if (!mainWindow || mainWindow.isDestroyed()) return;
            raiseMainWindow(true);
            mainWindow.webContents.send('onOpenGettingStarted');
          },
        },
      ],
    }
  );
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  if (!gotSingleInstanceLock) return;
  try {
    applyNativeAppIcon();
    installApplicationMenu();
    updateCapturedDisplays();
    createWindow();
    createOverlay();

    void registerHoldDictationShortcuts(notifyHoldDictationStart, notifyHoldDictationEnd);

    if (isMac) {
      // Non-prompting status check only — never request OS mic access at startup.
      const status = getPermissionStatus();
      console.log(`[Permissions] screen=${status.screen} microphone=${status.microphone}`);
    }

    const inventory = BrowserWindow.getAllWindows().map((w) => {
      const role =
        w === mainWindow ? 'buddy' : w === overlayWindow ? 'overlay' : 'other';
      return {
        id: w.id,
        role,
        visible: w.isVisible(),
        bounds: w.getBounds(),
      };
    });
    console.log('[Main] Window inventory:', JSON.stringify(inventory));
    console.log(`${PRODUCT_DISPLAY_NAME} Started`);
    console.log(`[Main] userData=${app.getPath('userData')}`);
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
    // Large chat panel: place beside the launcher. Compact / menu sizes keep the user anchor.
    if (width >= 300 && panelHeight >= 400) {
      buddyBoundsEpoch += 1;
      positionPanelNearLauncher(width, panelHeight);
    } else {
      setMainSizeAtAnchor(width, panelHeight);
    }
    if (width > COLLAPSED_SIZE || panelHeight > COLLAPSED_SIZE) {
      raiseMainWindow(true);
    } else if (!regionSelectActive) {
      raiseOverlayWindow();
      raiseMainWindow();
    }
  }
});

ipcMain.on('set-main-size-at-anchor', (_event, width, height) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    const panelHeight = height > 0 ? height : width;
    buddyBoundsEpoch += 1;
    setMainSizeAtAnchor(width, panelHeight);
    if (width > COLLAPSED_SIZE || panelHeight > COLLAPSED_SIZE) {
      raiseMainWindow(true);
    } else if (!regionSelectActive) {
      raiseOverlayWindow();
      raiseMainWindow();
    }
  }
});

ipcMain.on('move-main-window', (_event, x, y) => {
  if (typeof x !== 'number' || typeof y !== 'number') return;
  // Only compact-launcher dragging updates the persistent anchor (see moveMainWindow).
  moveMainWindow(x, y);
});

/**
 * Awaitable tutor-panel placement near the current launcher anchor.
 * Does not rewrite the launcher anchor. requestId lets the renderer ignore stale replies.
 */
ipcMain.handle('place-tutor-panel', (_event, payload) => {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  const width =
    payload && typeof payload.width === 'number' && Number.isFinite(payload.width)
      ? payload.width
      : PANEL_WIDTH;
  const height =
    payload && typeof payload.height === 'number' && Number.isFinite(payload.height)
      ? payload.height
      : PANEL_HEIGHT;
  const requestId =
    payload && typeof payload.requestId === 'number' && Number.isFinite(payload.requestId)
      ? payload.requestId
      : null;

  buddyBoundsEpoch += 1;
  const epoch = buddyBoundsEpoch;
  const applied = positionPanelNearLauncher(width, height);
  raiseMainWindow(false);
  const anchor = ensureLauncherAnchor();
  return {
    bounds: applied,
    anchor: { cx: anchor.cx, cy: anchor.cy },
    epoch,
    requestId,
  };
});

/** Awaitable so the renderer can mount menu items only after bounds are applied. */
ipcMain.handle('set-main-bounds', (_event, bounds) => {
  if (!bounds || typeof bounds !== 'object') return null;
  buddyBoundsEpoch += 1;
  const applied = setMainBoundsExact(bounds.x, bounds.y, bounds.width, bounds.height);
  // Do not focus-steal on menu expand — that caused a visible macOS window flash.
  if (bounds.width > COLLAPSED_SIZE || bounds.height > COLLAPSED_SIZE) {
    raiseMainWindow(false);
  } else if (!regionSelectActive) {
    raiseOverlayWindow();
    raiseMainWindow(false);
  }
  return applied;
});

/** Dev/diagnostic: buddy + overlay roles (never secrets). */
ipcMain.handle('get-window-inventory', () => {
  return BrowserWindow.getAllWindows().map((w) => {
    const role = w === mainWindow ? 'buddy' : w === overlayWindow ? 'overlay' : 'other';
    return {
      id: w.id,
      role,
      visible: w.isVisible(),
      bounds: w.getBounds(),
    };
  });
});

ipcMain.handle('get-main-bounds', () => getMainBoundsPayload());

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

ipcMain.on('append-overlay-narration-step', (_event, step: { spoken: string; overlay: string }) => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('onOverlayNarrationAppend', step);
  }
});

ipcMain.on('update-overlay-text', (_event, text: string) => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('onOverlayText', text);
  }
});

// Guided lessons: report when the learner's screen changes and settles.
ipcMain.handle('watch-screen-change', () =>
  watchForScreenChange({
    displayId: lastCaptureDisplayId,
    // The animated launcher (and the panel, if open) would always look like a change.
    ignore: () => (mainWindow && !mainWindow.isDestroyed() ? [mainWindow.getBounds()] : []),
  })
);

ipcMain.on('stop-watching-screen', () => stopWatchingScreen());

ipcMain.on('finish-overlay-narration', (_event, payload?: { awaiting?: string }) => {
  if (overlayWindow && !overlayWindow.isDestroyed()) {
    overlayWindow.webContents.send('onOverlayNarrationFinish', payload ?? {});
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

/** Voice-path only: may prompt once when microphone status is not-determined. */
ipcMain.handle('ensure-microphone', async () => ensureMicrophone());

ipcMain.on('open-permission-settings', (_event, kind: PermissionKind) => {
  if (kind === 'screen' || kind === 'microphone') openPermissionSettings(kind);
});
