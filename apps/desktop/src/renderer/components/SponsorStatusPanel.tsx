import { useEffect, useState } from 'react';
import type { SponsorIntegration } from '@screentutor/shared';
import { getSponsorStatus } from '../api/client';
import './SponsorStatusPanel.css';

export default function SponsorStatusPanel() {
  const [sponsors, setSponsors] = useState<SponsorIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getSponsorStatus();
      setSponsors(data);
    } catch (e: any) {
      console.error(e);
      setError(e.message || 'Failed to fetch sponsor statuses.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'real': return 'badge-real';
      case 'mock': return 'badge-mock';
      case 'disabled': return 'badge-disabled';
      case 'error': return 'badge-error';
      default: return '';
    }
  };

  const formatName = (name: string) => {
    switch (name) {
      case 'claude': return 'Claude (Anthropic)';
      case 'codrive': return 'Claude Computer Use (Co-drive)';
      case 'convex': return 'Convex Memory';
      case 'moss': return 'Moss Semantic Cache';
      case 'apify': return 'Apify Web Research';
      case 'fetch_agentverse': return 'Fetch AI / Agentverse';
      case 'elastic': return 'Elastic Observability';
      case 'sentry': return 'Sentry Monitoring';
      case 'cartesia': return 'Cartesia Voice';
      default: return name;
    }
  };

  if (loading) return <div className="sponsor-panel"><div className="loader">Loading sponsor registry...</div></div>;
  if (error) return <div className="sponsor-panel"><div className="error">{error}</div><button className="refresh-btn" onClick={loadStatus}>Retry</button></div>;

  return (
    <div className="sponsor-panel">
      <div className="sponsor-header">
        <h4>Sponsor Integration Registry</h4>
        <button className="refresh-btn-icon" onClick={loadStatus} title="Refresh">🔄</button>
      </div>

      <div className="sponsor-list">
        {sponsors.map(sp => (
          <div key={sp.name} className="sponsor-card">
            <div className="card-top">
              <span className="sponsor-title">{formatName(sp.name)}</span>
              <span className={`status-badge ${getStatusBadgeClass(sp.status)}`}>
                {sp.status.toUpperCase()}
              </span>
            </div>
            
            <div className="card-details">
              <p className="detail-row">
                <strong>Configured:</strong> {sp.configured ? '✅ Yes' : '❌ No'}
                <span style={{ marginLeft: '12px' }}></span>
                <strong>Enabled:</strong> {sp.enabled ? '🟢 Yes' : '⚫ No'}
              </p>
              
              {sp.missingEnvVars.length > 0 && (
                <p className="missing-vars">
                  <strong>Missing:</strong> {sp.missingEnvVars.join(', ')}
                </p>
              )}

              <p className="detail-desc"><strong>Product Use:</strong> {sp.productUse}</p>
              <p className="detail-desc"><strong>Data Sent:</strong> {sp.dataSent}</p>
              
              <div className="privacy-notes">
                🔒 {sp.privacyNotes}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
