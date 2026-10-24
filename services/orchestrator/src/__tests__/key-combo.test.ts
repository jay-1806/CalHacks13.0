import { describe, it, expect } from 'vitest';
import {
  FLAG_COMMAND,
  FLAG_CONTROL,
  FLAG_OPTION,
  FLAG_SHIFT,
  KEYCODES,
  parseComboDarwin,
  translateComboForPlatform,
} from '@screentutor/shared';

describe('translateComboForPlatform', () => {
  it('leaves combos alone on Windows and Linux', () => {
    expect(translateComboForPlatform('ctrl+c', 'win32')).toBe('ctrl+c');
    expect(translateComboForPlatform('ctrl+shift+t', 'linux')).toBe('ctrl+shift+t');
  });

  it('maps Ctrl to Cmd for app shortcuts on macOS', () => {
    expect(translateComboForPlatform('ctrl+c', 'darwin')).toBe('cmd+c');
    expect(translateComboForPlatform('Ctrl+Shift+T', 'darwin')).toBe('cmd+shift+t');
    expect(translateComboForPlatform('control+comma', 'darwin')).toBe('cmd+comma');
  });

  it('keeps Ctrl for navigation-style combos on macOS', () => {
    expect(translateComboForPlatform('ctrl+tab', 'darwin')).toBe('ctrl+tab');
    expect(translateComboForPlatform('ctrl+left', 'darwin')).toBe('ctrl+left');
  });

  it('normalizes win/super/meta to cmd on macOS and leaves single keys alone', () => {
    expect(translateComboForPlatform('super+space', 'darwin')).toBe('cmd+space');
    expect(translateComboForPlatform('enter', 'darwin')).toBe('enter');
    expect(translateComboForPlatform('Return', 'darwin')).toBe('Return');
  });
});

describe('parseComboDarwin', () => {
  it('splits modifiers into flags and keys into key codes', () => {
    const parsed = parseComboDarwin('cmd+shift+s');
    expect(parsed.flags).toBe(FLAG_COMMAND | FLAG_SHIFT);
    expect(parsed.keys).toEqual([KEYCODES.s]);
  });

  it('accepts alt/option/ctrl aliases', () => {
    expect(parseComboDarwin('alt+left').flags).toBe(FLAG_OPTION);
    expect(parseComboDarwin('control+a').flags).toBe(FLAG_CONTROL);
  });

  it('handles modifier-only combos', () => {
    expect(parseComboDarwin('cmd').keys).toEqual([]);
  });

  it('uses the real macOS key codes', () => {
    expect(KEYCODES.a).toBe(0x00);
    expect(KEYCODES.v).toBe(0x09);
    expect(KEYCODES.e).toBe(0x0e);
    expect(KEYCODES.return).toBe(0x24);
    expect(KEYCODES.escape).toBe(0x35);
  });

  it('throws on unknown keys', () => {
    expect(() => parseComboDarwin('cmd+banana')).toThrow(/Unsupported key/);
  });
});
