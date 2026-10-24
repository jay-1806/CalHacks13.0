import { useEffect, useRef, useState } from 'react';
import {
  ShaderMount,
  liquidMetalFragmentShader,
  LiquidMetalShapes,
  ShaderFitOptions,
  getShaderColorFromString,
  emptyPixel,
  defaultObjectSizing,
} from '@paper-design/shaders';
import './LiquidMetalButton.css';

const SIZE_PX = 54;
/** Idle metal flow must be clearly alive without looking frantic. */
const IDLE_SPEED = 0.78;
const HOVER_SPEED = 1.15;
const PRESS_SPEED = 1.4;

export interface LiquidMetalButtonProps {
  /** Extra class names applied to the outer visual shell (not a nested button). */
  className?: string;
  /** When true, brighten the silver rim slightly (listening / thinking / speaking). */
  showActivity?: boolean;
  /** Compact size when the buddy panel is expanded. */
  compact?: boolean;
}

/**
 * Quicky.AI liquid-metal disc. Visual-only — the parent `FloatingLauncher` owns
 * the single `<button>` so we never nest interactive controls.
 */
export default function LiquidMetalButton({
  className = '',
  showActivity = false,
  compact = false,
}: LiquidMetalButtonProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<ShaderMount | null>(null);
  const [shaderFailed, setShaderFailed] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  const size = compact ? 50 : SIZE_PX;

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReducedMotion(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || reducedMotion) {
      mountRef.current?.dispose();
      mountRef.current = null;
      return;
    }

    let cancelled = false;
    const placeholder = new Image();
    placeholder.src = emptyPixel;

    const start = () => {
      if (cancelled || !hostRef.current) return;

      try {
        mountRef.current?.dispose();
        mountRef.current = null;

        const { fit, rotation, offsetX, offsetY, originX, originY, worldWidth, worldHeight } =
          defaultObjectSizing;

        const mount = new ShaderMount(
          hostRef.current,
          liquidMetalFragmentShader,
          {
            u_image: placeholder,
            u_isImage: false,
            u_shape: LiquidMetalShapes.circle,
            u_colorBack: getShaderColorFromString('#AAAAAC'),
            u_colorTint: getShaderColorFromString('#ffffff'),
            u_repetition: 2.4,
            u_softness: 0.18,
            u_distortion: 0.06,
            u_contour: 0.35,
            u_shiftRed: 0.22,
            u_shiftBlue: 0.22,
            u_angle: 70,
            u_fit: ShaderFitOptions[fit],
            u_scale: 0.92,
            u_rotation: rotation,
            u_offsetX: offsetX,
            u_offsetY: offsetY,
            u_originX: originX,
            u_originY: originY,
            u_worldWidth: worldWidth,
            u_worldHeight: worldHeight,
          },
          { alpha: true, antialias: true, premultipliedAlpha: true },
          IDLE_SPEED,
          undefined,
          2,
          undefined,
          ['u_image']
        );

        if (cancelled) {
          mount.dispose();
          return;
        }

        mount.setSpeed(IDLE_SPEED);
        mountRef.current = mount;
        setShaderFailed(false);
      } catch (err) {
        console.error('[Quicky.AI] Liquid metal shader failed to initialize:', err);
        setShaderFailed(true);
        mountRef.current = null;
      }
    };

    if (placeholder.complete) start();
    else placeholder.addEventListener('load', start, { once: true });

    return () => {
      cancelled = true;
      placeholder.removeEventListener('load', start);
      mountRef.current?.dispose();
      mountRef.current = null;
    };
  }, [reducedMotion]);

  const setSpeed = (speed: number) => {
    if (reducedMotion || shaderFailed) return;
    mountRef.current?.setSpeed(speed);
  };

  const useFallback = shaderFailed || reducedMotion;

  return (
    <span
      className={`quicke-liquid-metal ${useFallback ? 'is-fallback' : ''} ${showActivity ? 'is-active' : ''} ${className}`}
      style={{ width: size, height: size }}
      onMouseEnter={() => setSpeed(HOVER_SPEED)}
      onMouseLeave={() => setSpeed(IDLE_SPEED)}
      onMouseDown={() => setSpeed(PRESS_SPEED)}
      onMouseUp={() => setSpeed(HOVER_SPEED)}
      aria-hidden="true"
    >
      <span className="quicke-liquid-metal__rim" />
      {!useFallback && <div ref={hostRef} className="quicke-liquid-metal__shader" />}
      {useFallback && <span className="quicke-liquid-metal__fallback" />}
      <span className="quicke-liquid-metal__glyph">
        <svg viewBox="0 0 24 24" width="42%" height="42%" aria-hidden="true">
          <circle cx="12" cy="12" r="7.25" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path
            d="M14.6 14.6 17.2 17.2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <circle cx="12" cy="12" r="2.1" fill="currentColor" opacity="0.85" />
        </svg>
      </span>
    </span>
  );
}
