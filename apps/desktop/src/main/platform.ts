/** Small platform helpers shared by the Electron main process. */
export const isMac = process.platform === 'darwin';
export const isWindows = process.platform === 'win32';

/** Hold-to-dictate hotkey, as registered/polled on this OS. */
export const HOLD_HOTKEY_ACCELERATOR = 'CommandOrControl+Shift+E';
export const HOLD_HOTKEY_LABEL = isMac ? 'Cmd+Shift+E' : 'Ctrl+Shift+E';

/** Paste shortcut used by Co-drive's `type` action (typing is done via clipboard). */
export const PASTE_COMBO = isMac ? 'cmd+v' : 'ctrl+v';
