import './MockBadge.css';

export default function MockBadge() {
  // In a real app, we'd query the orchestrator to check if mock is active
  // For the MVP, we assume it's running in mock mode for the demo
  return (
    <span className="mock-badge" title="Running with local Mock AI Provider (No API keys needed)">
      MOCK AI
    </span>
  );
}
