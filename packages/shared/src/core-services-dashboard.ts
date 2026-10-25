/**
 * Presentation helpers for the Quicky.AI Core Services dashboard (Part 6.7.2).
 *
 * Maps sponsor-registry payloads into a demo-friendly operational overview.
 * Does not invent connectivity — labels follow live SponsorIntegration status.
 */

import type { SponsorIntegration, SponsorName, SponsorStatus } from './sponsors.js';

export type CoreServiceTone = 'healthy' | 'warning' | 'neutral';

export interface CoreServiceRow {
  id: string;
  label: string;
  stateLabel: string;
  tone: CoreServiceTone;
  /** True when this row represents a verified external cloud connection. */
  claimsExternalConnection: boolean;
}

export interface TechnicalDetailRow {
  name: SponsorName;
  displayName: string;
  status: SponsorStatus;
  configured: boolean;
  enabled: boolean;
  missingEnvVars: string[];
  productUse: string;
  errorMessage?: string;
}

export interface CoreServicesDashboardModel {
  title: string;
  subtitle: string;
  coreServices: CoreServiceRow[];
  technicalDetails: TechnicalDetailRow[];
  /** True when any core row is in a warning tone. */
  hasCoreWarnings: boolean;
}

const SPONSOR_DISPLAY: Record<SponsorName, string> = {
  claude: 'Claude AI',
  cartesia: 'Cartesia Voice',
  moss: 'Moss Semantic Cache',
  convex: 'Convex Memory',
  elastic: 'Elastic Observability',
  sentry: 'Sentry Monitoring',
};

/** Optional / monitoring integrations — never prominent on the demo overview. */
const OPTIONAL_SPONSOR_NAMES = new Set<SponsorName>(['elastic', 'sentry']);

function findSponsor(
  sponsors: SponsorIntegration[],
  name: SponsorName
): SponsorIntegration | undefined {
  return sponsors.find((s) => s.name === name);
}

function toneForReady(ok: boolean): CoreServiceTone {
  return ok ? 'healthy' : 'warning';
}

/**
 * Build Claude / Cartesia / Moss rows from live status.
 * Ready only when status is `real` (verified credentials / connection).
 */
function coreRowFromSponsor(
  sponsor: SponsorIntegration | undefined,
  id: string,
  label: string
): CoreServiceRow | null {
  if (!sponsor) return null;
  if (sponsor.status === 'disabled') {
    return {
      id,
      label,
      stateLabel: 'Off',
      tone: 'neutral',
      claimsExternalConnection: false,
    };
  }
  if (sponsor.status === 'real') {
    return {
      id,
      label,
      stateLabel: 'Ready',
      tone: 'healthy',
      claimsExternalConnection: true,
    };
  }
  if (sponsor.status === 'configured') {
    return {
      id,
      label,
      stateLabel: 'Configured',
      tone: 'neutral',
      claimsExternalConnection: false,
    };
  }
  if (sponsor.status === 'error') {
    return {
      id,
      label,
      stateLabel: 'Unavailable',
      tone: 'warning',
      claimsExternalConnection: false,
    };
  }
  // mock / unknown — core tutoring feature missing
  return {
    id,
    label,
    stateLabel: 'Unavailable',
    tone: 'warning',
    claimsExternalConnection: false,
  };
}

/**
 * Memory row: never claims "Convex Cloud" when using in-process fallback.
 * - real → Learner Memory Connected (external)
 * - mock / in-process → Local Learner Memory Active
 * - error with local fallback → Local Learner Memory Active (no fake cloud claim)
 * - disabled → omitted
 */
function memoryCoreRow(convex: SponsorIntegration | undefined): CoreServiceRow | null {
  if (!convex || convex.status === 'disabled' || !convex.enabled) {
    return null;
  }

  if (convex.status === 'real') {
    return {
      id: 'learner-memory',
      label: 'Learner Memory',
      stateLabel: 'Connected',
      tone: 'healthy',
      claimsExternalConnection: true,
    };
  }

  // In-process fallback (mock) or configured-but-failed with local fallback.
  // Do not label as Convex Cloud / Persistent Cloud Memory.
  return {
    id: 'local-learner-memory',
    label: 'Local Learner Memory',
    stateLabel: 'Active',
    tone: 'healthy',
    claimsExternalConnection: false,
  };
}

function toTechnicalDetail(sp: SponsorIntegration): TechnicalDetailRow {
  return {
    name: sp.name,
    displayName: SPONSOR_DISPLAY[sp.name] ?? sp.name,
    status: sp.status,
    configured: sp.configured,
    enabled: sp.enabled,
    missingEnvVars: sp.missingEnvVars,
    productUse: sp.productUse,
    ...(sp.errorMessage ? { errorMessage: sp.errorMessage } : {}),
  };
}

/**
 * Build the demo Core Services model from live sponsor registry data.
 *
 * @param orchestratorReachable - true when the status fetch succeeded (desktop assistant up).
 */
export function buildCoreServicesDashboard(
  sponsors: SponsorIntegration[],
  options: { orchestratorReachable?: boolean } = {}
): CoreServicesDashboardModel {
  const orchestratorReachable = options.orchestratorReachable !== false;

  const claude = findSponsor(sponsors, 'claude');
  const cartesia = findSponsor(sponsors, 'cartesia');
  const moss = findSponsor(sponsors, 'moss');
  const convex = findSponsor(sponsors, 'convex');

  const coreServices: CoreServiceRow[] = [];

  const claudeRow = coreRowFromSponsor(claude, 'claude', 'Claude AI');
  if (claudeRow) coreServices.push(claudeRow);

  const cartesiaRow = coreRowFromSponsor(cartesia, 'cartesia', 'Cartesia Voice');
  if (cartesiaRow) coreServices.push(cartesiaRow);

  // Moss: show when enabled; omit when intentionally Off to keep the overview clean.
  if (moss && moss.status !== 'disabled') {
    const mossRow = coreRowFromSponsor(moss, 'moss', 'Moss Semantic Cache');
    if (mossRow) coreServices.push(mossRow);
  }

  const memoryRow = memoryCoreRow(convex);
  if (memoryRow) coreServices.push(memoryRow);

  coreServices.push({
    id: 'desktop-assistant',
    label: 'Desktop Assistant',
    stateLabel: orchestratorReachable ? 'Running' : 'Unreachable',
    tone: toneForReady(orchestratorReachable),
    claimsExternalConnection: false,
  });

  return {
    title: 'Core Services',
    subtitle: 'Operational systems for tutoring',
    coreServices,
    technicalDetails: sponsors.map(toTechnicalDetail),
    hasCoreWarnings: coreServices.some((row) => row.tone === 'warning'),
  };
}

/** True when a core overview row falsely claims an external cloud link. */
export function coreRowClaimsCloudWithoutVerification(row: CoreServiceRow): boolean {
  return row.claimsExternalConnection === true && row.tone !== 'healthy';
}

/**
 * Main overview should not surface env var names or MOCK/DISABLED badges.
 * Optional elastic/sentry never appear as core rows.
 */
export function isOptionalSponsorHiddenFromOverview(name: SponsorName): boolean {
  return OPTIONAL_SPONSOR_NAMES.has(name);
}

export function formatTechnicalStatus(status: SponsorStatus): string {
  switch (status) {
    case 'real':
      return 'Connected';
    case 'configured':
      return 'Configured';
    case 'mock':
      return 'Local fallback';
    case 'disabled':
      return 'Off';
    case 'error':
      return 'Error';
    default:
      return status;
  }
}
