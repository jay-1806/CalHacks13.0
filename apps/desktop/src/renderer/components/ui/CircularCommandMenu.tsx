import { useEffect, useState, type ReactNode, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { getRadialOffsets, type ArcItemPosition, type LabelSide } from '../../launcherGeometry';
import './CircularCommandMenu.css';

export interface CommandItem {
  id: string;
  icon: ReactNode;
  label: string;
  shortcut?: string;
  onClick?: () => void;
}

export interface CircularCommandMenuProps {
  open: boolean;
  items: CommandItem[];
  positions?: ArcItemPosition[];
  radius?: number;
  onSelect?: (item: CommandItem) => void;
  onRequestClose?: () => void;
  onExitComplete?: () => void;
  labelledBy?: string;
}

export { getRadialOffsets } from '../../launcherGeometry';

const MENU_SPRING = {
  type: 'spring' as const,
  stiffness: 360,
  damping: 34,
  mass: 0.75,
};

const EXIT_TWEEN = {
  type: 'tween' as const,
  duration: 0.18,
  ease: [0.32, 0.72, 0, 1] as const,
};

const STAGGER_S = 0.015;

/**
 * Quicky.AI frosted command actions — PLUS or fan layout.
 * Parent owns Electron bounds lifecycle; this component only animates items.
 */
export default function CircularCommandMenu({
  open,
  items,
  positions: positionsProp,
  radius = 120,
  onSelect,
  onRequestClose,
  onExitComplete,
  labelledBy,
}: CircularCommandMenuProps) {
  const reduceMotion = useReducedMotion();
  const [activeIndex, setActiveIndex] = useState(0);

  const offsets: ArcItemPosition[] =
    positionsProp && positionsProp.length === items.length
      ? positionsProp
      : getRadialOffsets(items.length, radius).map((p) => ({
          ...p,
          angle: Math.atan2(p.y, p.x),
        }));

  useEffect(() => {
    if (open) {
      setActiveIndex(0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('input, textarea, [contenteditable="true"]')) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        onRequestClose?.();
        return;
      }

      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((i) => (i + 1) % items.length);
        return;
      }

      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((i) => (i - 1 + items.length) % items.length);
        return;
      }

      if (event.key === 'Enter' && items[activeIndex]) {
        event.preventDefault();
        activate(items[activeIndex]);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, items, activeIndex, onRequestClose]);

  const activate = (item: CommandItem) => {
    onSelect?.(item);
  };

  const enterTransition = reduceMotion
    ? { type: 'tween' as const, duration: 0.01 }
    : MENU_SPRING;

  const exitTransition = reduceMotion
    ? { type: 'tween' as const, duration: 0.01 }
    : EXIT_TWEEN;

  return (
    <div
      className="quicke-cmd-menu"
      role="menu"
      aria-labelledby={labelledBy}
      aria-hidden={!open}
    >
      <AnimatePresence onExitComplete={onExitComplete}>
        {open &&
          items.map((item, index) => {
            const offset = offsets[index] ?? {
              x: 0,
              y: 0,
              angle: 0,
              label: 'below' as LabelSide,
            };
            const { x, y } = offset;
            const selected = index === activeIndex;
            const stagger = reduceMotion ? 0 : index * STAGGER_S;
            return (
              <motion.button
                key={item.id}
                type="button"
                role="menuitem"
                className={`quicke-cmd-item ${selected ? 'is-selected' : ''}`}
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.78, x: 0, y: 0 }}
                animate={{ opacity: 1, scale: 1, x, y }}
                exit={
                  reduceMotion
                    ? { opacity: 0, transition: exitTransition }
                    : {
                        opacity: 0,
                        scale: 0.78,
                        x: 0,
                        y: 0,
                        transition: exitTransition,
                      }
                }
                transition={{ ...enterTransition, delay: stagger }}
                whileHover={reduceMotion ? undefined : { scale: 1.06 }}
                whileTap={reduceMotion ? undefined : { scale: 0.96 }}
                aria-label={item.label}
                onMouseEnter={() => setActiveIndex(index)}
                onFocus={() => setActiveIndex(index)}
                onKeyDown={(event: ReactKeyboardEvent) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    activate(item);
                  }
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  activate(item);
                }}
              >
                <span className="quicke-cmd-item__icon" aria-hidden="true">
                  {item.icon}
                </span>
              </motion.button>
            );
          })}
      </AnimatePresence>
    </div>
  );
}
