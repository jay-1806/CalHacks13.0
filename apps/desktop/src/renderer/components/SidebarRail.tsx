import FloatingButton from './FloatingButton';
import PrivacyIndicator from './PrivacyIndicator';
import './SidebarRail.css';

interface Props {
  state: 'idle' | 'listening' | 'thinking' | 'responding' | 'pointing' | 'error' | 'privacy';
  onExpand: () => void;
  isRecordingVoice: boolean;
  isSpeaking: boolean;
}

export default function SidebarRail({ state, onExpand, isRecordingVoice, isSpeaking }: Props) {
  return (
    <div className="sidebar-rail">
      <button className="rail-expand-hint no-drag" onClick={onExpand} title="Open ScreenTutor panel">
        ST
      </button>
      <FloatingButton
        state={state}
        onClick={onExpand}
        isRecordingVoice={isRecordingVoice}
        isSpeaking={isSpeaking}
      />
      <PrivacyIndicator />
    </div>
  );
}
