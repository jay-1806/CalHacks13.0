import { useEffect, useState } from 'react';
import type { LearnerProfile } from '@screentutor/shared';
import { getMemory, updateMemory, clearMemory } from '../api/client';
import './MemoryPanel.css';

interface Props {
  userId: string;
}

export default function MemoryPanel({ userId }: Props) {
  const [profile, setProfile] = useState<LearnerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    loadProfile();
  }, [userId]);

  const loadProfile = async () => {
    setLoading(true);
    try {
      const p = await getMemory(userId);
      setProfile(p);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleMemory = async () => {
    if (!profile) return;
    try {
      const updated = await updateMemory(userId, { memoryEnabled: !profile.memoryEnabled });
      setProfile(updated);
    } catch (e) {
      console.error(e);
    }
  };

  const handleStyleChange = async (style: string) => {
    if (!profile) return;
    try {
      const updated = await updateMemory(userId, {
        preferredExplanationStyle: (style || undefined) as any
      });
      setProfile(updated);
    } catch (e) {
      console.error(e);
    }
  };

  const handleClear = async () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    setConfirmClear(false);
    await clearMemory(userId);
    loadProfile();
  };

  const handleCancelClear = () => {
    setConfirmClear(false);
  };

  if (loading) return <div className="memory-panel"><div className="loader">Loading memory...</div></div>;
  if (!profile) return <div className="memory-panel">Error loading memory.</div>;

  return (
    <div className="memory-panel">
      <div className="memory-header-row">
        <h4>Learner Profile</h4>
        <label className="toggle-container">
          <input
            type="checkbox"
            checked={profile.memoryEnabled !== false}
            onChange={handleToggleMemory}
          />
          <span className="slider"></span>
          <span className="toggle-label">Enable Memory</span>
        </label>
      </div>

      {profile.memoryEnabled === false && (
        <div className="memory-disabled-banner" role="status" aria-live="polite">
          🔒 Memory is disabled. No learning data will be recorded.
        </div>
      )}

      <div className="memory-section preference-section">
        <label className="style-label">Explanation Preference:</label>
        <select
          value={profile.preferredExplanationStyle || ''}
          onChange={(e) => handleStyleChange(e.target.value)}
          className="style-select"
        >
          <option value="">Default (None Chosen)</option>
          <option value="visual">Visual 🎨</option>
          <option value="step_by_step">Step by Step 👟</option>
          <option value="concise">Concise 📝</option>
          <option value="rigorous">Rigorous 📐</option>
        </select>
      </div>

      <div className="memory-scroll-area">
        <div className="memory-section">
          <h5>Weak Concepts ({profile.weakConcepts.length})</h5>
          {profile.weakConcepts.length === 0 ? (
            <p className="empty-state">No weak concepts identified yet.</p>
          ) : (
            <ul className="concept-list">
              {profile.weakConcepts.map(wc => (
                <li key={wc.concept} className="concept-item">
                  <div className="concept-meta">
                    <span className="concept-name">{wc.concept.replace(/_/g, ' ')}</span>
                    <span className="times-seen">Seen {wc.timesSeen || 1}x</span>
                  </div>
                  <div className="confidence-row">
                    <div className="confidence-bar">
                      <div className="confidence-fill" style={{ width: `${wc.confidence * 100}%` }}></div>
                    </div>
                    <span className="confidence-value">{(wc.confidence * 100).toFixed(0)}%</span>
                  </div>
                  {wc.lastSeenAt && (
                    <span className="last-seen">Last seen: {new Date(wc.lastSeenAt).toLocaleTimeString()}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="memory-section">
          <h5>Recent Questions ({profile.recentQuestions.length})</h5>
          {profile.recentQuestions.length === 0 ? (
            <p className="empty-state">No recent questions.</p>
          ) : (
            <ul className="history-list">
              {profile.recentQuestions.map((rq, i) => (
                <li key={i}>
                  <span className="q-text">"{rq.question}"</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {confirmClear ? (
        <div className="clear-confirm-box">
          <p className="clear-confirm-text">⚠️ This will permanently delete all your learning data. Are you sure?</p>
          <div className="clear-confirm-buttons">
            <button className="danger-btn" onClick={handleClear}>Yes, Clear All Memory</button>
            <button className="cancel-btn" onClick={handleCancelClear}>Cancel</button>
          </div>
        </div>
      ) : (
        <button className="danger-btn" onClick={handleClear}>Clear Memory</button>
      )}
    </div>
  );
}
