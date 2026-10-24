import { useEffect, useState } from 'react';
import './PrivacyIndicator.css';

export default function PrivacyIndicator() {
  const [isPrivate, setIsPrivate] = useState(false);

  useEffect(() => {
    // Initial check
    window.electronAPI.getPrivacyMode().then(setIsPrivate);
  }, []);

  const toggle = async () => {
    const newState = await window.electronAPI.togglePrivacyMode();
    setIsPrivate(newState);
  };

  return (
    <div className={`privacy-indicator no-drag ${isPrivate ? 'active' : ''}`} onClick={toggle} title="Toggle global privacy mode (Deny all screen capture)">
      {isPrivate ? '🔒 Privacy Mode On' : '🔓'}
    </div>
  );
}
