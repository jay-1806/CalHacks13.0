import { useEffect, useId, useRef } from 'react';
import { DEMO_VOICE_MODE, PRODUCT_DISPLAY_NAME } from '@screentutor/shared';
import TutorCursorIcon from './TutorCursorIcon';
import './WelcomeOnboarding.css';

interface Props {
  onGetStarted: () => void;
  onDismiss: () => void;
  /** When true, Escape returns without collapsing the whole app shell. */
  openedFromHelp?: boolean;
}

function SeeIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="5" width="17" height="12.5" rx="2" />
      <path d="M8 20h8" />
      <path d="M12 17.5V20" />
      <circle cx="12" cy="11" r="2.2" />
      <path d="M7.5 11a5.2 5.2 0 0 1 9 0" />
    </svg>
  );
}

function ExplainIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4.5a6.5 6.5 0 0 1 4.2 11.4v2.2H7.8v-2.2A6.5 6.5 0 0 1 12 4.5z" />
      <path d="M10 20.5h4" />
      <path d="M9.5 10.5h5M11 13.5h2" />
    </svg>
  );
}

function GuideIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 4.5 19 12 11.5 14.2 9 20.5z" />
    </svg>
  );
}

const CARDS = [
  {
    eyebrow: 'SEE',
    title: "See what's on your screen",
    subtitle: "Bring Quicky.AI into your workflow and give it context from the problem you're working on.",
    Icon: SeeIcon,
  },
  {
    eyebrow: 'EXPLAIN',
    title: 'Understand the problem',
    subtitle: "Get clear, step-by-step explanations tailored to what's in front of you.",
    Icon: ExplainIcon,
  },
  {
    eyebrow: 'GUIDE',
    title: 'Learn right where you work',
    subtitle: 'Follow visual explanations, narrated steps, and guided on-screen annotations.',
    Icon: GuideIcon,
  },
] as const;

export default function WelcomeOnboarding({ onGetStarted, onDismiss, openedFromHelp = false }: Props) {
  const titleId = useId();
  const primaryRef = useRef<HTMLButtonElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = window.setTimeout(() => primaryRef.current?.focus(), 40);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onDismiss();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onDismiss]);

  return (
    <div
      ref={rootRef}
      className="welcome-onboarding"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="welcome-onboarding__scroll">
        <header className="welcome-onboarding__brand">
          <TutorCursorIcon size={40} className="welcome-onboarding__logo" decorative={false} />
          <div className="welcome-onboarding__brand-text">
            <p className="welcome-onboarding__product">{PRODUCT_DISPLAY_NAME}</p>
            <p className="welcome-onboarding__eyebrow">Welcome</p>
          </div>
        </header>

        <div className="welcome-onboarding__hero">
          <h1 id={titleId} className="welcome-onboarding__title">
            Meet Quicky.AI
          </h1>
          <p className="welcome-onboarding__subtitle">
            Your personal AI tutor, available anywhere on your desktop.
          </p>
        </div>

        <ol className="welcome-onboarding__steps">
          {CARDS.map(({ eyebrow, title, subtitle, Icon }) => (
            <li key={eyebrow} className="welcome-onboarding__step">
              <span className="welcome-onboarding__step-icon" aria-hidden="true">
                <Icon />
              </span>
              <div className="welcome-onboarding__step-copy">
                <p className="welcome-onboarding__step-eyebrow">{eyebrow}</p>
                <p className="welcome-onboarding__step-title">{title}</p>
                <p className="welcome-onboarding__step-subtitle">{subtitle}</p>
              </div>
            </li>
          ))}
        </ol>

        <section className="welcome-onboarding__perms" aria-label="Permissions">
          <p className="welcome-onboarding__perms-title">Permissions when you need them</p>
          <ul className="welcome-onboarding__perms-list">
            <li>
              <strong>Screen access</strong> — Used when you ask Quicky.AI to understand something on
              your screen.
            </li>
            <li>
              <strong>Microphone</strong> —{' '}
              {DEMO_VOICE_MODE
                ? 'Live microphone Voice is available in settings paths; the current Voice action can run a guided demo without listening to your mic.'
                : 'Used only when live microphone Voice mode is enabled and you intentionally start recording.'}
            </li>
          </ul>
        </section>
      </div>

      <footer className="welcome-onboarding__footer">
        <div className="welcome-onboarding__actions">
          <button
            ref={primaryRef}
            type="button"
            className="welcome-onboarding__btn welcome-onboarding__btn--primary"
            onClick={onGetStarted}
          >
            Start Learning
          </button>
          <button
            type="button"
            className="welcome-onboarding__btn welcome-onboarding__btn--secondary"
            onClick={onDismiss}
          >
            Not now
          </button>
        </div>
        <p className="welcome-onboarding__hint">
          {openedFromHelp
            ? 'Press Esc to return to your tutor panel.'
            : 'Your assistant will appear as a floating shortcut.'}
        </p>
      </footer>
    </div>
  );
}
