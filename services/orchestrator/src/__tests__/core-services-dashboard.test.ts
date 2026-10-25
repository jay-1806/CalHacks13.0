import { describe, expect, it } from 'vitest';
import {
  buildCoreServicesDashboard,
  coreRowClaimsCloudWithoutVerification,
  formatTechnicalStatus,
  isOptionalSponsorHiddenFromOverview,
  type SponsorIntegration,
} from '@screentutor/shared';

function sponsor(
  partial: Partial<SponsorIntegration> & Pick<SponsorIntegration, 'name' | 'status'>
): SponsorIntegration {
  return {
    configured: true,
    enabled: true,
    requiredEnvVars: [],
    missingEnvVars: [],
    productUse: 'test',
    dataSent: 'none',
    privacyNotes: 'none',
    lastHealthCheckAt: new Date().toISOString(),
    ...partial,
  };
}

const healthyStack: SponsorIntegration[] = [
  sponsor({ name: 'claude', status: 'real' }),
  sponsor({
    name: 'convex',
    status: 'mock',
    configured: false,
    missingEnvVars: ['CONVEX_URL', 'SCREENTUTOR_CONVEX_SECRET'],
  }),
  sponsor({ name: 'moss', status: 'real' }),
  sponsor({
    name: 'elastic',
    status: 'mock',
    configured: false,
    missingEnvVars: ['ELASTIC_OTLP_ENDPOINT', 'ELASTIC_API_KEY'],
  }),
  sponsor({ name: 'sentry', status: 'disabled', configured: false, enabled: false, missingEnvVars: ['SENTRY_DSN'] }),
  sponsor({ name: 'cartesia', status: 'real' }),
];

describe('core services dashboard presentation', () => {
  it('shows healthy core services with green-ready labels', () => {
    const model = buildCoreServicesDashboard(healthyStack);

    expect(model.title).toBe('Core Services');
    expect(model.coreServices.map((r) => `${r.label} — ${r.stateLabel}`)).toEqual([
      'Claude AI — Ready',
      'Cartesia Voice — Ready',
      'Moss Semantic Cache — Ready',
      'Local Learner Memory — Active',
      'Desktop Assistant — Running',
    ]);
    expect(model.coreServices.every((r) => r.tone === 'healthy')).toBe(true);
    expect(model.hasCoreWarnings).toBe(false);
  });

  it('labels in-process memory as Local Learner Memory, not Convex Cloud', () => {
    const model = buildCoreServicesDashboard(healthyStack);
    const memory = model.coreServices.find((r) => r.id === 'local-learner-memory');
    expect(memory?.label).toBe('Local Learner Memory');
    expect(memory?.claimsExternalConnection).toBe(false);
    expect(model.coreServices.some((r) => /convex cloud|persistent cloud/i.test(r.label))).toBe(
      false
    );
  });

  it('claims Connected learner memory only when Convex status is real', () => {
    const withConvex = healthyStack.map((s) =>
      s.name === 'convex' ? sponsor({ name: 'convex', status: 'real', configured: true, missingEnvVars: [] }) : s
    );
    const model = buildCoreServicesDashboard(withConvex);
    const memory = model.coreServices.find((r) => r.id === 'learner-memory');
    expect(memory).toMatchObject({
      label: 'Learner Memory',
      stateLabel: 'Connected',
      tone: 'healthy',
      claimsExternalConnection: true,
    });
    expect(model.coreServices.some((r) => r.id === 'local-learner-memory')).toBe(false);
  });

  it('omits optional unconfigured Elastic and Sentry from the main overview', () => {
    const model = buildCoreServicesDashboard(healthyStack);
    const overviewIds = model.coreServices.map((r) => r.id);
    expect(overviewIds).not.toContain('elastic');
    expect(overviewIds).not.toContain('sentry');
    expect(isOptionalSponsorHiddenFromOverview('elastic')).toBe(true);
    expect(isOptionalSponsorHiddenFromOverview('sentry')).toBe(true);

    // Still available under technical details
    expect(model.technicalDetails.map((d) => d.name)).toEqual(
      expect.arrayContaining(['elastic', 'sentry', 'convex', 'claude'])
    );
  });

  it('does not expose missing credential names on core rows', () => {
    const model = buildCoreServicesDashboard(healthyStack);
    const serialized = JSON.stringify(model.coreServices);
    expect(serialized).not.toMatch(/CONVEX_URL|ELASTIC_|SENTRY_DSN|SCREENTUTOR_/);
  });

  it('keeps missing credentials only in collapsed technical details', () => {
    const model = buildCoreServicesDashboard(healthyStack);
    const convexTech = model.technicalDetails.find((d) => d.name === 'convex');
    expect(convexTech?.missingEnvVars).toEqual(
      expect.arrayContaining(['CONVEX_URL', 'SCREENTUTOR_CONVEX_SECRET'])
    );
    expect(formatTechnicalStatus('mock')).toBe('Local fallback');
    expect(formatTechnicalStatus('disabled')).toBe('Off');
  });

  it('surfaces real core failures instead of false green', () => {
    const broken = healthyStack.map((s) =>
      s.name === 'claude' ? sponsor({ name: 'claude', status: 'error', configured: false }) : s
    );
    const model = buildCoreServicesDashboard(broken);
    const claude = model.coreServices.find((r) => r.id === 'claude');
    expect(claude).toMatchObject({
      stateLabel: 'Unavailable',
      tone: 'warning',
      claimsExternalConnection: false,
    });
    expect(model.hasCoreWarnings).toBe(true);
  });

  it('marks desktop assistant unreachable when orchestrator fetch failed', () => {
    const model = buildCoreServicesDashboard(healthyStack, { orchestratorReachable: false });
    const desktop = model.coreServices.find((r) => r.id === 'desktop-assistant');
    expect(desktop).toMatchObject({
      stateLabel: 'Unreachable',
      tone: 'warning',
    });
  });

  it('never marks a cloud claim on a non-healthy core row', () => {
    const model = buildCoreServicesDashboard(
      healthyStack.map((s) =>
        s.name === 'cartesia' ? sponsor({ name: 'cartesia', status: 'error' }) : s
      )
    );
    expect(model.coreServices.some(coreRowClaimsCloudWithoutVerification)).toBe(false);
  });

  it('does not show Convex Cloud branding for mock memory fallback', () => {
    const model = buildCoreServicesDashboard(healthyStack);
    const labels = model.coreServices.map((r) => `${r.label} ${r.stateLabel}`.toLowerCase());
    expect(labels.some((l) => l.includes('convex') && l.includes('connected'))).toBe(false);
    expect(labels.some((l) => l.includes('mock'))).toBe(false);
    expect(labels.some((l) => l.includes('disabled'))).toBe(false);
  });
});
