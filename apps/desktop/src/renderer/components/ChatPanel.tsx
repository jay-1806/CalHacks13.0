import { useState, useEffect, useRef } from 'react';
import ModeTabs from './ModeTabs';
import MemoryPanel from './MemoryPanel';
import SponsorStatusPanel from './SponsorStatusPanel';
import DemoLessonsPanel from './DemoLessonsPanel';
import { TutorMode, parsePointTag, DEMO_LESSONS, type DemoLesson, RedactionService } from '@screentutor/shared';
import { getScreenMetadata } from '../hooks/useScreenCapture';
import * as Sentry from '@sentry/react';
import { getSimplerExplanation, generatePracticeProblem } from '../api/client';
import { decideCoDriveAction } from '../api/codrive';
import type { ChatTurn } from '../hooks/useChatHistory';
import type { StoredExplanation } from '../types/explanation';
import './ChatPanel.css';
import { HOLD_HOTKEY_LABEL } from '../platform';

interface Props {
  screenshot: { base64: string } | null;
  onClose: () => void;
  mode: TutorMode;
  onModeChange: (mode: TutorMode) => void;

  response: any;
  isLoading: boolean;
  isStreaming: boolean;
  isResponseReady: boolean;
  error: string | null;
  askQuestion: (question: string, mode: TutorMode, screenshot?: string, metadata?: any, lessonId?: string, devOverride?: boolean) => Promise<any>;
  clearResponse: () => void;

  isRecordingVoice: boolean;
  setIsRecordingVoice: (rec: boolean) => void;
  isSpeaking: boolean;
  revealedSpokenText?: string;
  isMuted: boolean;
  setIsMuted: (muted: boolean) => void;
  activeLessonId: string | undefined;
  setActiveLessonId: (id: string | undefined) => void;
  onStartVoiceRecording: () => Promise<void>;
  onStopVoiceRecording: () => Promise<void>;
  
  question: string;
  setQuestion: (q: string) => void;
  onResetDemo: () => void;
  onAsk?: (questionText: string) => Promise<void>;
  chatTurns: ChatTurn[];
  activeTurnId: string | null;
  startTurn: (userText: string, mode: TutorMode) => string;
  onRestoreExplanation: (turnId: string, explanation: StoredExplanation) => void;
  isRegionCapture?: boolean;
  isSelectingRegion?: boolean;
  onStartRegionSelect?: () => Promise<void>;
  onClearRegion?: () => void;
}

export default function ChatPanel({
  screenshot,
  onClose,
  mode,
  onModeChange,
  response,
  isLoading,
  isStreaming,
  isResponseReady,
  error,
  askQuestion,
  clearResponse,
  isRecordingVoice,
  isSpeaking,
  revealedSpokenText,
  isMuted,
  setIsMuted,
  activeLessonId,
  setActiveLessonId,
  onStartVoiceRecording,
  onStopVoiceRecording,
  question,
  setQuestion,
  onResetDemo,
  onAsk,
  chatTurns,
  activeTurnId,
  startTurn,
  onRestoreExplanation,
  isRegionCapture,
  isSelectingRegion,
  onStartRegionSelect,
  onClearRegion,
}: Props) {
  const chatThreadRef = useRef<HTMLDivElement>(null);
  const [showMemory, setShowMemory] = useState(false);
  const [showSponsors, setShowSponsors] = useState(false);
  const [showDemoLessons, setShowDemoLessons] = useState(false);
  const [forceUpdate, setForceUpdate] = useState(false);
  const activeLesson = activeLessonId ? DEMO_LESSONS.find(l => l.id === activeLessonId) : undefined;

  const [hintStep, setHintStep] = useState<0 | 1 | 2 | 3>(0);
  const [quizAnswerVisible, setQuizAnswerVisible] = useState(false);
  const [quizFeedbackGiven, setQuizFeedbackGiven] = useState(false);
  const [approvedActions, setApprovedActions] = useState<Record<string, { success: boolean; message: string }>>({});
  const [simplerExplanation, setSimplerExplanation] = useState<string | null>(null);
  const [practiceProblem, setPracticeProblem] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [confirmOpenUrl, setConfirmOpenUrl] = useState<string | null>(null);
  const micHoldingRef = useRef(false);
  const micReleaseCleanupRef = useRef<(() => void) | null>(null);

  const clearMicReleaseListeners = () => {
    micReleaseCleanupRef.current?.();
    micReleaseCleanupRef.current = null;
  };

  const handleMicPointerDown = async (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    if (isConversationBusy || micHoldingRef.current || isRecordingVoice) return;

    micHoldingRef.current = true;

    const finishMicHold = () => {
      if (!micHoldingRef.current) return;
      micHoldingRef.current = false;
      clearMicReleaseListeners();
      void onStopVoiceRecording();
    };

    const onRelease = () => finishMicHold();
    window.addEventListener('pointerup', onRelease);
    window.addEventListener('mouseup', onRelease);
    window.addEventListener('blur', onRelease);
    micReleaseCleanupRef.current = () => {
      window.removeEventListener('pointerup', onRelease);
      window.removeEventListener('mouseup', onRelease);
      window.removeEventListener('blur', onRelease);
    };

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // pointer capture may fail on some platforms
    }

    try {
      await onStartVoiceRecording();
    } catch (err) {
      console.error('Mic hold start failed:', err);
      micHoldingRef.current = false;
      clearMicReleaseListeners();
    }
  };

  useEffect(() => () => clearMicReleaseListeners(), []);

  useEffect(() => {
    setHintStep(0);
    setQuizAnswerVisible(false);
    setQuizFeedbackGiven(false);
    setApprovedActions({});
    setSimplerExplanation(null);
    setPracticeProblem(null);
    setConfirmOpenUrl(null);
    setLoadingAction(null);
  }, [response]);

  useEffect(() => {
    const el = chatThreadRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [chatTurns, response, isLoading, isSpeaking]);

  const getStatusLabel = (phase: ChatTurn['aiPhase']) => {
    switch (phase) {
      case 'scanning': return 'Scanning...';
      case 'thinking': return 'Thinking...';
      case 'outputting': return 'Outputting response...';
      default: return '';
    }
  };

  const activeTurn = chatTurns.find(t => t.id === activeTurnId);
  const isConversationBusy = activeTurn != null && !['done', 'error'].includes(activeTurn.aiPhase);

  const handleFindSimpler = async () => {
    if (!response || !response.concept) return;
    setLoadingAction('simpler');
    try {
      const data = await getSimplerExplanation(response.concept);
      setSimplerExplanation(data.explanation);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleCreatePractice = async () => {
    if (!response || !response.concept) return;
    setLoadingAction('practice');
    try {
      const data = await generatePracticeProblem(response.concept);
      setPracticeProblem(data.practice);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleApproveOpen = () => {
    if (confirmOpenUrl) {
      window.open(confirmOpenUrl, '_blank');
      setConfirmOpenUrl(null);
    }
  };

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = question.trim();
    if (!trimmed) return;

    startTurn(trimmed, mode);
    setQuestion('');

    if (onAsk) {
      await onAsk(trimmed);
      return;
    }
    const devOverride = localStorage.getItem('screentutor_dev_override_redaction') === 'true';
    await askQuestion(trimmed, mode, screenshot?.base64, getScreenMetadata(screenshot), activeLessonId, devOverride);
  };

  const handleToggleMemory = () => {
    setShowMemory(!showMemory);
    setShowSponsors(false);
    setShowDemoLessons(false);
  };

  const handleToggleSponsors = () => {
    setShowSponsors(!showSponsors);
    setShowMemory(false);
    setShowDemoLessons(false);
  };

  const handleToggleDemoLessons = () => {
    setShowDemoLessons(!showDemoLessons);
    setShowMemory(false);
    setShowSponsors(false);
  };

  const handleSelectDemoQuestion = async (questionLabel: string, questionMode: string, lesson: DemoLesson) => {
    onModeChange(questionMode as TutorMode);
    setQuestion('');
    setActiveLessonId(lesson.id);
    setShowDemoLessons(false);
    startTurn(questionLabel, questionMode as TutorMode);
    const devOverride = localStorage.getItem('screentutor_dev_override_redaction') === 'true';
    await askQuestion(questionLabel, questionMode as TutorMode, undefined, undefined, lesson.id, devOverride);
  };

  const handleClearLesson = () => {
    setActiveLessonId(undefined);
    setQuestion('');
    clearResponse();
  };

  const handleSendTestSentryEvent = () => {
    try {
      throw new Error('Test Sentry Event from ScreenTutor Desktop UI');
    } catch (err) {
      Sentry.captureException(err);
      alert('Test event captured in Sentry! (if configured)');
    }
  };

  const handleSimulateOverlayError = () => {
    window.electronAPI.simulateOverlayError();
    alert('Simulated overlay error triggered! It will throw in the overlay window.');
  };

  const renderActiveResponse = (turnMode: TutorMode) => {
    if (!response) return null;

    return (
      <div className={`tutor-response mode-${turnMode}`}>
        <p className="summary">{response.summary}</p>

        {turnMode === 'hint' && response.hintLadder ? (
          <div className="hint-ladder-box">
            <h4>Hint Ladder</h4>
            <div className="hint-ladder-steps">
              <div className={`hint-step ${hintStep >= 0 ? 'active' : ''}`}>
                <h5>💡 Conceptual Hint</h5>
                <p>{parsePointTag(response.hintLadder.conceptual).spokenText}</p>
              </div>
              {hintStep >= 1 && (
                <div className="hint-step active">
                  <h5>🎨 Visual Hint</h5>
                  <p>{parsePointTag(response.hintLadder.visual).spokenText}</p>
                </div>
              )}
              {hintStep >= 2 && (
                <div className="hint-step active">
                  <h5>👟 Next Step</h5>
                  <p>{parsePointTag(response.hintLadder.nextStep).spokenText}</p>
                </div>
              )}
              {hintStep >= 3 && (
                <div className="hint-step active">
                  <h5>🏆 Full Solution</h5>
                  <p>{parsePointTag(response.hintLadder.fullSolution).spokenText}</p>
                </div>
              )}
              {hintStep < 3 && (
                <button className="next-hint-btn" onClick={() => setHintStep(prev => (prev + 1) as any)}>
                  Show Next Hint
                </button>
              )}
            </div>
          </div>
        ) : turnMode === 'quiz' && response.quiz && response.quiz.length > 0 ? (
          <div className="quiz-box">
            <h4>Pop Quiz!</h4>
            <div className="quiz-item">
              <p><strong>Question:</strong> {response.quiz[0].question}</p>
              {!quizAnswerVisible ? (
                <button className="quiz-btn" onClick={() => setQuizAnswerVisible(true)}>
                  Show Answer
                </button>
              ) : (
                <div className="quiz-answer-area">
                  <p className="quiz-ans"><strong>Answer:</strong> {response.quiz[0].answer}</p>
                  {response.quiz[0].explanation && (
                    <p className="quiz-exp"><em>Explanation:</em> {response.quiz[0].explanation}</p>
                  )}
                  {!quizFeedbackGiven ? (
                    <div className="quiz-feedback-buttons">
                      <button className="feedback-btn correct" onClick={() => handleQuizFeedback(true)}>
                        Correct (Got it!) ✅
                      </button>
                      <button className="feedback-btn incorrect" onClick={() => handleQuizFeedback(false)}>
                        Incorrect (Need help) ❌
                      </button>
                    </div>
                  ) : (
                    <p className="feedback-saved-msg">Concept mastery logged in memory!</p>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <>
            {(response.spokenText || response.spokenExplanation) && (() => {
              const spokenFull = response.spokenText || response.spokenExplanation || '';
              const spokenDisplay = isSpeaking ? revealedSpokenText : (revealedSpokenText || spokenFull);
              return (
              <div className="spoken">
                {isSpeaking && (
                  <span className="speaking-bubble-icon animate-pulse" style={{ marginRight: '6px' }}>
                    🔊
                  </span>
                )}
                💬 "{spokenDisplay}"
              </div>
              );
            })()}
            {isSpeaking && (
              <div className="speaking-wave-mini">
                <div className="mini-bar b1"></div>
                <div className="mini-bar b2"></div>
                <div className="mini-bar b3"></div>
                <span>Speaking response...</span>
              </div>
            )}
          </>
        )}

        {response.hints && response.hints.length > 0 && turnMode !== 'hint' && (
          <ul className="hints">
            {(response.hints as string[]).map((h, i) => <li key={i}>{h}</li>)}
          </ul>
        )}

        {response.proposedActions && response.proposedActions.length > 0 && (
          <div className="proposed-actions-box">
            <h4>Proposed Desktop Actions</h4>
            {response.proposedActions.map((action: any) => (
              <div key={action.id} className="action-card">
                <p className="action-desc">👉 {action.description}</p>
                <span className={`risk-badge ${action.riskLevel}`}>{action.riskLevel.toUpperCase()} RISK</span>
                {action.status === 'blocked' ? (
                  <p className="action-blocked-warning" style={{ color: '#ef4444', fontWeight: 'bold', marginTop: '8px' }}>
                    ⚠️ Blocked: {action.reason || 'Safety checks blocked this action.'}
                  </p>
                ) : approvedActions[action.id] ? (
                  <p className="action-result">{approvedActions[action.id].message}</p>
                ) : (
                  <div className="action-card-buttons">
                    <button className="action-btn approve" onClick={() => handleApproveAction(action.id, true)}>
                      Approve & Execute
                    </button>
                    <button className="action-btn reject" onClick={() => handleApproveAction(action.id, false)}>
                      Reject
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {response.researchResult && (
          <div className="research-box">
            <h4>{response.researchResult.title}</h4>
            <p className="research-summary">{response.researchResult.summary}</p>

            {response.researchResult.keyTakeaways && (
              <ul className="takeaways-list">
                {response.researchResult.keyTakeaways.map((k: string, i: number) => <li key={i}>{k}</li>)}
              </ul>
            )}

            {response.researchResult.suggestedPractice && !practiceProblem && (
              <p className="practice"><strong>Suggested Practice:</strong> {response.researchResult.suggestedPractice}</p>
            )}

            {simplerExplanation && (
              <div className="simpler-explanation-box">
                <h5>💡 Simpler Explanation</h5>
                <p>{simplerExplanation}</p>
              </div>
            )}

            {practiceProblem && (
              <div className="practice-problem-box">
                <h5>📝 Extra Practice Problem</h5>
                <p>{practiceProblem}</p>
              </div>
            )}

            <div className="research-actions-row">
              <button
                className="research-btn"
                onClick={handleFindSimpler}
                disabled={!!loadingAction}
              >
                {loadingAction === 'simpler' ? 'Searching...' : 'Find Simpler Explanation'}
              </button>
              <button
                className="research-btn"
                onClick={handleCreatePractice}
                disabled={!!loadingAction}
              >
                {loadingAction === 'practice' ? 'Generating...' : 'Create Practice Problem'}
              </button>

              {response.researchResult.sourceUrl && (
                <div className="open-source-wrapper">
                  {confirmOpenUrl ? (
                    <div className="confirm-open-box">
                      <span>Open external link?</span>
                      <button className="confirm-yes" onClick={handleApproveOpen}>Yes</button>
                      <button className="confirm-no" onClick={() => setConfirmOpenUrl(null)}>No</button>
                    </div>
                  ) : (
                    <button className="research-btn open-source-btn" onClick={() => setConfirmOpenUrl(response.researchResult.sourceUrl)}>
                      Open Source 🌐
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        {response.routingDecision && (
          <div className="dev-debug-panel">
            <details>
              <summary>🛠️ Developer Debug Panel</summary>
              <div className="debug-content">
                <p><strong>Selected Agent:</strong> <code>{response.routingDecision.selectedAgent}</code></p>
                <p><strong>Trigger Reason:</strong> {RedactionService.redactText(response.routingDecision.reason)}</p>
                <p><strong>Provider:</strong> <code>{response.routingDecision.provider || 'Local Provider'}</code></p>

                <div style={{ margin: '8px 0', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#ccc' }}>
                  <input
                    type="checkbox"
                    id="dev-override-redaction-checkbox"
                    checked={localStorage.getItem('screentutor_dev_override_redaction') === 'true'}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      localStorage.setItem('screentutor_dev_override_redaction', String(checked));
                      RedactionService.setDevOverride(checked);
                      setForceUpdate(prev => !prev);
                    }}
                  />
                  <label htmlFor="dev-override-redaction-checkbox" style={{ cursor: 'pointer' }}>
                    🔓 Enable Dev Redaction Override
                  </label>
                </div>

                <div className="debug-sentry-controls" style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
                  <button type="button" onClick={handleSendTestSentryEvent} className="btn-debug-sentry">
                    Send test Sentry event
                  </button>
                  <button type="button" onClick={handleSimulateOverlayError} className="btn-debug-sentry">
                    Simulate overlay error
                  </button>
                </div>

                {response.observability && (
                  <div className="debug-observability">
                    <hr style={{ borderColor: 'rgba(255,255,255,0.08)', margin: '8px 0' }} />
                    <p><strong>Trace ID:</strong> <code>{response.observability.traceId}</code></p>
                    <p><strong>Latency:</strong> <code>{response.observability.latencyMs} ms</code></p>
                    <p><strong>Point Tag Valid:</strong> {response.observability.evaluations.point_tag_valid?.passed ? '✅ Yes' : '❌ No (Invalid)'}</p>
                    <div className="debug-evals" style={{ marginTop: '6px' }}>
                      <strong>AI Quality Evaluations:</strong>
                      <ul style={{ margin: '4px 0 0 0', paddingLeft: '16px', listStyleType: 'none' }}>
                        {Object.entries(response.observability.evaluations).map(([name, val]: any) => (
                          <li key={name} style={{ fontSize: '10px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span>{val.passed ? '✅' : '❌'}</span>
                            <span style={{ textTransform: 'capitalize' }}>{name.replace(/_/g, ' ')}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            </details>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="chat-panel">
      <div className="chat-header drag-region">
        <div className="header-top">
          <div className="header-left">
            <h3>ScreenTutor</h3>
          </div>
          <button className="icon-btn close-btn no-drag" onClick={onClose} title="Minimize">
            −
          </button>
        </div>
        <div className="header-toolbar no-drag">
          <button className={`icon-btn ${isMuted ? 'active' : ''}`} onClick={() => {
            const next = !isMuted;
            setIsMuted(next);
            localStorage.setItem('screentutor_muted', String(next));
            if (next) {
              window.speechSynthesis?.cancel();
            }
          }} title={isMuted ? 'Unmute TTS' : 'Mute TTS'}>
            {isMuted ? '🔇' : '🔊'}
          </button>
          <button className="icon-btn clear-overlay-btn" onClick={() => window.electronAPI.clearOverlay()} title="Clear Overlay">
            🧹
          </button>
          <button
            className={`icon-btn region-select-btn ${isRegionCapture ? 'active' : ''}`}
            onClick={() => {
              if (isRegionCapture && onClearRegion) {
                onClearRegion();
              } else if (onStartRegionSelect) {
                void onStartRegionSelect();
              }
            }}
            disabled={isSelectingRegion || isLoading}
            title={isRegionCapture ? 'Clear selected area (use full screen)' : 'Select area of screen to ask about'}
          >
            {isSelectingRegion ? '⏳' : isRegionCapture ? '▣' : '▢'}
          </button>
          <button className="icon-btn demo-reset-btn" onClick={() => {
            setShowMemory(false);
            setShowSponsors(false);
            setShowDemoLessons(false);
            onResetDemo();
          }} title="Reset Demo Environment">
            🔄
          </button>
          <button className={`icon-btn ${showDemoLessons ? 'active' : ''}`} onClick={handleToggleDemoLessons} title="Demo Lessons">
            🎓
          </button>
          <button className={`icon-btn ${showSponsors ? 'active' : ''}`} onClick={handleToggleSponsors} title="Sponsors">
            🛡️
          </button>
          <button className={`icon-btn ${showMemory ? 'active' : ''}`} onClick={handleToggleMemory} title="Memory">
            🧠
          </button>
        </div>
      </div>

      <div className="chat-content">
        {showMemory ? (
          <MemoryPanel userId="user_123" />
        ) : showSponsors ? (
          <SponsorStatusPanel />
        ) : showDemoLessons ? (
          <DemoLessonsPanel
            onSelectQuestion={handleSelectDemoQuestion}
            onClose={() => setShowDemoLessons(false)}
          />
        ) : (
          <>
            {activeLesson && (
              <div className="active-lesson-banner">
                <div className="active-lesson-info">
                  <span className="active-lesson-emoji">{activeLesson.emoji}</span>
                  <div>
                    <div className="active-lesson-title">Demo Lesson Active</div>
                    <div className="active-lesson-preview-text">{activeLesson.content}</div>
                  </div>
                </div>
                <button className="clear-lesson-btn" onClick={handleClearLesson} title="Clear Active Lesson">
                  ✕
                </button>
              </div>
            )}

            <ModeTabs activeMode={mode} onModeChange={onModeChange} />

            <div className="chat-thread" ref={chatThreadRef}>
              {chatTurns.length === 0 && (
                <div className="chat-empty-state">
                  Ask a question about your screen to start a conversation.
                </div>
              )}

              {chatTurns.map(turn => (
                <div key={turn.id} className="chat-turn">
                  <div className="chat-message chat-message-user">
                    <div className="chat-bubble user-bubble">{turn.userText}</div>
                  </div>

                  <div className="chat-message chat-message-ai">
                    {turn.aiPhase === 'done' && turn.reference ? (
                      turn.explanation ? (
                        <button
                          type="button"
                          className={`chat-bubble ai-bubble reference-bubble reference-btn ${turn.explanation.visible ? 'active' : ''}`}
                          onClick={() => onRestoreExplanation(turn.id, turn.explanation!)}
                          title="Show explanation on screen"
                        >
                          <span className="reference-icon" aria-hidden="true">📘</span>
                          <span className="reference-text">{turn.reference}</span>
                        </button>
                      ) : (
                        <div className="chat-bubble ai-bubble reference-bubble">
                          <span className="reference-icon" aria-hidden="true">📘</span>
                          <span className="reference-text">{turn.reference}</span>
                        </div>
                      )
                    ) : turn.aiPhase === 'error' ? (
                      <div className="chat-bubble ai-bubble error-bubble">
                        <span>{turn.error || error}</span>
                        {turn.id === activeTurnId && (
                          <button
                            type="button"
                            className="retry-btn no-drag"
                            onClick={() => {
                              const devOverride = localStorage.getItem('screentutor_dev_override_redaction') === 'true';
                              askQuestion(turn.userText, turn.mode, screenshot?.base64, getScreenMetadata(screenshot), activeLessonId, devOverride);
                            }}
                          >
                            🔄 Retry
                          </button>
                        )}
                      </div>
                    ) : turn.aiPhase === 'outputting' && turn.id === activeTurnId ? (
                      <div className="chat-bubble ai-bubble outputting-bubble">
                        <div className="chat-status-label animate-pulse">{getStatusLabel(turn.aiPhase)}</div>
                        {isResponseReady && turn.mode !== 'explain' && renderActiveResponse(turn.mode)}
                      </div>
                    ) : (
                      <div className="chat-bubble ai-bubble status-bubble animate-pulse">
                        {getStatusLabel(turn.aiPhase)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {isRecordingVoice ? (
        <div className="voice-recording-overlay no-drag">
          <div className="waveform-container">
            <span className="waveform-bar bar1"></span>
            <span className="waveform-bar bar2"></span>
            <span className="waveform-bar bar3"></span>
            <span className="waveform-bar bar4"></span>
            <span className="waveform-bar bar5"></span>
          </div>
          <span className="voice-recording-text">Listening… release {HOLD_HOTKEY_LABEL} or the mic button to send</span>
        </div>
      ) : (
        !showMemory && !showSponsors && (
          <>
            {isRegionCapture && (
              <div className="region-hint no-drag">Asking about selected screen area only</div>
            )}
            {isSelectingRegion && (
              <div className="region-hint no-drag">Drag on screen to select an area…</div>
            )}
          <form className="chat-input no-drag" onSubmit={handleSubmit}>
            <button
              type="button"
              className="mic-btn no-drag"
              onPointerDown={handleMicPointerDown}
              disabled={isLoading || isConversationBusy}
              title="Hold to speak"
            >
              🎤
            </button>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask about your screen..."
              disabled={isLoading || isConversationBusy}
            />
            <button type="submit" disabled={isLoading || isConversationBusy || !question.trim()}>
              Send
            </button>
          </form>
          </>
        )
      )}
    </div>
  );
}
