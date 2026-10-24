import type { TutorMode } from '@screentutor/shared';
import './ModeTabs.css';

interface Props {
  activeMode: TutorMode;
  onModeChange: (mode: TutorMode) => void;
}

export default function ModeTabs({ activeMode, onModeChange }: Props) {
  const modes: { id: TutorMode; label: string; icon: string }[] = [
    { id: 'explain', label: 'Explain', icon: '🎓' },
    { id: 'hint', label: 'Hint', icon: '💡' },
    { id: 'mistake', label: 'Mistake', icon: '⚠️' },
    { id: 'quiz', label: 'Quiz', icon: '📝' },
    { id: 'review', label: 'Review', icon: '🧠' },
    { id: 'research', label: 'Research', icon: '🔍' },
    { id: 'codrive', label: 'Co-drive', icon: '🖱️' },
  ];

  return (
    <div className="mode-tabs no-drag">
      {modes.map(m => (
        <button
          key={m.id}
          className={`mode-tab ${activeMode === m.id ? 'active' : ''}`}
          onClick={() => onModeChange(m.id)}
        >
          <span className="mode-icon">{m.icon}</span>
          <span className="mode-label">{m.label}</span>
        </button>
      ))}
    </div>
  );
}
