import koffi from 'koffi';

const user32 = koffi.load('user32.dll');
const GetAsyncKeyState = user32.func('short __stdcall GetAsyncKeyState(int vKey)');

const VK_CONTROL = 0x11;
const VK_SHIFT = 0x10;
const VK_E = 0x45;

function isKeyDown(vk: number): boolean {
  return (GetAsyncKeyState(vk) & 0x8000) !== 0;
}

/** True while Ctrl+Shift+E are all held (Windows). */
export function isHoldComboPressed(): boolean {
  return isKeyDown(VK_CONTROL) && isKeyDown(VK_SHIFT) && isKeyDown(VK_E);
}
