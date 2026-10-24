import './FloatingButton.css';
import { HOLD_HOTKEY_LABEL } from '../platform';

interface Props {
  state: 'idle' | 'listening' | 'thinking' | 'responding' | 'pointing' | 'error' | 'privacy';
  onClick: () => void;
  isRecordingVoice: boolean;
  isSpeaking: boolean;
}

export default function FloatingButton({ state, onClick, isRecordingVoice, isSpeaking }: Props) {
  const handleMouseEnter = () => {
    window.electronAPI.setIgnoreMouseEvents(false);
  };

  const handleMouseLeave = () => {
    // Panel window is narrow; no click-through needed when collapsed.
  };

  const renderIcon = () => {
    switch (state) {
      case 'listening':
        return (
          <div className="buddy-icon-wrapper voice-active">
            <span className="buddy-icon-emoji">🎤</span>
            <div className="mini-waveform">
              <span className="wave-bar"></span>
              <span className="wave-bar"></span>
              <span className="wave-bar"></span>
            </div>
          </div>
        );
      case 'thinking':
        return (
          <div className="buddy-icon-wrapper spinning">
            <span className="buddy-icon-emoji">🧠</span>
            <div className="glow-ring"></div>
          </div>
        );
      case 'pointing':
        return (
          <div className="buddy-icon-wrapper pointing-pulse">
            <span className="buddy-icon-emoji">🎯</span>
          </div>
        );
      case 'responding':
        return (
          <div className="buddy-icon-wrapper speaking-active">
            <span className="buddy-icon-emoji">🔊</span>
            <div className="speaking-ripples">
              <span className="ripple"></span>
              <span className="ripple"></span>
            </div>
          </div>
        );
      case 'error':
        return (
          <div className="buddy-icon-wrapper error-bounce">
            <span className="buddy-icon-emoji">⚠️</span>
          </div>
        );
      case 'privacy':
        return (
          <div className="buddy-icon-wrapper privacy-lock">
            <span className="buddy-icon-emoji">🛡️</span>
          </div>
        );
      case 'idle':
      default:
        return (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="tutor-logo">
            <path d="M12 2a10 10 0 1 0 10 10H12V2z"></path>
            <path d="M12 12 2.1 7.1"></path>
            <path d="m12 12 6.9 8.9"></path>
          </svg>
        );
    }
  };

  const getTooltipText = () => {
    switch (state) {
      case 'listening': return 'Listening... Speak now';
      case 'thinking': return 'ScreenTutor is thinking...';
      case 'pointing': return 'Looking at target...';
      case 'responding': return 'Speaking response...';
      case 'error': return 'An error occurred. Click to view.';
      case 'privacy': return 'Privacy Mode is Active';
      case 'idle':
      default:
        return `ScreenTutor AI (${HOLD_HOTKEY_LABEL})`;
    }
  };

  return (
    <div
      className="floating-btn-container"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <button
        className={`floating-btn state-${state} ${isRecordingVoice ? 'recording' : ''} ${isSpeaking ? 'speaking' : ''}`}
        onClick={() => {
          // Temporarily disable click-through, expand window
          window.electronAPI.setIgnoreMouseEvents(false);
          onClick();
        }}
        title={getTooltipText()}
      >
        {renderIcon()}
      </button>
    </div>
  );
}
