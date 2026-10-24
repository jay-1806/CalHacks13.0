/** Platform-aware labels for the UI. `electronAPI.platform` comes from the preload script. */
const isMac = typeof window !== 'undefined' && window.electronAPI?.platform === 'darwin';

export const HOLD_HOTKEY_LABEL = isMac ? 'Cmd+Shift+E' : 'Ctrl+Shift+E';
