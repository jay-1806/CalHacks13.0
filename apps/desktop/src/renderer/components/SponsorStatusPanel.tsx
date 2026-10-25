import { useEffect, useState } from 'react';
import type { SponsorIntegration } from '@screentutor/shared';
import {
  buildCoreServicesDashboard,
  formatTechnicalStatus,
  type CoreServiceTone,
} from '@screentutor/shared';
import { getSponsorStatus } from '../api/client';
import './SponsorStatusPanel.css';

function toneClass(tone: CoreServiceTone): string {
  switch (tone) {
    case 'healthy':
      return 'tone-healthy';
    case 'warning':
      return 'tone-warning';
    default:
      return 'tone-neutral';
  }
}

function technicalToneClass(status: string): string {
  switch (status) {
    case 'real':
      return 'tech-connected';
    case 'configured':
      return 'tech-configured';
    case 'mock':
      return 'tech-fallback';
    case 'disabled':
      return 'tech-off';
    case 'error':
      return 'tech-error';
    default:
      return '';
  }
}

export default function SponsorStatusPanel() {
  const [sponsors, setSponsors] = useState<SponsorIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reachable, setReachable] = useState(true);

  const loadStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getSponsorStatus();
      setSponsors(data);
      setReachable(true);
    } catch (e: unknown) {
      console.error(e);
      const message = e instanceof Error ? e.message : 'Failed to fetch service status.';
      setError(message);
      setReachable(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadStatus();
  }, []);

  const model = buildCoreServicesDashboard(sponsors, {
    orchestratorReachable: reachable && !error,
  });

  if (loading) {
    return (
      <div className="sponsor-panel core-services-panel">
        <div className="core-loader">Checking services…</div>
      </div>
    );
  }

  if (error && sponsors.length === 0) {
    return (
      <div className="sponsor-panel core-services-panel">
        <div className="core-header">
          <div>
            <h4>Core Services</h4>
            <p className="core-subtitle">Operational systems for tutoring</p>
          </div>
        </div>
        <div className="core-error" role="alert">
          Desktop Assistant unreachable. {error}
        </div>
        <button type="button" className="core-retry" onClick={() => void loadStatus()}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="sponsor-panel core-services-panel">
      <div className="core-header">
        <div>
          <h4>{model.title}</h4>
          <p className="core-subtitle">{model.subtitle}</p>
        </div>
        <button
          type="button"
          className="refresh-btn-icon"
          onClick={() => void loadStatus()}
          title="Refresh"
          aria-label="Refresh core services"
        >
          ↻
        </button>
      </div>

      <ul className="core-service-list" aria-label="Core services">
        {model.coreServices.map((row) => (
          <li key={row.id} className={`core-service-row ${toneClass(row.tone)}`}>
            <span className="core-status-dot" aria-hidden="true" />
            <span className="core-service-label">{row.label}</span>
            <span className="core-service-state">{row.stateLabel}</span>
          </li>
        ))}
      </ul>

      <details className="core-technical">
        <summary>Technical details</summary>
        <ul className="tech-detail-list">
          {model.technicalDetails.map((detail) => (
            <li key={detail.name} className="tech-detail-row">
              <div className="tech-detail-top">
                <span className="tech-detail-name">{detail.displayName}</span>
                <span className={`tech-status ${technicalToneClass(detail.status)}`}>
                  {formatTechnicalStatus(detail.status)}
                </span>
              </div>
              <p className="tech-detail-use">{detail.productUse}</p>
              {detail.errorMessage ? (
                <p className="tech-detail-error">{detail.errorMessage}</p>
              ) : null}
              {detail.missingEnvVars.length > 0 ? (
                <p className="tech-detail-missing">
                  Missing: {detail.missingEnvVars.join(', ')}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
