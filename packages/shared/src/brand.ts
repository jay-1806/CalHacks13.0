/**
 * Official Quicky.AI product identity.
 *
 * Display name is user-facing. Internal package / IPC / storage IDs may still
 * use legacy `screentutor` identifiers for compatibility — do not rename those
 * blindly when updating branding.
 */

/** Exact user-facing product name (spelling is intentional). */
export const PRODUCT_DISPLAY_NAME = 'Quicky.AI' as const;

/** Short spoken / aria-friendly form without the domain-style suffix. */
export const PRODUCT_SHORT_NAME = 'Quicky' as const;

/**
 * Stable Electron / package-derived userData folder segment.
 * Must stay aligned with `@screentutor/desktop` so renaming the display name
 * does not orphan existing preferences.
 */
export const PRODUCT_USER_DATA_DIR = '@screentutor/desktop' as const;

/** Packaging / bundle display name (same as UI). */
export const PRODUCT_BUNDLE_DISPLAY_NAME = PRODUCT_DISPLAY_NAME;

export function minimizeProductLabel(): string {
  return `Minimize ${PRODUCT_DISPLAY_NAME}`;
}

export function closeMenuProductLabel(): string {
  return `Close ${PRODUCT_DISPLAY_NAME} menu`;
}
