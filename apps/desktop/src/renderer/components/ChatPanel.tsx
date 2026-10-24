import { useState, useEffect, useRef } from 'react';
import MemoryPanel from './MemoryPanel';
import SponsorStatusPanel from './SponsorStatusPanel';
import DemoLessonsPanel from './DemoLessonsPanel';
import { DEMO_LESSONS, type DemoLesson } from '@screentutor/shared';
import { getScreenMetadata } from '../hooks/useScreenCapture';
import type { ChatTurn } from '../hooks/useChatHistory';
import type { StoredExplanation } from '../types/explanation';
import './ChatPanel.css';
import { HOLD_HOTKEY_LABEL } from '../platform';

interface Props {
  screenshot: { base64: string } | null;
  onClose: () => void;

  response: any;
  isLoading: boolean;
  isStreaming: boolean;
  isResponseReady: boolean;
  error: string | null;
  askQuestion: (question: string, screenshot?: string, metadata?: any, lessonId?: string, devOverride?: boolean) => Promise<any>;
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
  startTurn: (userText: string) => string;
  onRestoreExplanation: (turnId: string, explanation: StoredExplanation) => void;
  isRegionCapture?: boolean;
  isSelectingRegion?: boolean;
  onStartRegionSelect?: () => Promise<void>;
  onClearRegion?: () => void;
}

export default function ChatPanel({
  screenshot,
  onClose,
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
  const activeLesson = activeLessonId ? DEMO_LESSONS.find(l => l.id === activeLessonId) : undefined;

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = question.trim();
    if (!trimmed) return;

    startTurn(trimmed);
    setQuestion('');

    if (onAsk) {
      await onAsk(trimmed);
      return;
    }
    const devOverride = localStorage.getItem('screentutor_dev_override_redaction') === 'true';
    await askQuestion(trimmed, screenshot?.base64, getScreenMetadata(screenshot), activeLessonId, devOverride);
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

  const handleSelectDemoQuestion = async (questionLabel: string, lesson: DemoLesson) => {
    setQuestion('');
    setActiveLessonId(lesson.id);
    setShowDemoLessons(false);
    startTurn(questionLabel);
    const devOverride = localStorage.getItem('screentutor_dev_override_redaction') === 'true';
    await askQuestion(questionLabel, undefined, undefined, lesson.id, devOverride);
  };

  const handleClearLesson = () => {
    setActiveLessonId(undefined);
    setQuestion('');
    clearResponse();
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
                              askQuestion(turn.userText, screenshot?.base64, getScreenMetadata(screenshot), activeLessonId, devOverride);
                            }}
                          >
                            🔄 Retry
                          </button>
                        )}
                      </div>
                    ) : turn.aiPhase === 'outputting' && turn.id === activeTurnId ? (
                      <div className="chat-bubble ai-bubble outputting-bubble">
                        <div className="chat-status-label animate-pulse">{getStatusLabel(turn.aiPhase)}</div>
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
