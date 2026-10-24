/** Neutral line icons for the Quicky.AI tutor panel toolbar/composer (no icon package). */

import type { ReactNode } from 'react';

const stroke = {
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 1.9,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...stroke}>
      {children}
    </svg>
  );
}

export function SpeakerIcon() {
  return (
    <Icon>
      <path d="M4 10v4h3l4 3V7L7 10H4z" />
      <path d="M15.5 9.5a3.5 3.5 0 0 1 0 5" />
      <path d="M17.5 7.5a6.5 6.5 0 0 1 0 9" />
    </Icon>
  );
}

export function SpeakerMutedIcon() {
  return (
    <Icon>
      <path d="M4 10v4h3l4 3V7L7 10H4z" />
      <path d="M16 9l4 4M20 9l-4 4" />
    </Icon>
  );
}

export function ClearOverlayIcon() {
  return (
    <Icon>
      <path d="M5 7h14" />
      <path d="M8 7V5.5A1.5 1.5 0 0 1 9.5 4h5A1.5 1.5 0 0 1 16 5.5V7" />
      <path d="M8.5 7l.7 11a1.5 1.5 0 0 0 1.5 1.4h2.6a1.5 1.5 0 0 0 1.5-1.4l.7-11" />
    </Icon>
  );
}

export function RegionIcon() {
  return (
    <Icon>
      <path d="M5 9V6a1 1 0 0 1 1-1h3" />
      <path d="M15 5h3a1 1 0 0 1 1 1v3" />
      <path d="M19 15v3a1 1 0 0 1-1 1h-3" />
      <path d="M9 19H6a1 1 0 0 1-1-1v-3" />
      <rect x="8" y="8" width="8" height="8" rx="1" />
    </Icon>
  );
}

export function RegionActiveIcon() {
  return (
    <Icon>
      <rect x="5" y="5" width="14" height="14" rx="2" />
      <path d="M9 12h6M12 9v6" />
    </Icon>
  );
}

export function ResetIcon() {
  return (
    <Icon>
      <path d="M4.5 12a7.5 7.5 0 1 0 2.1-5.2" />
      <path d="M4.5 5.5v4.2H8.7" />
    </Icon>
  );
}

export function LessonsIcon() {
  return (
    <Icon>
      <path d="M5 6.5A2.5 2.5 0 0 1 7.5 4H19v14H7.5A2.5 2.5 0 0 0 5 20.5V6.5z" />
      <path d="M5 17.5A2.5 2.5 0 0 1 7.5 15H19" />
    </Icon>
  );
}

export function ShieldIcon() {
  return (
    <Icon>
      <path d="M12 3.5l7 2.5v5.2c0 4.2-2.8 7.4-7 9.1-4.2-1.7-7-4.9-7-9.1V6l7-2.5z" />
      <path d="M9.5 12.2l1.8 1.8 3.4-3.6" />
    </Icon>
  );
}

export function MemoryIcon() {
  return (
    <Icon>
      <path d="M9.5 4.5h5" />
      <rect x="5" y="6.5" width="14" height="13" rx="2" />
      <path d="M9 10.5h6M9 14h4" />
    </Icon>
  );
}

export function MinimizeIcon() {
  return (
    <Icon>
      <path d="M6 12h12" />
    </Icon>
  );
}

export function CloseIcon() {
  return (
    <Icon>
      <path d="M7 7l10 10M17 7L7 17" />
    </Icon>
  );
}

export function MicPanelIcon() {
  return (
    <Icon>
      <rect x="9" y="3.5" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
      <path d="M12 18v2.5" />
    </Icon>
  );
}

export function SendIcon() {
  return (
    <Icon>
      <path d="M5 12h12" />
      <path d="M13 7l5 5-5 5" />
    </Icon>
  );
}

export function BookIcon() {
  return (
    <Icon>
      <path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v15.5H7.5A2.5 2.5 0 0 0 5 21V5.5z" />
      <path d="M8.5 8h7M8.5 11.5h5" />
    </Icon>
  );
}

export function EmptyMarkIcon() {
  return (
    <svg viewBox="0 0 48 48" width="36" height="36" aria-hidden="true" fill="none">
      <circle cx="24" cy="24" r="15.5" stroke="currentColor" strokeWidth="1.6" opacity="0.55" />
      <circle cx="24" cy="24" r="5" fill="currentColor" opacity="0.28" />
    </svg>
  );
}

export function SpinnerIcon() {
  return (
    <Icon>
      <path d="M12 4.5a7.5 7.5 0 1 1-6.5 3.8" />
    </Icon>
  );
}

/** Soft pulse mark for in-panel processing status (animated via CSS). */
export function StatusPulseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" className="status-pulse-icon">
      <circle cx="12" cy="12" r="5.5" fill="currentColor" opacity="0.22" className="status-pulse-ring" />
      <circle cx="12" cy="12" r="3.25" fill="currentColor" />
    </svg>
  );
}
