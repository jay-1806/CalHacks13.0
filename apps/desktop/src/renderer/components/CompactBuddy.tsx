import { useState, useEffect } from 'react';
import type { TutorResponse, TutorMode } from '@screentutor/shared';
import { parsePointTag } from '@screentutor/shared';
import { decideCoDriveAction } from '../api/codrive';
import './CompactBuddy.css';

interface Props {
  buddyState: 'idle' | 'listening' | 'thinking' | 'responding' | 'pointing' | 'error' | 'privacy';
  response: TutorResponse | null;
  error: string | null;
  isLoading: boolean;
  isStreaming: boolean;
  onAsk: (question: string) => void;
  onClose: () => void;
  onExpand: () => void;
  onTogglePrivacy: () => void;
  mode: TutorMode;
  onModeChange: (mode: TutorMode) => void;

  isRecordingVoice: boolean;
  isSpeaking: boolean;
  isMuted: boolean;
  onToggleMute: () => void;
  onStartVoiceRecording: () => Promise<void>;
  onStopVoiceRecording: () => Promise<void>;
}

export default function CompactBuddy({
  buddyState,
  response,
  error,
  isLoading,
  isStreaming,
  onAsk,
  onClose,
  onExpand,
  onTogglePrivacy,
  mode,
  onModeChange,
  isRecordingVoice,
  isSpeaking,
  isMuted,
  onToggleMute,
  onStartVoiceRecording,
  onStopVoiceRecording
}: Props) {
  const [question, setQuestion] = useState('');
  const [hintStep, setHintStep] = useState<0 | 1 | 2 | 3>(0);
  const [quizAnswerVisible, setQuizAnswerVisible] = useState(false);
  const [quizFeedbackGiven, setQuizFeedbackGiven] = useState(false);
  const [approvedActions, setApprovedActions] = useState<Record<string, { success: boolean; message: string }>>({});

  useEffect(() => {
    setHintStep(0);
    setQuizAnswerVisible(false);
    setQuizFeedbackGiven(false);
    setApprovedActions({});
  }, [response]);

  useEffect(() => {
    if (response?.hintLadder && mode === 'hint') {
      let activeText = '';
      if (hintStep === 0) activeText = response.hintLadder.conceptual;
      else if (hintStep === 1) activeText = response.hintLadder.visual;
      else if (hintStep === 2) activeText = response.hintLadder.nextStep;
      else if (hintStep === 3) activeText = response.hintLadder.fullSolution;

      const parsed = parsePointTag(activeText);
      if (parsed.pointTarget && parsed.pointTarget.x !== null && parsed.pointTarget.y !== null) {
        window.electronAPI.flyToPoint(
          parsed.pointTarget.x,
          parsed.pointTarget.y,
          parsed.pointTarget.screenNumber,
          activeText
        );
      }
    }
  }, [hintStep, response, mode]);

  const handleQuizFeedback = async (correct: boolean) => {
    if (!response || !response.concept) return;
    try {
      setQuizFeedbackGiven(true);
      await fetch(`http://localhost:4317/api/memory/user_123/quiz`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ concept: response.concept, correct })
      });
    } catch (err) {
      console.error('Failed to submit quiz feedback:', err);
    }
  };

  const handleApproveAction = async (actionId: string, approved: boolean) => {
    try {
      const result = await decideCoDriveAction(actionId, approved);
      setApprovedActions(prev => ({ ...prev, [actionId]: result }));
    } catch (err) {
      console.error('Failed to submit action approval:', err);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;
    onAsk(question);
    setQuestion('');
  };

  return (
    <div className="compact-buddy">
      <div className="compact-header drag-region">
        <div className="compact-title-row">
          <span className="compact-dot animate-pulse"></span>
          <span className="compact-title">ScreenTutor AI — {buddyState.toUpperCase()}</span>
        </div>
        <div className="compact-actions no-drag">
          <button className={`compact-btn ${isMuted ? 'active' : ''}`} onClick={onToggleMute} title={isMuted ? "Unmute TTS" : "Mute TTS"}>
            {isMuted ? '🔇' : '🔊'}
          </button>
          <button className="compact-btn" onClick={onExpand} title="Open Dashboard">🖥️</button>
          <button className="compact-btn" onClick={() => window.electronAPI.clearOverlay()} title="Clear Overlay">🧹</button>
          <button className="compact-btn close-btn" onClick={onClose} title="Collapse">✕</button>
        </div>
      </div>

      <div className="compact-body">
        {buddyState === 'listening' && (
          isRecordingVoice ? (
            <div className="compact-voice-recording no-drag">
              <div className="compact-waveform">
                <span className="c-wave-bar cb1"></span>
                <span className="c-wave-bar cb2"></span>
                <span className="c-wave-bar cb3"></span>
              </div>
              <span className="compact-voice-text">Recording... Release to send</span>
            </div>
          ) : (
            <form className="compact-form no-drag" onSubmit={handleSubmit}>
              <select
                value={mode}
                onChange={(e) => onModeChange(e.target.value as TutorMode)}
                className="compact-mode-select"
                disabled={isLoading}
              >
                <option value="explain">🎓 Explain</option>
                <option value="hint">💡 Hint</option>
                <option value="mistake">⚠️ Mistake</option>
                <option value="quiz">📝 Quiz</option>
                <option value="review">🧠 Review</option>
                <option value="research">🔍 Research</option>
                <option value="codrive">🖱️ Co-drive</option>
              </select>
              <button
                type="button"
                className="compact-mic-btn"
                onMouseDown={onStartVoiceRecording}
                onMouseUp={onStopVoiceRecording}
                onTouchStart={onStartVoiceRecording}
                onTouchEnd={onStopVoiceRecording}
                title="Hold to speak"
              >
                🎤
              </button>
              <input
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask ScreenTutor..."
                autoFocus
                disabled={isLoading}
              />
              <button type="submit" disabled={isLoading || !question.trim()}>
                Ask
              </button>
            </form>
          )
        )}

        {buddyState === 'thinking' && (
          <div className="compact-loader">
            <div className="glowing-spinner"></div>
            <span>Analyzing screen & question...</span>
          </div>
        )}

        {buddyState === 'pointing' && (
          <div className="compact-loader">
            <div className="glowing-spinner"></div>
            <span>Pointing to target on screen...</span>
          </div>
        )}

        {buddyState === 'responding' && response && (
          <div className={`compact-response mode-${mode}`}>
            <span className="quote-icon">💬</span>
            <div className="response-content">
              {mode === 'hint' && response.hintLadder ? (
                <div className="compact-hint-ladder">
                  <p className="response-text">
                    {hintStep === 0 && `💡 Conceptual: ${parsePointTag(response.hintLadder.conceptual).spokenText}`}
                    {hintStep === 1 && `🎨 Visual: ${parsePointTag(response.hintLadder.visual).spokenText}`}
                    {hintStep === 2 && `👟 Next Step: ${parsePointTag(response.hintLadder.nextStep).spokenText}`}
                    {hintStep === 3 && `🏆 Solution: ${parsePointTag(response.hintLadder.fullSolution).spokenText}`}
                  </p>
                  {hintStep < 3 && (
                    <button className="no-drag compact-action-btn" onClick={() => setHintStep((prev) => (prev + 1) as any)}>
                      Next Hint ➡️
                    </button>
                  )}
                </div>
              ) : mode === 'quiz' && response.quiz && response.quiz.length > 0 ? (
                <div className="compact-quiz">
                  <p className="response-text"><strong>Quiz:</strong> {response.quiz[0].question}</p>
                  {!quizAnswerVisible ? (
                    <button className="no-drag compact-action-btn" onClick={() => setQuizAnswerVisible(true)}>
                      Show Answer
                    </button>
                  ) : (
                    <div>
                      <p className="response-text quiz-ans">🔑 {response.quiz[0].answer}</p>
                      {!quizFeedbackGiven ? (
                        <div className="quiz-feedback-row">
                          <button className="no-drag feedback-btn correct" onClick={() => handleQuizFeedback(true)}>Got it! ✅</button>
                          <button className="no-drag feedback-btn incorrect" onClick={() => handleQuizFeedback(false)}>Need help ❌</button>
                        </div>
                      ) : (
                        <p className="response-text feedback-done">Concept mastery logged!</p>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <p className="response-text">
                    {isSpeaking && <span className="compact-speaking-dot animate-pulse">🔊 </span>}
                    {response.spokenText || response.spokenExplanation || response.summary}
                    {isStreaming && <span className="blinking-cursor">|</span>}
                  </p>
                  {isSpeaking && (
                    <div className="compact-speaking-wave-mini">
                      <span className="c-mini-bar cb1"></span>
                      <span className="c-mini-bar cb2"></span>
                      <span className="c-mini-bar cb3"></span>
                    </div>
                  )}
                </div>
              )}

              {response.proposedActions && response.proposedActions.length > 0 && (
                <div className="compact-proposed-actions animate-fadeIn">
                  {response.proposedActions.map((action: any) => (
                    <div key={action.id} className="compact-action-card">
                      <p className="compact-action-desc">👉 {action.description}</p>
                      <span className={`compact-risk-badge ${action.riskLevel}`}>{action.riskLevel.toUpperCase()} RISK</span>
                      {action.status === 'blocked' ? (
                        <p className="compact-action-blocked">
                          ⚠️ Blocked: {action.reason || 'Blocked by safety checks.'}
                        </p>
                      ) : approvedActions[action.id] ? (
                        <p className="compact-action-result">{approvedActions[action.id].message}</p>
                      ) : (
                        <div className="compact-action-buttons">
                          <button className="no-drag action-btn approve" onClick={() => handleApproveAction(action.id, true)}>
                            Approve
                          </button>
                          <button className="no-drag action-btn reject" onClick={() => handleApproveAction(action.id, false)}>
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {buddyState === 'error' && (
          <div className="compact-error">
            <span>⚠️ {error || 'An error occurred'}</span>
          </div>
        )}

        {buddyState === 'privacy' && (
          <div className="compact-privacy">
            <span>🛡️ Privacy Mode is Active (Capture Blocked)</span>
            <button className="no-drag disable-priv-btn" onClick={onTogglePrivacy}>
              Turn Off
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
