import { useState, useEffect, useRef, useCallback, type CSSProperties } from 'react';
import ChatPanel from './components/ChatPanel';
import FloatingLauncher from './components/FloatingLauncher';
import WelcomeOnboarding from './components/WelcomeOnboarding';
import { useScreenCapture, getScreenMetadata } from './hooks/useScreenCapture';
import { useTutor } from './hooks/useTutor';
import { useChatHistory } from './hooks/useChatHistory';
import {
  buildNarrationSteps,
  canOpenGettingStartedFromHelp,
  estimateStepDurationMs,
  nextStatusAfterDismiss,
  nextStatusAfterGetStarted,
  shouldAutoShowOnboarding,
  shouldDeferOnboardingAutoShow,
  shouldMarkDismissOnWelcomeMinimize,
  type OnboardingStatus,
} from '@screentutor/shared';
import { transcriptionProvider } from './api/transcription';
import { playSilently, ttsProvider, type NarrationHandlers } from './api/tts';
import { performanceTracker } from './sentry';
import { PANEL_WIDTH, PANEL_HEIGHT, COLLAPSED_SIZE, MENU_WINDOW_SIZE } from './panelLayout';
import type { StoredExplanation } from './types/explanation';
import {
  hasAttemptedSessionAutoShow,
  loadOnboardingRecord,
  markSessionAutoShowAttempted,
  resetOnboardingPreference,
  saveOnboardingStatus,
} from './onboardingStorage';

type BuddyState = 'idle' | 'listening' | 'thinking' | 'responding' | 'pointing' | 'error' | 'privacy';

/** How long the panel takes to shrink back into the launcher (matches .panel-motion.is-closing) */
const PANEL_EXIT_MS = 200;

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
type PanelView = 'chat' | 'welcome';

export default function App() {
  const [buddyState, setBuddyState] = useState<BuddyState>('idle');
  const [isPanelExpanded, setIsPanelExpanded] = useState(false);
  const [panelView, setPanelView] = useState<PanelView>('chat');
  /** The panel is playing its closing animation; the window shrinks once it ends. */
  const [isPanelClosing, setIsPanelClosing] = useState(false);
  /** Where the panel grows from and shrinks into: the launcher, in panel coordinates. */
  const [panelOrigin, setPanelOrigin] = useState('100% 100%');
  const [welcomeFromHelp, setWelcomeFromHelp] = useState(false);
  const [onboardingStatus, setOnboardingStatus] = useState<OnboardingStatus>(
    () => loadOnboardingRecord().status
  );
  const [commandMenuOpen, setCommandMenuOpen] = useState(false);
  const [canvasControlsOpen, setCanvasControlsOpen] = useState(false);
  const [focusInputToken, setFocusInputToken] = useState(0);
  const [question, setQuestion] = useState('');
  const [isRecordingVoice, setIsRecordingVoice] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [revealedSpokenText, setRevealedSpokenText] = useState('');
  const [responseDelivered, setResponseDelivered] = useState(false);
  const [isMuted, setIsMuted] = useState(() => {
    return localStorage.getItem('screentutor_muted') === 'true';
  });
  const [activeLessonId, setActiveLessonId] = useState<string | undefined>(undefined);

  const { screenshot, pendingRegion, screenshotForQuestion, clearScreenshot, startRegionSelect, isSelectingRegion } =
    useScreenCapture();
  const screenshotForQuestionRef = useRef(screenshotForQuestion);
  screenshotForQuestionRef.current = screenshotForQuestion;
  const { askQuestion, response, isLoading, isStreaming, isResponseReady, error, clearResponse } = useTutor();
  const {
    turns: chatTurns,
    activeTurnId,
    startTurn,
    resetTurns,
    failActiveTurn,
    syncActiveTurn,
    updateTurnExplanation,
    setTurnExplanation,
  } = useChatHistory();
  const [isScanning, setIsScanning] = useState(false);

  const activeLessonIdRef = useRef(activeLessonId);
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
  /** Cancels a muted (timer-paced) narration, if one is running. */
  const silentNarrationRef = useRef<(() => void) | null>(null);
  const isMutedRef = useRef(isMuted);
  isMutedRef.current = isMuted;
  /** The chat was tucked away while an answer is explained, and comes back when it ends. */
  const panelHiddenForAnswerRef = useRef(false);
  /** Invalidates in-flight placeTutorPanel / expand work on collapse or rapid re-open. */
  const panelLayoutRequestRef = useRef(0);
  const panelViewRef = useRef<PanelView>(panelView);
  const onboardingStatusRef = useRef(onboardingStatus);
  const wasExpandedBeforeWelcomeRef = useRef(false);
  const isLoadingRef = useRef(isLoading);
  const isStreamingRef = useRef(isStreaming);
  const isSpeakingRef = useRef(isSpeaking);
  const isScanningRef = useRef(isScanning);
  const isSelectingRegionRef = useRef(isSelectingRegion);
  const chatTurnsRef = useRef(chatTurns);

  useEffect(() => {
    activeLessonIdRef.current = activeLessonId;
    screenshotRef.current = screenshot;
    isRecordingRef.current = isRecordingVoice;
    isPanelExpandedRef.current = isPanelExpanded;
    activeTurnIdRef.current = activeTurnId;
    panelViewRef.current = panelView;
    onboardingStatusRef.current = onboardingStatus;
    isLoadingRef.current = isLoading;
    isStreamingRef.current = isStreaming;
    isSpeakingRef.current = isSpeaking;
    isScanningRef.current = isScanning;
    isSelectingRegionRef.current = isSelectingRegion;
    chatTurnsRef.current = chatTurns;
  }, [
    activeLessonId,
    screenshot,
    isRecordingVoice,
    isPanelExpanded,
    activeTurnId,
    panelView,
    onboardingStatus,
    isLoading,
    isStreaming,
    isSpeaking,
    isScanning,
    isSelectingRegion,
    chatTurns,
  ]);

  useEffect(() => {
    // Dev-only helper (electron-vite localhost). Never expose in packaged builds.
    if (typeof window === 'undefined') return;
    const host = window.location?.hostname;
    const isDevRenderer = host === 'localhost' || host === '127.0.0.1';
    if (!isDevRenderer) return;
    const w = window as Window & { __quickyResetOnboarding?: () => void };
    w.__quickyResetOnboarding = () => {
      resetOnboardingPreference();
      setOnboardingStatus('never');
      console.info(
        '[Quicky.AI] Onboarding keys only were reset (mute and other prefs preserved). Reload to see welcome.'
      );
    };
    return () => {
      delete w.__quickyResetOnboarding;
    };
  }, []);

  const getBusyFlags = useCallback(() => {
    const active = chatTurnsRef.current.find((t) => t.id === activeTurnIdRef.current);
    const isConversationBusy = active != null && !['done', 'error'].includes(active.aiPhase);
    return {
      isRecordingVoice: isRecordingRef.current,
      isSelectingRegion: isSelectingRegionRef.current,
      isLoading: isLoadingRef.current,
      isStreaming: isStreamingRef.current,
      isSpeaking: isSpeakingRef.current,
      isScanning: isScanningRef.current,
      isConversationBusy,
    };
  }, []);

  const expandPanelRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    if (screenshot?.isRegionCapture && screenshot.base64 && !isPanelExpandedRef.current) {
      void expandPanelRef.current();
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
      const ms = Math.max(2500, text.split('\n').reduce((sum, line) => sum + estimateStepDurationMs(line), 0));
      const timer = setTimeout(() => setResponseDelivered(true), ms);
      return () => clearTimeout(timer);
    }

    const fallback = setTimeout(() => setResponseDelivered(true), 8000);
    return () => clearTimeout(fallback);
  }, [isResponseReady, isSpeaking, isMuted, response]);

  const commandMenuOpenRef = useRef(commandMenuOpen);
  const canvasControlsOpenRef = useRef(canvasControlsOpen);
  commandMenuOpenRef.current = commandMenuOpen;
  canvasControlsOpenRef.current = canvasControlsOpen;

  const resizeBuddyAtAnchor = (width: number, height: number) => {
    window.electronAPI.setIgnoreMouseEvents(false);
    if (typeof window.electronAPI.setMainSizeAtAnchor === 'function') {
      window.electronAPI.setMainSizeAtAnchor(width, height);
    } else {
      window.electronAPI.setMainSize(width, height);
    }
  };

  const expandPanel = async () => {
    panelHiddenForAnswerRef.current = false;
    const requestId = ++panelLayoutRequestRef.current;
    setCommandMenuOpen(false);
    setCanvasControlsOpen(false);
    commandMenuOpenRef.current = false;
    canvasControlsOpenRef.current = false;
    window.electronAPI.setIgnoreMouseEvents(false);

    // Apply final buddy bounds before mounting the panel — avoids a corner flash.
    if (typeof window.electronAPI.placeTutorPanel === 'function') {
      const placed = await window.electronAPI.placeTutorPanel({
        width: PANEL_WIDTH,
        height: PANEL_HEIGHT,
        requestId,
      });
      if (requestId !== panelLayoutRequestRef.current) return;
      if (!placed?.bounds) {
        // Fallback path if placement IPC fails.
        window.electronAPI.setMainSize(PANEL_WIDTH, PANEL_HEIGHT);
      } else if (placed.anchor) {
        const { bounds, anchor } = placed;
        const ox = Math.max(0, Math.min(bounds.width, anchor.cx - bounds.x));
        const oy = Math.max(0, Math.min(bounds.height, anchor.cy - bounds.y));
        setPanelOrigin(`${Math.round(ox)}px ${Math.round(oy)}px`);
      }
    } else {
      window.electronAPI.setMainSize(PANEL_WIDTH, PANEL_HEIGHT);
    }

    if (requestId !== panelLayoutRequestRef.current) return;
    isPanelExpandedRef.current = true;
    setIsPanelClosing(false);
    setIsPanelExpanded(true);
  };
  expandPanelRef.current = expandPanel;

  /**
   * Shrink the panel back into the launcher, then the window. Resolves once the
   * window is launcher-sized again (e.g. before a screenshot is taken).
   */
  const collapsePanel = (): Promise<void> => {
    // Cancel any in-flight expand so a late placeTutorPanel cannot resize after collapse
    // (and an expand during the closing animation cancels this collapse).
    const requestId = ++panelLayoutRequestRef.current;
    const wasOpen = isPanelExpandedRef.current;
    if (isRecordingRef.current) {
      transcriptionProvider.stopSession().catch(console.error);
      voiceSessionRef.current = 'idle';
      pendingStopRef.current = false;
      setIsRecordingVoice(false);
      holdDictationRef.current = false;
      window.electronAPI.setDictationGlow(false);
    }
    isPanelExpandedRef.current = false;
    setCommandMenuOpen(false);
    setCanvasControlsOpen(false);
    commandMenuOpenRef.current = false;
    canvasControlsOpenRef.current = false;

    const finish = () => {
      if (requestId !== panelLayoutRequestRef.current) return;
      setIsPanelClosing(false);
      setIsPanelExpanded(false);
      // Restore the user-chosen launcher position (panel drag must not change this).
      resizeBuddyAtAnchor(COLLAPSED_SIZE, COLLAPSED_SIZE);
    };
    if (!wasOpen || prefersReducedMotion()) {
      finish();
      return Promise.resolve();
    }
    setIsPanelClosing(true);
    return new Promise((resolve) =>
      setTimeout(() => {
        finish();
        resolve();
      }, PANEL_EXIT_MS)
    );
  };

  const persistOnboardingStatus = (status: OnboardingStatus) => {
    saveOnboardingStatus(status);
    onboardingStatusRef.current = status;
    setOnboardingStatus(status);
  };

  const openWelcome = async (fromHelp: boolean) => {
    if (panelViewRef.current === 'welcome') return;
    wasExpandedBeforeWelcomeRef.current = isPanelExpandedRef.current;
    setWelcomeFromHelp(fromHelp);
    setPanelView('welcome');
    panelViewRef.current = 'welcome';
    console.info(`[Quicky.AI] Welcome onboarding (${fromHelp ? 'help' : 'first-launch'})`);
    if (!isPanelExpandedRef.current) {
      await expandPanel();
    }
  };

  const handleWelcomeGetStarted = () => {
    const next = nextStatusAfterGetStarted(onboardingStatusRef.current);
    persistOnboardingStatus(next);
    setWelcomeFromHelp(false);
    setPanelView('chat');
    panelViewRef.current = 'chat';
    // Stay expanded — enter real Text composer and focus it.
    if (!isPanelExpandedRef.current) {
      void expandPanel().then(() => {
        if (isPanelExpandedRef.current) setFocusInputToken((n) => n + 1);
      });
    } else {
      setFocusInputToken((n) => n + 1);
    }
  };

  const handleWelcomeDismiss = (options?: { fromMinimize?: boolean }) => {
    const current = onboardingStatusRef.current;
    // Explicit first-run dismissal (Not now or minimize) so the guide does not reappear.
    if (current === 'never' || (options?.fromMinimize && shouldMarkDismissOnWelcomeMinimize(current))) {
      persistOnboardingStatus(nextStatusAfterDismiss(current));
    }

    const restoreExpanded = welcomeFromHelp && wasExpandedBeforeWelcomeRef.current && !options?.fromMinimize;
    setWelcomeFromHelp(false);
    setPanelView('chat');
    panelViewRef.current = 'chat';

    if (!restoreExpanded) {
      collapsePanel();
    }
    // Help reopen while chat was already open — return to chat, keep draft/history.
  };

  const handlePanelClose = () => {
    if (panelViewRef.current === 'welcome') {
      handleWelcomeDismiss({ fromMinimize: true });
      return;
    }
    collapsePanel();
  };

  // First-launch auto welcome (once per session; deferred while tutoring is busy).
  useEffect(() => {
    if (!shouldAutoShowOnboarding(onboardingStatus)) return;
    if (hasAttemptedSessionAutoShow()) return;
    if (panelView === 'welcome') return;
    if (shouldDeferOnboardingAutoShow(getBusyFlags())) return;

    markSessionAutoShowAttempted();
    void openWelcome(false);
  }, [
    onboardingStatus,
    panelView,
    isRecordingVoice,
    isSelectingRegion,
    isLoading,
    isStreaming,
    isSpeaking,
    isScanning,
    chatTurns,
    activeTurnId,
    getBusyFlags,
  ]);

  // Help → Getting Started (listener registered once; handlers read current refs).
  useEffect(() => {
    if (typeof window.electronAPI?.onOpenGettingStarted !== 'function') return;
    window.electronAPI.onOpenGettingStarted(() => {
      if (panelViewRef.current === 'welcome') return;
      if (!canOpenGettingStartedFromHelp(getBusyFlags())) {
        console.info('[Quicky.AI] Getting Started deferred — tutoring is active.');
        return;
      }
      void openWelcome(true);
    });
  }, [getBusyFlags]);

  /**
   * Canvas sheet still uses a square overlay window.
   * Command menu bounds are set by FloatingLauncher via setMainBounds (arc-aware)
   * so we must not overwrite them with a centered square here.
   */
  useEffect(() => {
    if (isPanelExpanded) return;
    if (commandMenuOpen) return;
    if (canvasControlsOpen) {
      resizeBuddyAtAnchor(MENU_WINDOW_SIZE, MENU_WINDOW_SIZE);
    }
  }, [commandMenuOpen, canvasControlsOpen, isPanelExpanded]);

  const handleMenuExitComplete = () => {
    if (isPanelExpandedRef.current) return;
    if (commandMenuOpenRef.current || canvasControlsOpenRef.current) return;
    resizeBuddyAtAnchor(COLLAPSED_SIZE, COLLAPSED_SIZE);
  };

  const handleMenuOpenChange = (open: boolean) => {
    setCommandMenuOpen(open);
  };

  const startVoiceRecording = async (options?: { showGlow?: boolean; fromHoldHotkey?: boolean }) => {
    if (voiceSessionRef.current !== 'idle') return;

    const isPrivacy = await window.electronAPI.getPrivacyMode();
    if (isPrivacy) {
      setBuddyState('privacy');
      return;
    }

    // Permission request is deliberate and Voice-only (never at startup / onboarding).
    try {
      const status =
        typeof window.electronAPI.ensureMicrophoneAccess === 'function'
          ? await window.electronAPI.ensureMicrophoneAccess()
          : await window.electronAPI.getPermissionStatus();
      if (status.microphone === 'denied' || status.microphone === 'restricted') {
        console.warn('[Quicky.AI] Microphone permission denied — voice not started');
        setBuddyState('error');
        return;
      }
    } catch (err) {
      console.error('Microphone permission check failed:', err);
      setBuddyState('error');
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
        startTurn(transcript.trim());
        await hidePanelForAnswer();
        if (!wasHoldDictation) {
          // Open the chat after the explanation, not on top of it.
          panelHiddenForAnswerRef.current = true;
        }
        setIsScanning(true);
        let capBase64: string | undefined;
        let capMeta: ReturnType<typeof getScreenMetadata> | undefined;
        if (!activeLessonIdRef.current) {
          await clearPreviousAnswer();
          const capData = await screenshotForQuestionRef.current();
          setIsScanning(false);
          if (!capData) {
            failActiveTurn('Screen capture was blocked or unavailable.');
            setBuddyState('privacy');
            restorePanelAfterAnswer();
            return;
          }
          capBase64 = capData.base64;
          capMeta = getScreenMetadata(capData);
        } else {
          setIsScanning(false);
        }

        const devOverride = localStorage.getItem('screentutor_dev_override_redaction') === 'true';
        const res = await askQuestion(transcript, capBase64, capMeta, activeLessonIdRef.current, devOverride);
        setBuddyState(res ? 'responding' : 'error');
        if (!res) restorePanelAfterAnswer();
      } else {
        setBuddyState('idle');
      }
    } catch (err) {
      console.error('Failed to stop/transcribe recording:', err);
      setBuddyState('error');
      setIsScanning(false);
      restorePanelAfterAnswer();
    }
  };

  startVoiceRecordingRef.current = startVoiceRecording;
  stopVoiceRecordingRef.current = stopVoiceRecordingAndSubmit;

  useEffect(() => {
    // Skip when Vite serves this module outside Electron (e.g. IDE browser on :5173).
    if (typeof window.electronAPI?.setIgnoreMouseEvents !== 'function') return;

    window.electronAPI.setIgnoreMouseEvents(false);
    if (typeof window.electronAPI.setMainSizeAtAnchor === 'function') {
      window.electronAPI.setMainSizeAtAnchor(COLLAPSED_SIZE, COLLAPSED_SIZE);
    } else {
      window.electronAPI.setMainSize(COLLAPSED_SIZE, COLLAPSED_SIZE);
    }

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
    if (typeof window.electronAPI?.onExplanationReady !== 'function') return;

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

  /** Take the previous answer's drawings off screen so they aren't in the new question's screenshot. */
  const clearPreviousAnswer = async () => {
    window.electronAPI.clearOverlay();
    await new Promise((resolve) => setTimeout(resolve, 120)); // let the cleared overlay reach the screen
  };

  /** Tuck the chat away so the learner's attention is on the explanation (and it stays out of the screenshot). */
  const hidePanelForAnswer = async () => {
    if (!isPanelExpandedRef.current || panelViewRef.current !== 'chat') return;
    panelHiddenForAnswerRef.current = true;
    await collapsePanel();
  };

  /** Bring the chat back once the explanation is over, or the question failed. */
  const restorePanelAfterAnswer = () => {
    if (!panelHiddenForAnswerRef.current) return;
    panelHiddenForAnswerRef.current = false;
    if (!isPanelExpandedRef.current) void expandPanel();
  };

  const stopNarration = () => {
    silentNarrationRef.current?.();
    silentNarrationRef.current = null;
    ttsProvider.stop();
  };

  const finishSyncedNarration = (spoken: string) => {
    silentNarrationRef.current = null;
    window.electronAPI.finishOverlayNarration();
    setRevealedSpokenText(spoken);
    restorePanelAfterAnswer();
  };

  // One clock for everything: the voice. Each step's pointer, drawings and chat
  // text appear when that step actually starts being heard, so they can't drift.
  useEffect(() => {
    if (!response || isStreaming || !isResponseReady) return;

    const spoken = response.spokenText || response.spokenExplanation || '';
    const overlayText = response.overlayText || response.visualText || '';
    if (!spoken) {
      restorePanelAfterAnswer();
      return;
    }

    const steps = buildNarrationSteps(spoken, overlayText).map((step) => step.spoken);
    setRevealedSpokenText('');
    window.electronAPI.startOverlayNarration({
      spokenText: spoken,
      overlayText,
      captureRegion: screenshotRef.current?.captureRegion ?? null,
    });

    const onStep = (index: number) => {
      window.electronAPI.overlayNarrationStep(index);
      setRevealedSpokenText(steps.slice(0, index + 1).filter(Boolean).join('\n'));
    };

    if (isMutedRef.current) {
      silentNarrationRef.current = playSilently(steps, estimateStepDurationMs, {
        onStep,
        onEnd: () => finishSyncedNarration(spoken),
      });
    } else {
      const handlers: NarrationHandlers = {
        onStart: () => setIsSpeaking(true),
        onStep,
        onEnd: () => {
          finishSyncedNarration(spoken);
          setIsSpeaking(false);
        },
      };
      ttsProvider.speakSteps(steps, handlers);
    }

    return () => stopNarration();
  }, [response, isStreaming, isResponseReady]);

  // Muting mid-answer stops the voice and shows the rest of the explanation at once.
  useEffect(() => {
    if (!isMuted || !ttsProvider.isSpeaking()) return;
    ttsProvider.stop();
    setIsSpeaking(false);
    finishSyncedNarration(response?.spokenText || response?.spokenExplanation || '');
  }, [isMuted]);

  useEffect(() => {
    if (!isStreaming && !response) {
      stopNarration();
      setIsSpeaking(false);
      setRevealedSpokenText('');
      window.electronAPI.finishOverlayNarration();
    }
  }, [response, isStreaming]);

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
    stopNarration();
    setIsSpeaking(false);
    setRevealedSpokenText('');
    window.electronAPI.finishOverlayNarration();
    setBuddyState('thinking');
    try {
      await hidePanelForAnswer();
      setIsScanning(true);
      let capBase64: string | undefined;
      let capMeta: ReturnType<typeof getScreenMetadata> | undefined;
      if (!activeLessonId) {
        await clearPreviousAnswer();
        performanceTracker.startSpan('listening_to_screenshot');
        const capData = await screenshotForQuestion();
        performanceTracker.endSpan('listening_to_screenshot');
        setIsScanning(false);

        if (!capData) {
          failActiveTurn('Screen capture was blocked or unavailable.');
          setBuddyState('privacy');
          restorePanelAfterAnswer();
          performanceTracker.endSpan('total_interaction_latency');
          return;
        }
        capBase64 = capData.base64;
        capMeta = getScreenMetadata(capData);
      } else {
        setIsScanning(false);
      }

      const devOverride = localStorage.getItem('screentutor_dev_override_redaction') === 'true';
      const res = await askQuestion(questionText, capBase64, capMeta, activeLessonId, devOverride);
      setBuddyState(res ? 'responding' : 'error');
      if (!res) restorePanelAfterAnswer();
      performanceTracker.endSpan('total_interaction_latency');
    } catch {
      setBuddyState('error');
      setIsScanning(false);
      restorePanelAfterAnswer();
      performanceTracker.endSpan('total_interaction_latency');
    }
  };

  const handleStartRegionSelect = async () => {
    commandMenuOpenRef.current = false;
    canvasControlsOpenRef.current = false;
    setCommandMenuOpen(false);
    setCanvasControlsOpen(false);
    if (isPanelExpandedRef.current) {
      collapsePanel();
    }
    await startRegionSelect();
  };

  const handleClearRegion = () => {
    clearScreenshot();
  };

  const handleMenuVoice = () => {
    setCommandMenuOpen(false);
    setCanvasControlsOpen(false);
    setPanelView('chat');
    panelViewRef.current = 'chat';
    // Open the tutor panel so the existing hold-to-talk mic remains the recording UX.
    void expandPanel();
  };

  const handleMenuCapture = async () => {
    await handleStartRegionSelect();
  };

  const handleMenuText = () => {
    setCommandMenuOpen(false);
    setCanvasControlsOpen(false);
    // Text always enters the real composer (never the welcome sheet).
    setPanelView('chat');
    panelViewRef.current = 'chat';
    void expandPanel().then(() => {
      if (isPanelExpandedRef.current) {
        setFocusInputToken((n) => n + 1);
      }
    });
  };

  const handleMenuCanvas = () => {
    commandMenuOpenRef.current = false;
    canvasControlsOpenRef.current = true;
    setCommandMenuOpen(false);
    setCanvasControlsOpen(true);
  };

  const handleDemoReset = async () => {
    window.electronAPI.clearOverlay();
    clearResponse();
    clearScreenshot();
    resetTurns();
    setActiveLessonId('calculus_u_sub');
    setQuestion('');

    try {
      await fetch('http://localhost:4317/api/memory/user_123', { method: 'DELETE' });
    } catch (err) {
      console.error('Failed to clear user memory on demo reset:', err);
    }

    setBuddyState('idle');
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
      void expandPanel();
    }
  };

  return (
    <div className={`app-container ${isPanelExpanded ? 'expanded' : 'collapsed'}`}>
      {isPanelExpanded && (
        <div
          className={`panel-motion${isPanelClosing ? ' is-closing' : ''}`}
          style={
            {
              '--panel-origin': panelOrigin,
              '--panel-exit-ms': `${PANEL_EXIT_MS}ms`,
            } as CSSProperties
          }
        >
          {panelView === 'welcome' && (
            <WelcomeOnboarding
              onGetStarted={handleWelcomeGetStarted}
              onDismiss={() => handleWelcomeDismiss()}
              openedFromHelp={welcomeFromHelp}
            />
          )}
          {panelView === 'chat' && (
            <ChatPanel
              screenshot={screenshot}
              onClose={handlePanelClose}
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
              isRegionCapture={!!pendingRegion}
              isSelectingRegion={isSelectingRegion}
              onStartRegionSelect={handleStartRegionSelect}
              onClearRegion={handleClearRegion}
              focusInputToken={focusInputToken}
            />
          )}
        </div>
      )}
      <FloatingLauncher
        state={buddyState}
        isExpanded={isPanelExpanded}
        isRecordingVoice={isRecordingVoice}
        isSpeaking={isSpeaking}
        menuOpen={commandMenuOpen}
        onMenuOpenChange={handleMenuOpenChange}
        onMenuExitComplete={handleMenuExitComplete}
        onCollapsePanel={handlePanelClose}
        onVoice={handleMenuVoice}
        onCapture={handleMenuCapture}
        onText={handleMenuText}
        onCanvas={handleMenuCanvas}
        canvasControlsOpen={canvasControlsOpen}
        onCanvasControlsClose={() => {
          setCanvasControlsOpen(false);
          if (!commandMenuOpenRef.current && !isPanelExpandedRef.current) {
            resizeBuddyAtAnchor(COLLAPSED_SIZE, COLLAPSED_SIZE);
          }
        }}
        onClearAnnotations={() => window.electronAPI.clearOverlay()}
      />
    </div>
  );
}
