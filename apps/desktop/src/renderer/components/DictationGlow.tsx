import { useEffect, useState } from 'react';
import './DictationGlow.css';

export default function DictationGlow() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    window.electronAPI.onDictationGlow((data) => {
      setActive(!!data.active);
    });
  }, []);

  if (!active) return null;

  return (
    <div className="dictation-glow-root" aria-hidden="true">
      <div className="dictation-glow-aura" />
      <div className="dictation-glow-edge dictation-glow-edge-top" />
      <div className="dictation-glow-edge dictation-glow-edge-bottom" />
      <div className="dictation-glow-edge dictation-glow-edge-left" />
      <div className="dictation-glow-edge dictation-glow-edge-right" />
      <div className="dictation-glow-corners" />
      <div className="dictation-glow-pill">
        <div className="dictation-glow-waveform">
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <span className="dictation-glow-label">Listening…</span>
      </div>
    </div>
  );
}
