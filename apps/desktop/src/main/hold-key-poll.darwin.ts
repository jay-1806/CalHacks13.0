import koffi from 'koffi';
import { FLAG_COMMAND, FLAG_SHIFT } from '@screentutor/shared';

const CG = koffi.load('/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices');
const CGEventSourceKeyState = CG.func('bool CGEventSourceKeyState(int32 stateID, uint16 key)');
const CGEventSourceFlagsState = CG.func('uint64 CGEventSourceFlagsState(int32 stateID)');

/** kCGEventSourceStateCombinedSessionState */
const COMBINED_SESSION_STATE = 0;
const KEYCODE_E = 0x0e;

/** True while Cmd+Shift+E are all held (macOS). Polls hardware state; no event tap needed. */
export function isHoldComboPressed(): boolean {
  const flags = Number(CGEventSourceFlagsState(COMBINED_SESSION_STATE));
  return (
    (flags & FLAG_COMMAND) !== 0 &&
    (flags & FLAG_SHIFT) !== 0 &&
    CGEventSourceKeyState(COMBINED_SESSION_STATE, KEYCODE_E)
  );
}
