import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PRODUCT_BUNDLE_DISPLAY_NAME,
  PRODUCT_DISPLAY_NAME,
  PRODUCT_USER_DATA_DIR,
  closeMenuProductLabel,
  minimizeProductLabel,
} from '@screentutor/shared';

const REPO_ROOT = join(__dirname, '../../../../');
const DESKTOP_ROOT = join(REPO_ROOT, 'apps/desktop');

describe('Quicky.AI brand identity', () => {
  it('uses the exact official display name', () => {
    expect(PRODUCT_DISPLAY_NAME).toBe('Quicky.AI');
    expect(PRODUCT_BUNDLE_DISPLAY_NAME).toBe('Quicky.AI');
    expect(PRODUCT_DISPLAY_NAME).not.toMatch(/Quicke|Quickie|QuickAI|Quicky AI/);
    expect(minimizeProductLabel()).toBe('Minimize Quicky.AI');
    expect(closeMenuProductLabel()).toBe('Close Quicky.AI menu');
  });

  it('preserves legacy userData directory identity', () => {
    expect(PRODUCT_USER_DATA_DIR).toBe('@screentutor/desktop');
  });

  it('keeps the untouched master logo at the repo root', () => {
    const master = join(REPO_ROOT, 'Quicky Logo.png');
    expect(existsSync(master)).toBe(true);
    expect(statSync(master).size).toBeGreaterThan(100_000);
    const buf = readFileSync(master);
    expect(buf[0]).toBe(0x89);
    expect(buf[1]).toBe(0x50); // P
    expect(buf[2]).toBe(0x4e); // N
    expect(buf[3]).toBe(0x47); // G
  });

  it('ships renderer + native icon assets derived from the master', () => {
    const paths = [
      join(DESKTOP_ROOT, 'src/renderer/assets/quicky-logo.png'),
      join(DESKTOP_ROOT, 'build/icon.png'),
      join(DESKTOP_ROOT, 'build/icon-1024.png'),
      join(DESKTOP_ROOT, 'build/icon.icns'),
      join(DESKTOP_ROOT, 'build/icon.ico'),
    ];
    for (const p of paths) {
      expect(existsSync(p), `missing ${p}`).toBe(true);
      expect(statSync(p).size).toBeGreaterThan(1000);
    }
  });

  it('configures electron-builder productName and icons without renaming appId', () => {
    const yml = readFileSync(join(DESKTOP_ROOT, 'electron-builder.yml'), 'utf8');
    expect(yml).toMatch(/productName:\s*Quicky\.AI/);
    expect(yml).toMatch(/appId:\s*ai\.screentutor\.desktop/);
    expect(yml).toMatch(/icon:\s*build\/icon\.icns/);
    expect(yml).toMatch(/icon:\s*build\/icon\.ico/);
    expect(yml).toMatch(/Quicky\.AI listens while you hold the hotkey/);
    expect(yml).toMatch(/Quicky\.AI captures your screen only when you ask/);
    expect(yml).not.toMatch(/productName:\s*ScreenTutor/);
    expect(yml).not.toMatch(/Quicke\.AI/);
  });

  it('uses Quicky.AI in HTML document titles', () => {
    const indexHtml = readFileSync(join(DESKTOP_ROOT, 'src/renderer/index.html'), 'utf8');
    const overlayHtml = readFileSync(join(DESKTOP_ROOT, 'src/renderer/overlay.html'), 'utf8');
    expect(indexHtml).toContain('<title>Quicky.AI</title>');
    expect(overlayHtml).toContain('<title>Quicky.AI Overlay</title>');
    expect(indexHtml).not.toMatch(/ScreenTutor|Quicke\.AI/);
    expect(overlayHtml).not.toMatch(/ScreenTutor|Quicke\.AI/);
  });

  it('locks userData path before setName in the Electron main entry', () => {
    const main = readFileSync(join(DESKTOP_ROOT, 'src/main/index.ts'), 'utf8');
    const setPathIdx = main.indexOf("app.setPath('userData'");
    const setNameIdx = main.indexOf('app.setName(PRODUCT_DISPLAY_NAME)');
    expect(setPathIdx).toBeGreaterThan(-1);
    expect(setNameIdx).toBeGreaterThan(-1);
    expect(setPathIdx).toBeLessThan(setNameIdx);
    expect(main).toContain('PRODUCT_USER_DATA_DIR');
    expect(main).toContain('requestSingleInstanceLock');
  });
});
