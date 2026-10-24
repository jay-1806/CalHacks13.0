/**
 * macOS CGEventFlags modifier masks, used by the hold-to-talk poller
 * (apps/desktop/src/main/hold-key-poll.darwin.ts). Pure data, testable anywhere.
 */
export const FLAG_SHIFT = 0x20000;
export const FLAG_CONTROL = 0x40000;
export const FLAG_OPTION = 0x80000;
export const FLAG_COMMAND = 0x100000;
