/**
 * macOS virtual key codes (Carbon kVK_ANSI_* / kVK_*), keyed by the xdotool-style names
 * Claude's computer tool emits. Pure data + parsing: no native imports, so it is testable
 * anywhere.
 */

/** CGEventFlags modifier masks. */
export const FLAG_SHIFT = 0x20000;
export const FLAG_CONTROL = 0x40000;
export const FLAG_OPTION = 0x80000;
export const FLAG_COMMAND = 0x100000;

export const MODIFIER_FLAGS: Record<string, number> = {
  shift: FLAG_SHIFT,
  ctrl: FLAG_CONTROL,
  control: FLAG_CONTROL,
  alt: FLAG_OPTION,
  option: FLAG_OPTION,
  opt: FLAG_OPTION,
  cmd: FLAG_COMMAND,
  command: FLAG_COMMAND,
  meta: FLAG_COMMAND,
  super: FLAG_COMMAND,
  win: FLAG_COMMAND,
};

/** Key codes of the modifier keys themselves (for modifier-only combos). */
export const MODIFIER_KEYCODES: Record<number, number> = {
  [FLAG_COMMAND]: 0x37,
  [FLAG_SHIFT]: 0x38,
  [FLAG_OPTION]: 0x3a,
  [FLAG_CONTROL]: 0x3b,
};

export const KEYCODES: Record<string, number> = {
  a: 0x00, s: 0x01, d: 0x02, f: 0x03, h: 0x04, g: 0x05, z: 0x06, x: 0x07, c: 0x08, v: 0x09,
  b: 0x0b, q: 0x0c, w: 0x0d, e: 0x0e, r: 0x0f, y: 0x10, t: 0x11,
  '1': 0x12, '2': 0x13, '3': 0x14, '4': 0x15, '6': 0x16, '5': 0x17, '9': 0x19, '7': 0x1a, '8': 0x1c, '0': 0x1d,
  o: 0x1f, u: 0x20, i: 0x22, p: 0x23, l: 0x25, j: 0x26, k: 0x28, n: 0x2d, m: 0x2e,
  equal: 0x18, minus: 0x1b, comma: 0x2b, period: 0x2f, slash: 0x2c, semicolon: 0x29,
  return: 0x24, enter: 0x24, tab: 0x30, space: 0x31, backspace: 0x33, escape: 0x35, esc: 0x35,
  delete: 0x75, home: 0x73, end: 0x77,
  page_up: 0x74, prior: 0x74, pageup: 0x74, page_down: 0x79, next: 0x79, pagedown: 0x79,
  left: 0x7b, right: 0x7c, down: 0x7d, up: 0x7e,
  f1: 0x7a, f2: 0x78, f3: 0x63, f4: 0x76, f5: 0x60, f6: 0x61,
  f7: 0x62, f8: 0x64, f9: 0x65, f10: 0x6d, f11: 0x67, f12: 0x6f,
};

export interface ParsedCombo {
  /** OR of CGEventFlags modifier masks. */
  flags: number;
  /** Non-modifier key codes, in order. */
  keys: number[];
}

/** "cmd+shift+s" -> { flags: COMMAND|SHIFT, keys: [0x01] }; throws on an unknown key. */
export function parseComboDarwin(combo: string): ParsedCombo {
  let flags = 0;
  const keys: number[] = [];
  for (const raw of combo.split('+')) {
    const name = raw.trim().toLowerCase();
    if (!name) continue;
    if (MODIFIER_FLAGS[name] !== undefined) {
      flags |= MODIFIER_FLAGS[name];
    } else if (KEYCODES[name] !== undefined) {
      keys.push(KEYCODES[name]);
    } else {
      throw new Error(`Unsupported key "${raw.trim()}"`);
    }
  }
  return { flags, keys };
}
