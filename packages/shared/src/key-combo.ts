/**
 * Pure helpers for key-combo strings ("ctrl+shift+s"). No native or Node-only code here so
 * it can be unit-tested and shared by every platform backend.
 */

const CTRL_NAMES = new Set(['ctrl', 'control']);
const CMD_NAMES = new Set(['cmd', 'command', 'meta', 'super', 'win']);

/** Keys that, together with Ctrl, mean "app shortcut" on Windows/Linux (Ctrl+C, Ctrl+,). */
function isShortcutKey(key: string): boolean {
  return /^[a-z0-9]$/.test(key) || ['comma', 'period', 'slash', 'minus', 'equal', 'semicolon'].includes(key);
}

export function splitCombo(combo: string): string[] {
  return combo
    .split('+')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Claude's computer tool emits Windows/Linux-style combos ("ctrl+c", "ctrl+shift+t").
 * On macOS the equivalent app shortcuts use Cmd, so translate Ctrl -> Cmd when the combo is
 * an ordinary app shortcut. Combos with non-letter keys (ctrl+tab, ctrl+left) and combos
 * that already name Cmd are left alone, as is everything on non-macOS platforms.
 */
export function translateComboForPlatform(combo: string, platform: string): string {
  if (platform !== 'darwin') return combo;
  const parts = splitCombo(combo);
  if (parts.length < 2) return combo;
  const hasCmd = parts.some((p) => CMD_NAMES.has(p));
  const hasCtrl = parts.some((p) => CTRL_NAMES.has(p));
  const last = parts[parts.length - 1];
  if (hasCmd) return parts.map((p) => (CMD_NAMES.has(p) ? 'cmd' : p)).join('+');
  if (hasCtrl && isShortcutKey(last)) {
    return parts.map((p) => (CTRL_NAMES.has(p) ? 'cmd' : p)).join('+');
  }
  return combo;
}
