import koffi from 'koffi';

/** Raw Windows input for approved Co-drive actions. Coordinates are physical screen pixels. */
const user32 = koffi.load('user32.dll');
const SetCursorPos = user32.func('bool __stdcall SetCursorPos(int X, int Y)');
const mouse_event = user32.func('void __stdcall mouse_event(uint32 dwFlags, uint32 dx, uint32 dy, int32 dwData, uintptr dwExtraInfo)');
const keybd_event = user32.func('void __stdcall keybd_event(uint8 bVk, uint8 bScan, uint32 dwFlags, uintptr dwExtraInfo)');

const MOUSEEVENTF_LEFTDOWN = 0x0002;
const MOUSEEVENTF_LEFTUP = 0x0004;
const MOUSEEVENTF_RIGHTDOWN = 0x0008;
const MOUSEEVENTF_RIGHTUP = 0x0010;
const MOUSEEVENTF_WHEEL = 0x0800;
const MOUSEEVENTF_HWHEEL = 0x1000;
const KEYEVENTF_KEYUP = 0x0002;
const WHEEL_DELTA = 120;

/**
 * xdotool-style key names (what Claude's computer tool emits) -> virtual-key codes.
 * Letters and digits are handled separately.
 */
const VK: Record<string, number> = {
  ctrl: 0x11, control: 0x11, shift: 0x10, alt: 0x12, super: 0x5b, win: 0x5b, cmd: 0x5b, meta: 0x5b,
  return: 0x0d, enter: 0x0d, tab: 0x09, escape: 0x1b, esc: 0x1b, space: 0x20,
  backspace: 0x08, delete: 0x2e, insert: 0x2d, home: 0x24, end: 0x23,
  page_up: 0x21, prior: 0x21, pageup: 0x21, page_down: 0x22, next: 0x22, pagedown: 0x22,
  left: 0x25, up: 0x26, right: 0x27, down: 0x28,
  f1: 0x70, f2: 0x71, f3: 0x72, f4: 0x73, f5: 0x74, f6: 0x75,
  f7: 0x76, f8: 0x77, f9: 0x78, f10: 0x79, f11: 0x7a, f12: 0x7b,
  minus: 0xbd, equal: 0xbb, comma: 0xbc, period: 0xbe, slash: 0xbf, semicolon: 0xba,
};

export function virtualKey(name: string): number | null {
  const key = name.trim().toLowerCase();
  if (VK[key] !== undefined) return VK[key];
  if (/^[a-z0-9]$/.test(key)) return key.toUpperCase().charCodeAt(0);
  return null;
}

/** "ctrl+shift+s" -> [VK_CONTROL, VK_SHIFT, 'S']; throws on an unknown key. */
export function parseCombo(combo: string): number[] {
  return combo
    .split('+')
    .filter(Boolean)
    .map((part) => {
      const vk = virtualKey(part);
      if (vk === null) throw new Error(`Unsupported key "${part}"`);
      return vk;
    });
}

export function pressCombo(combo: string): void {
  const keys = parseCombo(combo);
  for (const vk of keys) keybd_event(vk, 0, 0, 0);
  for (const vk of [...keys].reverse()) keybd_event(vk, 0, KEYEVENTF_KEYUP, 0);
}

export function click(x: number, y: number, button: 'left' | 'right', count: number, modifiers?: string): void {
  const mods = modifiers ? parseCombo(modifiers) : [];
  SetCursorPos(Math.round(x), Math.round(y));
  for (const vk of mods) keybd_event(vk, 0, 0, 0);
  const [down, up] = button === 'right' ? [MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP] : [MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP];
  for (let i = 0; i < count; i++) {
    mouse_event(down, 0, 0, 0, 0);
    mouse_event(up, 0, 0, 0, 0);
  }
  for (const vk of [...mods].reverse()) keybd_event(vk, 0, KEYEVENTF_KEYUP, 0);
}

export function scroll(direction: 'up' | 'down' | 'left' | 'right', amount: number, at?: { x: number; y: number }): void {
  if (at) SetCursorPos(Math.round(at.x), Math.round(at.y));
  const sign = direction === 'up' || direction === 'right' ? 1 : -1;
  const flag = direction === 'left' || direction === 'right' ? MOUSEEVENTF_HWHEEL : MOUSEEVENTF_WHEEL;
  mouse_event(flag, 0, 0, sign * amount * WHEEL_DELTA, 0);
}
