import { useEffect, useId, useRef } from 'react';
import { PRODUCT_DISPLAY_NAME } from '@screentutor/shared';
import TutorCursorIcon from './TutorCursorIcon';
import './WelcomeOnboarding.css';

interface Props {
  onGetStarted: () => void;
  onDismiss: () => void;
  /** When true, Escape returns without collapsing the whole app shell. */
  openedFromHelp?: boolean;
}

function ClickGuideIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 9V5.5a1.5 1.5 0 0 1 3 0V11" />
      <path d="M13 11V9.5a1.5 1.5 0 0 1 3 0V12" />
      <path d="M16 12v-1a1.5 1.5 0 0 1 3 0v3.5a5 5 0 0 1-5 5h-1.2a5 5 0 0 1-3.6-1.5L7 14.5" />
      <path d="M7 14.5V8.8a1.3 1.3 0 0 1 2.6 0V11" />
    </svg>
  );
}

function AskGuideIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 8.5A3.5 3.5 0 0 1 8.5 5h7A3.5 3.5 0 0 1 19 8.5v3A3.5 3.5 0 0 1 15.5 15H12l-3.2 2.4V15H8.5A3.5 3.5 0 0 1 5 11.5v-3z" />
      <path d="M9 9.2h6M9 12h3.5" />
    </svg>
  );
}

function TeachGuideIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8.5" cy="9" r="2.2" />
      <path d="M11.5 10.5 16 7.5" />
      <path d="M16 7.5h2.5v2" />
      <path d="M6 16.5h12" />
      <path d="M8 16.5v2M12 16.5v2M16 16.5v2" />
    </svg>
  );
}

const STEPS = [
  {
    title: 'Open the floating menu',
    subtitle: 'Click the Liquid Metal button.',
    Icon: ClickGuideIcon,
  },
  {
    title: 'Choose how to ask',
    subtitle: 'Text, Voice, or Capture.',
    Icon: AskGuideIcon,
  },
  {
    title: 'Follow the explanation',
    subtitle: 'See annotations and hear each step.',
    Icon: TeachGuideIcon,
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
          <TutorCursorIcon size={36} className="welcome-onboarding__logo" decorative={false} />
          <div className="welcome-onboarding__brand-text">
            <p className="welcome-onboarding__product">{PRODUCT_DISPLAY_NAME}</p>
            <p className="welcome-onboarding__eyebrow">Getting started</p>
          </div>
        </header>

        <div className="welcome-onboarding__hero">
          <h1 id={titleId} className="welcome-onboarding__title">
            Learn right on your screen.
          </h1>
          <p className="welcome-onboarding__subtitle">Ask. Watch. Understand.</p>
        </div>

        <ol className="welcome-onboarding__steps">
          {STEPS.map(({ title, subtitle, Icon }, index) => (
            <li key={title} className="welcome-onboarding__step">
              <span className="welcome-onboarding__step-icon" aria-hidden="true">
                <Icon />
              </span>
              <div className="welcome-onboarding__step-copy">
                <p className="welcome-onboarding__step-title">
                  <span className="welcome-onboarding__step-index" aria-hidden="true">
                    {index + 1}.
                  </span>{' '}
                  {title}
                </p>
                <p className="welcome-onboarding__step-subtitle">{subtitle}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      <footer className="welcome-onboarding__footer">
        <div className="welcome-onboarding__actions">
          <button
            ref={primaryRef}
            type="button"
            className="welcome-onboarding__btn welcome-onboarding__btn--primary"
            onClick={onGetStarted}
          >
            Get started
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
            : 'Find this guide anytime in Help.'}
        </p>
      </footer>
    </div>
  );
}
