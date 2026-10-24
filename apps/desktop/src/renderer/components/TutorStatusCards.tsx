import type { TutorAiPhase } from '@screentutor/shared';
import {
  getExplanationRestoreLabel,
  getTutorProcessingLabel,
  getTutorProcessingSupport,
} from '@screentutor/shared';
import { BookIcon, StatusPulseIcon } from './ui/panelIcons';

interface ProcessingStatusProps {
  phase: TutorAiPhase;
}

/** Compact Frosted Pearl processing row — one phase at a time, real aiPhase only. */
export function TutorProcessingStatus({ phase }: ProcessingStatusProps) {
  const label = getTutorProcessingLabel(phase);
  if (!label) return null;
  const support = getTutorProcessingSupport(phase);

  return (
    <div
      className="tutor-status-card"
      role="status"
      aria-live="polite"
      aria-atomic="true"
      data-phase={phase}
    >
      <span className="tutor-status-icon" aria-hidden="true">
        <StatusPulseIcon />
      </span>
      <div className="tutor-status-copy">
        <div className="tutor-status-label">{label}</div>
        {support ? <div className="tutor-status-support">{support}</div> : null}
      </div>
    </div>
  );
}

interface ExplanationHandoffProps {
  reference: string;
  canRestore: boolean;
  visible?: boolean;
  onShowOnScreen?: () => void;
}

/**
 * Teaching handoff card — points students to the on-screen overlay.
 * Restore button only when StoredExplanation text exists; label matches restoreExplanation.
 */
export function ExplanationHandoffCard({
  reference,
  canRestore,
  visible,
  onShowOnScreen,
}: ExplanationHandoffProps) {
  return (
    <div className={`explanation-handoff-card ${visible ? 'is-visible' : ''}`}>
      <div className="explanation-handoff-top">
        <span className="explanation-handoff-icon" aria-hidden="true">
          <BookIcon />
        </span>
        <div className="explanation-handoff-copy">
          <div className="explanation-handoff-title">Explanation on screen</div>
          <p className="explanation-handoff-support">Follow the steps on your screen.</p>
          {reference && reference !== 'Explanation delivered' ? (
            <p className="explanation-handoff-reference">{reference}</p>
          ) : null}
        </div>
      </div>
      {canRestore && onShowOnScreen ? (
        <button
          type="button"
          className={`explanation-handoff-action no-drag ${visible ? 'active' : ''}`}
          onClick={onShowOnScreen}
          aria-label={getExplanationRestoreLabel(visible)}
          aria-pressed={!!visible}
        >
          {getExplanationRestoreLabel(visible)}
        </button>
      ) : null}
    </div>
  );
}
