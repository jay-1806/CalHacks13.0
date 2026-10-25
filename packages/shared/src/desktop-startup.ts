/**
 * Shared desktop / orchestrator host safety helpers.
 * Kept independent of any packaged splash / Welcome / installer flow.
 */

export function isLoopbackOrchestratorHost(host: string): boolean {
  return host === '127.0.0.1' || host === 'localhost' || host === '::1';
}

/** CORS allowlist for the local learning engine. */
export function isAllowedOrchestratorCorsOrigin(origin: string | undefined | null): boolean {
  if (origin == null || origin === '' || origin === 'null') return true;
  try {
    const u = new URL(origin);
    if (u.protocol === 'file:') return true;
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return true;
    return false;
  } catch {
    return false;
  }
}
