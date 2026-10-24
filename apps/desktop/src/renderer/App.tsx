import { useState, useEffect, useRef } from 'react';
import ChatPanel from './components/ChatPanel';
import FloatingLauncher from './components/FloatingLauncher';
import { useScreenCapture, getScreenMetadata } from './hooks/useScreenCapture';
import { useTutor } from './hooks/useTutor';
import { useChatHistory } from './hooks/useChatHistory';
import { TutorMode, buildNarrationSteps, estimateSpeechDurationMs } from '@screentutor/shared';
import { transcriptionProvider } from './api/transcription';
import { ttsProvider } from './api/tts';
import { performanceTracker } from './sentry';
import { PANEL_WIDTH, PANEL_HEIGHT, COLLAPSED_SIZE } from './panelLayout';
import type { StoredExplanation } from './types/explanation';

type BuddyState = 'idle' | 'listening' | 'thinking' | 'responding' | 'pointing' | 'error' | 'privacy';

export default function App() {
  const [buddyState, setBuddyState] = useState<BuddyState>('idle');
  const [isPanelExpanded, setIsPanelExpanded] = useState(false);
  const [question, setQuestion] = useState('');
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [revealedSpokenText, setRevealedSpokenText] = useState('');
  const [responseDelivered, setResponseDelivered] = useState(false);
  const [isMuted, setIsMuted] = useState(() => {
    return localStorage.getItem('screentutor_muted') === 'true';
  });
  const [activeLessonId, setActiveLessonId] = useState<string | undefined>(undefined);
  const [mode, setMode] = useState<TutorMode>(() => {
    const saved = localStorage.getItem('screentutor_mode');
    return (saved as TutorMode) || 'explain';
  });

  const handleModeChange = (newMode: TutorMode) => {
    setMode(newMode);
    localStorage.setItem('screentutor_mode', newMode);
  };

  const { screenshot, captureScreen, clearScreenshot, startRegionSelect, isSelectingRegion } = useScreenCapture();
  const { askQuestion, response, isLoading, isStreaming, isResponseReady, error, clearResponse } = useTutor();
  const { turns: chatTurns, activeTurnId, startTurn, resetTurns, syncActiveTurn, updateTurnExplanation, setTurnExplanation } = useChatHistory();
  const [isScanning, setIsScanning] = useState(false);

  const activeLessonIdRef = useRef(activeLessonId);
  const modeRef = useRef(mode);
  const screenshotRef = useRef(screenshot);
  const isRecordingRef = useRef(isRecordingVoice);
  const isPanelExpandedRef = useRef(isPanelExpanded);
  const wasSpeakingRef = useRef(false);
  const holdDictationRef = useRef(false);
  const voiceSessionRef = useRef<'idle' | 'starting' | 'active'>('idle');
  const pendingStopRef = useRef(false);
  const startVoiceRecordingRef = useRef<(options?: { showGlow?: boolean; fromHoldHotkey?: boolean }) => Promise<void>>(
    async () => {}
  );
  const stopVoiceRecordingRef = useRef<() => Promise<void>>(async () => {});
  const activeTurnIdRef = useRef(activeTurnId);
  const visibleExplanationTurnIdRef = useRef<string | null>(null);
  const chatRevealTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    activeLessonIdRef.current = activeLessonId;
    modeRef.current = mode;
    screenshotRef.current = screenshot;
    isRecordingRef.current = isRecordingVoice;
    isPanelExpandedRef.current = isPanelExpanded;
    activeTurnIdRef.current = activeTurnId;
  }, [activeLessonId, mode, screenshot, isRecordingVoice, isPanelExpanded, activeTurnId]);

  useEffect(() => {
    if (screenshot?.isRegionCapture && screenshot.base64 && !isPanelExpandedRef.current) {
      expandPanel();
    }
  }, [screenshot?.isRegionCapture, screenshot?.base64]);

  useEffect(() => {
    setResponseDelivered(false);
    wasSpeakingRef.current = false;
  }, [activeTurnId]);

  useEffect(() => {
    if (!isResponseReady) return;

    if (isSpeaking) {
      wasSpeakingRef.current = true;
      return;
    }

    if (wasSpeakingRef.current) {
      setResponseDelivered(true);
      return;
    }

    if (isMuted) {
      const text = response?.spokenText || response?.spokenExplanation || '';
      const ms = Math.max(2500, text.length * 35);
      const timer = setTimeout(() => setResponseDelivered(true), ms);
      return () => clearTimeout(timer);
    }

    const fallback = setTimeout(() => setResponseDelivered(true), 8000);
    return () => clearTimeout(fallback);
  }, [isResponseReady, isSpeaking, isMuted, response]);

  const expandPanel = () => {
    setIsPanelExpanded(true);
    window.electronAPI.setIgnoreMouseEvents(false);
    window.electronAPI.setMainSize(PANEL_WIDTH, PANEL_HEIGHT);
  };

  const collapsePanel = () => {
    if (isRecordingRef.current) {
      transcriptionProvider.stopSession().catch(console.error);
      voiceSessionRef.current = 'idle';
      pendingStopRef.current = false;
      setIsRecordingVoice(false);
      holdDictationRef.current = false;
      window.electronAPI.setDictationGlow(false);
    }
    setIsPanelExpanded(false);
    window.electronAPI.setMainSize(COLLAPSED_SIZE, COLLAPSED_SIZE);
  };

  const togglePanel = () => {
    if (isPanelExpandedRef.current) {
      collapsePanel();
    } else {
      handleOpenPanel();
    }
  };

  const startVoiceRecording = async (options?: { showGlow?: boolean; fromHoldHotkey?: boolean }) => {
    if (voiceSessionRef.current !== 'idle') return;

    const isPrivacy = await window.electronAPI.getPrivacyMode();
    if (isPrivacy) {
      setBuddyState('privacy');
      return;
    }

    voiceSessionRef.current = 'starting';
    pendingStopRef.current = false;

    if (options?.fromHoldHotkey) {
      holdDictationRef.current = true;
    }

    ttsProvider.stop();
    setIsSpeaking(false);
    setBuddyState('listening');
    setIsRecordingVoice(true);

    if (options?.showGlow !== false) {
      window.electronAPI.setDictationGlow(true);
    }

    try {
      await transcriptionProvider.startSession();
      voiceSessionRef.current = 'active';
      if (pendingStopRef.current) {
        pendingStopRef.current = false;
        await stopVoiceRecordingAndSubmit();
      }
    } catch (err) {
      console.error('Failed to start microphone recording:', err);
      voiceSessionRef.current = 'idle';
      setIsRecordingVoice(false);
      holdDictationRef.current = false;
      window.electronAPI.setDictationGlow(false);
      setBuddyState('error');
    }
  };

  const stopVoiceRecordingAndSubmit = async () => {
    if (voiceSessionRef.current === 'starting') {
      pendingStopRef.current = true;
      return;
    }
    if (voiceSessionRef.current === 'idle') return;

    const wasHoldDictation = holdDictationRef.current;
    holdDictationRef.current = false;
    voiceSessionRef.current = 'idle';
    pendingStopRef.current = false;
    setIsRecordingVoice(false);
    window.electronAPI.setDictationGlow(false);
    setBuddyState('thinking');

    try {
      await transcriptionProvider.stopSession();
      const transcript = await transcriptionProvider.getFinalTranscript(activeLessonIdRef.current);
      if (transcript && transcript.trim()) {
        if (!wasHoldDictation && !isPanelExpandedRef.current) {
          expandPanel();
        }
        startTurn(transcript.trim(), modeRef.current);
        setIsScanning(true);
        let capBase64 = screenshotRef.current?.base64;
        let capMeta = getScreenMetadata(screenshotRef.current);
        if (!activeLessonIdRef.current) {
          if (!capBase64) {
            const capData = await captureScreen();
            setIsScanning(false);
            if (!capData) {
              setBuddyState('privacy');
              return;
            }
            capBase64 = capData.base64;
            capMeta = getScreenMetadata(capData);
          } else {
            setIsScanning(false);
          }
        } else {
          setIsScanning(false);
        }

        const devOverride = localStorage.getItem('screentutor_dev_override_redaction') === 'true';
        const res = await askQuestion(transcript, modeRef.current, capBase64, capMeta, activeLessonIdRef.current, devOverride);
        setBuddyState(res ? 'responding' : 'error');
      } else {
        setBuddyState('idle');
      }
    } catch (err) {
      console.error('Failed to stop/transcribe recording:', err);
      setBuddyState('error');
      setIsScanning(false);
    }
  };

  startVoiceRecordingRef.current = startVoiceRecording;
  stopVoiceRecordingRef.current = stopVoiceRecordingAndSubmit;

  useEffect(() => {
    window.electronAPI.setIgnoreMouseEvents(false);
    window.electronAPI.setMainSize(COLLAPSED_SIZE, COLLAPSED_SIZE);

    window.electronAPI.onHoldDictationStart(async () => {
      if (voiceSessionRef.current !== 'idle') return;

      performanceTracker.startSpan('total_interaction_latency');
      performanceTracker.startSpan('hotkey_to_listening');

      const isPrivacy = await window.electronAPI.getPrivacyMode();
      if (isPrivacy) {
        setBuddyState('privacy');
        performanceTracker.endSpan('hotkey_to_listening');
        return;
      }

      performanceTracker.endSpan('hotkey_to_listening');

      // Screen capture runs on release (stopVoiceRecordingAndSubmit), not on hotkey press —
      // avoids triggering the OS screen-capture / recording UI (Windows, macOS) while holding the key.
      await startVoiceRecordingRef.current({ showGlow: false, fromHoldHotkey: true });
    });

    window.electronAPI.onHoldDictationEnd(async () => {
      await stopVoiceRecordingRef.current();
    });
  }, []);

  useEffect(() => {
    window.electronAPI.onExplanationReady((data) => {
      const turnId = activeTurnIdRef.current;
      if (!turnId) return;
      visibleExplanationTurnIdRef.current = turnId;
      setTurnExplanation(turnId, {
        text: data.text,
        anchorX: data.anchorX,
        anchorY: data.anchorY,
        dragOffsetX: 0,
        dragOffsetY: 0,
        visible: true,
      });
    });

    window.electronAPI.onExplanationMinimized((data) => {
      const turnId = visibleExplanationTurnIdRef.current;
      if (!turnId) return;
      updateTurnExplanation(turnId, {
        anchorX: data.anchorX,
        anchorY: data.anchorY,
        dragOffsetX: data.dragOffsetX,
        dragOffsetY: data.dragOffsetY,
        text: data.text,
        visible: false,
      });
    });

    window.electronAPI.onExplanationUpdated((data) => {
      const turnId = visibleExplanationTurnIdRef.current;
      if (!turnId) return;
      updateTurnExplanation(turnId, {
        anchorX: data.anchorX,
        anchorY: data.anchorY,
        dragOffsetX: data.dragOffsetX,
        dragOffsetY: data.dragOffsetY,
        text: data.text,
        visible: true,
      });
    });
  }, [setTurnExplanation, updateTurnExplanation]);

  useEffect(() => {
    syncActiveTurn({
      isScanning,
      isLoading,
      isStreaming,
      isSpeaking,
      isResponseReady,
      responseDelivered,
      response,
      error,
    });
  }, [isScanning, isLoading, isStreaming, isSpeaking, isResponseReady, responseDelivered, response, error, syncActiveTurn]);

  const clearChatRevealTimers = () => {
    for (const timer of chatRevealTimersRef.current) {
      clearTimeout(timer);
    }
    chatRevealTimersRef.current = [];
  };

  const beginSyncedNarration = (spoken: string, overlay: string) => {
    const steps = buildNarrationSteps(spoken, overlay);
    const durationMs = estimateSpeechDurationMs(spoken);
    setRevealedSpokenText('');

    window.electronAPI.startOverlayNarration({
      spokenText: spoken,
      overlayText: overlay,
      durationMs,
      captureRegion: screenshotRef.current?.captureRegion ?? null,
    });

    clearChatRevealTimers();
    const totalChars = steps.reduce((sum, step) => sum + step.spoken.length, 0) || 1;
    let elapsed = 0;

    steps.forEach((step, index) => {
      const timer = setTimeout(() => {
        setRevealedSpokenText(
          steps
            .slice(0, index + 1)
            .map((s) => s.spoken)
            .filter(Boolean)
            .join('\n')
        );
      }, elapsed);
      chatRevealTimersRef.current.push(timer);
      elapsed += durationMs * (step.spoken.length / totalChars);
    });
  };

  const finishSyncedNarration = (spoken: string) => {
    clearChatRevealTimers();
    window.electronAPI.finishOverlayNarration();
    setRevealedSpokenText(spoken);
  };

  useEffect(() => {
    if (!response || isStreaming || !isResponseReady) return;

    const spoken = response.spokenText || response.spokenExplanation || '';
    const overlayText = response.overlayText || response.visualText || '';
    if (!spoken) return;

    beginSyncedNarration(spoken, overlayText);

    return () => {
      clearChatRevealTimers();
    };
  }, [response, isStreaming, isResponseReady]);

  useEffect(() => {
    if (response && (response.spokenText || response.spokenExplanation) && !isStreaming) {
      const textToSpeak = response.spokenText || response.spokenExplanation || '';

      if (textToSpeak && !isMuted) {
        ttsProvider.speak(
          textToSpeak,
          () => setIsSpeaking(true),
          () => {
            finishSyncedNarration(textToSpeak);
            setIsSpeaking(false);
          }
        );
      } else if (textToSpeak && isMuted) {
        const timer = setTimeout(
          () => finishSyncedNarration(textToSpeak),
          estimateSpeechDurationMs(textToSpeak)
        );
        return () => clearTimeout(timer);
      }
    } else if (!isStreaming && !response) {
      ttsProvider.stop();
      setIsSpeaking(false);
      setRevealedSpokenText('');
      clearChatRevealTimers();
      window.electronAPI.finishOverlayNarration();
    }
  }, [response, isMuted, isStreaming]);

  useEffect(() => {
    if (response && response.drawings && response.drawings.length > 0) {
      setBuddyState('pointing');
      const timer = setTimeout(() => {
        if (!ttsProvider.isSpeaking()) {
          setBuddyState('responding');
        }
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [response]);

  const handleAsk = async (questionText: string) => {
    ttsProvider.stop();
    setIsSpeaking(false);
    setRevealedSpokenText('');
    clearChatRevealTimers();
    window.electronAPI.finishOverlayNarration();
    setBuddyState('thinking');
    try {
      setIsScanning(true);
      let capBase64 = screenshot?.base64;
      let capMeta = getScreenMetadata(screenshot);
      if (!activeLessonId) {
        if (!capBase64) {
          performanceTracker.startSpan('listening_to_screenshot');
          const capData = await captureScreen();
          performanceTracker.endSpan('listening_to_screenshot');
          setIsScanning(false);

          if (!capData) {
            setBuddyState('privacy');
            performanceTracker.endSpan('total_interaction_latency');
            return;
          }
          capBase64 = capData.base64;
          capMeta = getScreenMetadata(capData);
        } else {
          setIsScanning(false);
        }
      } else {
        setIsScanning(false);
      }

      const devOverride = localStorage.getItem('screentutor_dev_override_redaction') === 'true';
      const res = await askQuestion(questionText, mode, capBase64, capMeta, activeLessonId, devOverride);
      setBuddyState(res ? 'responding' : 'error');
      performanceTracker.endSpan('total_interaction_latency');
    } catch {
      setBuddyState('error');
      setIsScanning(false);
      performanceTracker.endSpan('total_interaction_latency');
    }
  };

  const handleStartRegionSelect = async () => {
    if (isPanelExpandedRef.current) {
      collapsePanel();
    }
    await startRegionSelect();
  };

  const handleClearRegion = () => {
    clearScreenshot();
  };

  const handleDemoReset = async () => {
    window.electronAPI.clearOverlay();
    clearResponse();
    clearScreenshot();
    resetTurns();
    handleModeChange('explain');
    setActiveLessonId('calculus_u_sub');
    setQuestion('');

    try {
      await fetch('http://localhost:4317/api/memory/user_123', { method: 'DELETE' });
    } catch (err) {
      console.error('Failed to clear user memory on demo reset:', err);
    }

    setBuddyState('idle');
  };

  const handleOpenPanel = async () => {
    performanceTracker.startSpan('total_interaction_latency');
    performanceTracker.startSpan('hotkey_to_listening');

    expandPanel();

    const isPrivacy = await window.electronAPI.getPrivacyMode();
    if (isPrivacy) {
      setBuddyState('privacy');
      performanceTracker.endSpan('hotkey_to_listening');
      return;
    }

    setBuddyState('listening');
    performanceTracker.endSpan('hotkey_to_listening');
  };

  const handleRestoreExplanation = (turnId: string, explanation: StoredExplanation) => {
    if (!explanation.text) return;

    visibleExplanationTurnIdRef.current = turnId;
    window.electronAPI.restoreExplanation({
      pointTarget: { x: explanation.anchorX, y: explanation.anchorY },
      text: explanation.text,
      dragOffsetX: explanation.dragOffsetX,
      dragOffsetY: explanation.dragOffsetY,
      showFullText: true,
    });
    updateTurnExplanation(turnId, { visible: true });

    if (!isPanelExpandedRef.current) {
      expandPanel();
    }
  };

  return (
    <div className={`app-container ${isPanelExpanded ? 'expanded' : 'collapsed'}`}>
      {isPanelExpanded && (
        <ChatPanel
          screenshot={screenshot}
          onClose={collapsePanel}
          mode={mode}
          onModeChange={handleModeChange}
          response={response}
          isLoading={isLoading}
          isStreaming={isStreaming}
          isResponseReady={isResponseReady}
          error={error}
          askQuestion={askQuestion}
          clearResponse={clearResponse}
          isRecordingVoice={isRecordingVoice}
          setIsRecordingVoice={setIsRecordingVoice}
          isSpeaking={isSpeaking}
          revealedSpokenText={revealedSpokenText}
          isMuted={isMuted}
          setIsMuted={setIsMuted}
          activeLessonId={activeLessonId}
          setActiveLessonId={setActiveLessonId}
          onStartVoiceRecording={startVoiceRecording}
          onStopVoiceRecording={stopVoiceRecordingAndSubmit}
          question={question}
          setQuestion={setQuestion}
          onResetDemo={handleDemoReset}
          onAsk={handleAsk}
          chatTurns={chatTurns}
          activeTurnId={activeTurnId}
          startTurn={startTurn}
          onRestoreExplanation={handleRestoreExplanation}
          isRegionCapture={!!screenshot?.isRegionCapture}
          isSelectingRegion={isSelectingRegion}
          onStartRegionSelect={handleStartRegionSelect}
          onClearRegion={handleClearRegion}
        />
      )}
      <FloatingLauncher
        state={buddyState}
        isExpanded={isPanelExpanded}
        onToggle={togglePanel}
        isRecordingVoice={isRecordingVoice}
        isSpeaking={isSpeaking}
      />
    </div>
  );
}
