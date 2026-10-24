import koffi from 'koffi';
import { FLAG_COMMAND, FLAG_CONTROL, FLAG_OPTION, FLAG_SHIFT, MODIFIER_KEYCODES, parseComboDarwin } from '@screentutor/shared';

/**
 * macOS input for approved Co-drive actions, via CoreGraphics event posting (same approach
 * as desktop-input.win32.ts, which calls user32). Needs the Accessibility permission, which
 * desktop-actions.ts requests before calling in here.
 *
 * Coordinates are global "points" with the origin at the top-left of the primary display,
 * which is exactly what Electron's screen API reports on macOS (no DIP conversion needed).
 */
const CG = koffi.load('/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices');
const CF = koffi.load('/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation');

const CGPoint = koffi.struct('CGPoint', { x: 'double', y: 'double' });

const CGEventCreateMouseEvent = CG.func('void *CGEventCreateMouseEvent(void *source, uint32 type, CGPoint pos, uint32 button)');
const CGEventCreateKeyboardEvent = CG.func('void *CGEventCreateKeyboardEvent(void *source, uint16 virtualKey, bool keyDown)');
const CGEventCreateScrollWheelEvent2 = CG.func(
  'void *CGEventCreateScrollWheelEvent2(void *source, uint32 units, uint32 wheelCount, int32 wheel1, int32 wheel2, int32 wheel3)'
);
const CGEventSetFlags = CG.func('void CGEventSetFlags(void *event, uint64 flags)');
const CGEventSetIntegerValueField = CG.func('void CGEventSetIntegerValueField(void *event, uint32 field, int64 value)');
const CGEventPost = CG.func('void CGEventPost(uint32 tap, void *event)');
const CFRelease = CF.func('void CFRelease(void *cf)');

// CGEventType
const LEFT_MOUSE_DOWN = 1;
const LEFT_MOUSE_UP = 2;
const RIGHT_MOUSE_DOWN = 3;
const RIGHT_MOUSE_UP = 4;
const MOUSE_MOVED = 5;
// CGMouseButton
const BUTTON_LEFT = 0;
const BUTTON_RIGHT = 1;
// CGEventField
const MOUSE_EVENT_CLICK_STATE = 1;
// CGEventTapLocation
const HID_EVENT_TAP = 0;
// CGScrollEventUnit
const SCROLL_UNIT_LINE = 1;

/** One mouse-wheel "click" on Windows is about three lines. */
const LINES_PER_CLICK = 3;
const EVENT_GAP_MS = 6;

const sleepBuffer = new Int32Array(new SharedArrayBuffer(4));
function sleepSync(ms: number): void {
  Atomics.wait(sleepBuffer, 0, 0, ms);
}

function post(event: unknown, flags?: number): void {
  if (!event) throw new Error('CoreGraphics returned a null event (is Accessibility permission granted?)');
  try {
    if (flags !== undefined) CGEventSetFlags(event, flags);
    CGEventPost(HID_EVENT_TAP, event);
  } finally {
    CFRelease(event);
  }
}

function moveTo(x: number, y: number): void {
  post(CGEventCreateMouseEvent(null, MOUSE_MOVED, { x, y }, BUTTON_LEFT));
  sleepSync(EVENT_GAP_MS);
}

function pressKey(code: number, flags: number): void {
  post(CGEventCreateKeyboardEvent(null, code, true), flags);
  sleepSync(EVENT_GAP_MS);
  post(CGEventCreateKeyboardEvent(null, code, false), flags);
}

/** "cmd+shift+s" or "ctrl+v" (use translateComboForPlatform first for Windows-style combos). */
export function pressCombo(combo: string): void {
  const { flags, keys } = parseComboDarwin(combo);
  if (keys.length === 0) {
    // Modifier-only combo: tap each modifier key.
    for (const mask of [FLAG_COMMAND, FLAG_SHIFT, FLAG_OPTION, FLAG_CONTROL]) {
      if (flags & mask) pressKey(MODIFIER_KEYCODES[mask], mask);
    }
    return;
  }
  for (const code of keys) {
    pressKey(code, flags);
    sleepSync(EVENT_GAP_MS);
  }
}

export function click(x: number, y: number, button: 'left' | 'right', count: number, modifiers?: string): void {
  const flags = modifiers ? parseComboDarwin(modifiers).flags : 0;
  const [downType, upType, cgButton] =
    button === 'right' ? [RIGHT_MOUSE_DOWN, RIGHT_MOUSE_UP, BUTTON_RIGHT] : [LEFT_MOUSE_DOWN, LEFT_MOUSE_UP, BUTTON_LEFT];
  const point = { x: Math.round(x), y: Math.round(y) };

  moveTo(point.x, point.y);
  for (let i = 1; i <= count; i++) {
    for (const type of [downType, upType]) {
      const event = CGEventCreateMouseEvent(null, type, point, cgButton);
      if (event) CGEventSetIntegerValueField(event, MOUSE_EVENT_CLICK_STATE, i); // 2 = double-click, etc.
      post(event, flags);
      sleepSync(EVENT_GAP_MS);
    }
  }
}

export function scroll(direction: 'up' | 'down' | 'left' | 'right', amount: number, at?: { x: number; y: number }): void {
  if (at) moveTo(Math.round(at.x), Math.round(at.y));
  const lines = Math.max(1, Math.round(amount)) * LINES_PER_CLICK;
  // CoreGraphics: positive vertical = scroll up, positive horizontal = scroll left.
  const vertical = direction === 'up' ? lines : direction === 'down' ? -lines : 0;
  const horizontal = direction === 'left' ? lines : direction === 'right' ? -lines : 0;
  post(CGEventCreateScrollWheelEvent2(null, SCROLL_UNIT_LINE, 2, vertical, horizontal, 0));
}
