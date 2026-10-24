import TutorCursorIcon from './TutorCursorIcon';
import './FloatingLauncher.css';
import { HOLD_HOTKEY_LABEL } from '../platform';

interface Props {
  state: 'idle' | 'listening' | 'thinking' | 'responding' | 'pointing' | 'error' | 'privacy';
  isExpanded: boolean;
  onToggle: () => void;
  isRecordingVoice: boolean;
  isSpeaking: boolean;
}

export default function FloatingLauncher({
  state,
  isExpanded,
  onToggle,
  isRecordingVoice,
  isSpeaking,
}: Props) {
  const getTooltip = () => {
    if (isExpanded) return 'Minimize ScreenTutor';
    switch (state) {
      case 'listening': return 'Listening...';
      case 'thinking': return 'ScreenTutor is thinking...';
      case 'pointing': return 'Pointing at target...';
      case 'responding': return 'Speaking response...';
      case 'error': return 'An error occurred';
      case 'privacy': return 'Privacy mode active';
      default: return `Hold ${HOLD_HOTKEY_LABEL} to speak · Click for sidebar`;
    }
  };

  return (
    <div className="floating-launcher no-drag">
      <button
        type="button"
        className={`launcher-btn state-${state} ${isExpanded ? 'expanded' : ''} ${isRecordingVoice ? 'recording' : ''} ${isSpeaking ? 'speaking' : ''}`}
        onClick={() => {
          window.electronAPI.setIgnoreMouseEvents(false);
          onToggle();
        }}
        title={getTooltip()}
        aria-label={getTooltip()}
      >
        <span className="launcher-icon-wrap">
          <TutorCursorIcon size={isExpanded ? 50 : 58} className="launcher-logo" />
          {(state === 'thinking' || state === 'listening' || isSpeaking) && (
            <span className="launcher-activity-ring" aria-hidden="true" />
          )}
        </span>
      </button>
    </div>
  );
}
