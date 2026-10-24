import { useState, useEffect, useRef, type FormEvent, type PointerEvent } from 'react';
import MemoryPanel from './MemoryPanel';
import SponsorStatusPanel from './SponsorStatusPanel';
import DemoLessonsPanel from './DemoLessonsPanel';
import {
  DEMO_LESSONS,
  PRODUCT_DISPLAY_NAME,
  canRestoreOnScreenExplanation,
  isTutorProcessingPhase,
  shouldShowExplanationHandoff,
  type DemoLesson,
} from '@screentutor/shared';
import { getScreenMetadata } from '../hooks/useScreenCapture';
import type { ChatTurn } from '../hooks/useChatHistory';
import type { StoredExplanation } from '../types/explanation';
import {
  ClearOverlayIcon,
  CloseIcon,
  EmptyMarkIcon,
  LessonsIcon,
  MemoryIcon,
  MicPanelIcon,
  MinimizeIcon,
  RegionActiveIcon,
  RegionIcon,
  ResetIcon,
  SendIcon,
  ShieldIcon,
  SpeakerIcon,
  SpeakerMutedIcon,
  SpinnerIcon,
} from './ui/panelIcons';
import { ExplanationHandoffCard, TutorProcessingStatus } from './TutorStatusCards';
import TutorCursorIcon from './TutorCursorIcon';
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
  /** Increment to focus the question input (Quicky.AI Text action). */
  focusInputToken?: number;
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
  focusInputToken = 0,
}: Props) {
  const chatThreadRef = useRef<HTMLDivElement>(null);
  const questionInputRef = useRef<HTMLInputElement>(null);
  const [showMemory, setShowMemory] = useState(false);
  const [showSponsors, setShowSponsors] = useState(false);
  const [showDemoLessons, setShowDemoLessons] = useState(false);
  const activeLesson = activeLessonId ? DEMO_LESSONS.find((l) => l.id === activeLessonId) : undefined;

  const micHoldingRef = useRef(false);
  const micReleaseCleanupRef = useRef<(() => void) | null>(null);

  const clearMicReleaseListeners = () => {
    micReleaseCleanupRef.current?.();
    micReleaseCleanupRef.current = null;
  };

  const handleMicPointerDown = async (e: PointerEvent<HTMLButtonElement>) => {
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
    if (!focusInputToken) return;
    const id = window.setTimeout(() => questionInputRef.current?.focus(), 40);
    return () => window.clearTimeout(id);
  }, [focusInputToken]);

  useEffect(() => {
    const el = chatThreadRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [chatTurns, response, isLoading, isSpeaking]);

  const activeTurn = chatTurns.find((t) => t.id === activeTurnId);
  const isConversationBusy = activeTurn != null && !['done', 'error'].includes(activeTurn.aiPhase);
  const canSend = !isLoading && !isConversationBusy && Boolean(question.trim());

  const handleSubmit = async (e: FormEvent) => {
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
            <TutorCursorIcon size={22} className="header-brand-mark" />
            <h3 className="header-brand-name">{PRODUCT_DISPLAY_NAME}</h3>
            {isSpeaking && !isMuted && (
              <span className="header-live-hint" aria-live="polite">
                Speaking…
              </span>
            )}
          </div>
          <button
            type="button"
            className="icon-btn close-btn no-drag"
            onClick={onClose}
            title="Minimize"
            aria-label="Minimize panel"
          >
            <MinimizeIcon />
          </button>
        </div>
        <div className="header-toolbar no-drag" role="toolbar" aria-label="Tutor tools">
          <button
            type="button"
            className={`icon-btn ${isMuted ? 'active' : ''}`}
            onClick={() => {
              const next = !isMuted;
              setIsMuted(next);
              localStorage.setItem('screentutor_muted', String(next));
              if (next) {
                window.speechSynthesis?.cancel();
              }
            }}
            title={isMuted ? 'Unmute TTS' : 'Mute TTS'}
            aria-label={isMuted ? 'Unmute TTS' : 'Mute TTS'}
            aria-pressed={isMuted}
          >
            {isMuted ? <SpeakerMutedIcon /> : <SpeakerIcon />}
          </button>
          <button
            type="button"
            className="icon-btn clear-overlay-btn"
            onClick={() => window.electronAPI.clearOverlay()}
            title="Clear Overlay"
            aria-label="Clear overlay annotations"
          >
            <ClearOverlayIcon />
          </button>
          <button
            type="button"
            className={`icon-btn region-select-btn ${isRegionCapture ? 'active' : ''}`}
            onClick={() => {
              if (isRegionCapture && onClearRegion) {
                onClearRegion();
              } else if (onStartRegionSelect) {
                void onStartRegionSelect();
              }
            }}
            disabled={isSelectingRegion || isLoading}
            title={isRegionCapture ? 'Clear area' : 'Select area'}
            aria-label={
              isSelectingRegion
                ? 'Selecting screen region'
                : isRegionCapture
                  ? 'Clear selected screen area'
                  : 'Select screen area to ask about'
            }
            aria-pressed={!!isRegionCapture}
          >
            {isSelectingRegion ? <SpinnerIcon /> : isRegionCapture ? <RegionActiveIcon /> : <RegionIcon />}
          </button>
          <button
            type="button"
            className="icon-btn demo-reset-btn"
            onClick={() => {
              setShowMemory(false);
              setShowSponsors(false);
              setShowDemoLessons(false);
              onResetDemo();
            }}
            title="Reset Demo Environment"
            aria-label="Reset demo environment"
          >
            <ResetIcon />
          </button>
          <button
            type="button"
            className={`icon-btn ${showDemoLessons ? 'active' : ''}`}
            onClick={handleToggleDemoLessons}
            title="Demo Lessons"
            aria-label="Demo lessons"
            aria-pressed={showDemoLessons}
          >
            <LessonsIcon />
          </button>
          <button
            type="button"
            className={`icon-btn ${showSponsors ? 'active' : ''}`}
            onClick={handleToggleSponsors}
            title="Sponsors"
            aria-label="Sponsor status"
            aria-pressed={showSponsors}
          >
            <ShieldIcon />
          </button>
          <button
            type="button"
            className={`icon-btn ${showMemory ? 'active' : ''}`}
            onClick={handleToggleMemory}
            title="Memory"
            aria-label="Memory settings"
            aria-pressed={showMemory}
          >
            <MemoryIcon />
          </button>
        </div>
      </div>

      <div className="chat-content">
        {showMemory ? (
          <div className="aux-panel-host">
            <MemoryPanel userId="user_123" />
          </div>
        ) : showSponsors ? (
          <div className="aux-panel-host">
            <SponsorStatusPanel />
          </div>
        ) : showDemoLessons ? (
          <div className="aux-panel-host">
            <DemoLessonsPanel
              onSelectQuestion={handleSelectDemoQuestion}
              onClose={() => setShowDemoLessons(false)}
            />
          </div>
        ) : (
          <>
            {activeLesson && (
              <div className="active-lesson-banner">
                <div className="active-lesson-info">
                  <span className="active-lesson-emoji" aria-hidden="true">
                    {activeLesson.emoji}
                  </span>
                  <div>
                    <div className="active-lesson-title">Demo Lesson Active</div>
                    <div className="active-lesson-preview-text">{activeLesson.content}</div>
                  </div>
                </div>
                <button
                  type="button"
                  className="clear-lesson-btn"
                  onClick={handleClearLesson}
                  title="Clear Active Lesson"
                  aria-label="Clear active lesson"
                >
                  <CloseIcon />
                </button>
              </div>
            )}

            <div className="chat-thread" ref={chatThreadRef}>
              {chatTurns.length === 0 && (
                <div className="chat-empty-state">
                  <div className="chat-empty-mark" aria-hidden="true">
                    <EmptyMarkIcon />
                  </div>
                  <p className="chat-empty-title">Ready when you are.</p>
                  <p className="chat-empty-copy">Ask about your screen.</p>
                </div>
              )}

              {chatTurns.map((turn) => (
                <div key={turn.id} className="chat-turn">
                  <div className="chat-message chat-message-user">
                    <div className="chat-bubble user-bubble">{turn.userText}</div>
                  </div>

                  <div className="chat-message chat-message-ai">
                    {turn.aiPhase === 'error' ? (
                      <div className="chat-bubble ai-bubble error-bubble">
                        <span>{turn.error || error}</span>
                        {turn.id === activeTurnId && (
                          <button
                            type="button"
                            className="retry-btn no-drag"
                            onClick={() => {
                              const devOverride =
                                localStorage.getItem('screentutor_dev_override_redaction') === 'true';
                              askQuestion(
                                turn.userText,
                                screenshot?.base64,
                                getScreenMetadata(screenshot),
                                activeLessonId,
                                devOverride
                              );
                            }}
                          >
                            Retry
                          </button>
                        )}
                      </div>
                    ) : isTutorProcessingPhase(turn.aiPhase) ? (
                      <TutorProcessingStatus phase={turn.aiPhase} />
                    ) : shouldShowExplanationHandoff(turn) ? (
                      <ExplanationHandoffCard
                        reference={turn.reference!}
                        canRestore={canRestoreOnScreenExplanation(turn)}
                        visible={turn.explanation?.visible}
                        onShowOnScreen={
                          canRestoreOnScreenExplanation(turn)
                            ? () => onRestoreExplanation(turn.id, turn.explanation!)
                            : undefined
                        }
                      />
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {isRecordingVoice ? (
        <div className="voice-recording-overlay no-drag" role="status" aria-live="polite">
          <div className="waveform-container" aria-hidden="true">
            <span className="waveform-bar bar1" />
            <span className="waveform-bar bar2" />
            <span className="waveform-bar bar3" />
            <span className="waveform-bar bar4" />
            <span className="waveform-bar bar5" />
          </div>
          <span className="voice-recording-text">
            Listening…
          </span>
        </div>
      ) : (
        !showMemory &&
        !showSponsors && (
          <>
            {isRegionCapture && (
              <div className="region-hint no-drag">Area captured</div>
            )}
            {isSelectingRegion && (
              <div className="region-hint no-drag">Drag to capture</div>
            )}
            <form className="chat-input no-drag" onSubmit={handleSubmit}>
              <button
                type="button"
                className="mic-btn no-drag"
                onPointerDown={handleMicPointerDown}
                disabled={isLoading || isConversationBusy}
                title={`Hold to speak (${HOLD_HOTKEY_LABEL})`}
                aria-label={`Hold to speak using ${HOLD_HOTKEY_LABEL}`}
              >
                <MicPanelIcon />
              </button>
              <input
                ref={questionInputRef}
                type="text"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask anything..."
                disabled={isLoading || isConversationBusy}
                aria-label="Ask anything"
              />
              <button
                type="submit"
                className="send-btn"
                disabled={!canSend}
                aria-label="Send question"
              >
                <SendIcon />
                <span>Send</span>
              </button>
            </form>
          </>
        )
      )}
    </div>
  );
}
