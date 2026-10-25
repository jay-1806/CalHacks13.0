/**
 * Pure helpers for Quicky.AI Voice STT audio encoding (Part 6.6.4).
 * No DOM / WebSocket dependencies — unit-testable.
 */

/** Cartesia browser-recommended encoding for Web Audio Float32 frames. */
export const CARTESIA_BROWSER_ENCODING = 'pcm_f32le' as const;

export interface SttPreflightResult {
  ok: boolean;
  statusCode?: number;
  errorCode?: string;
  /** Safe, non-secret message suitable for logs / UI. */
  message?: string;
}

/** True when Cartesia rejected the STT socket for billing/quota reasons. */
export function isCartesiaQuotaFailure(result: SttPreflightResult): boolean {
  if (result.errorCode === 'quota_exceeded') return true;
  if (result.statusCode === 402) return true;
  const msg = (result.message || '').toLowerCase();
  return msg.includes('quota') || msg.includes('credit');
}

/**
 * Decide whether to use Cartesia live STT or the local Web Speech fallback.
 * Session mint success alone is NOT enough — the STT socket must be usable.
 */
export function shouldUseWebSpeechFallback(preflight: SttPreflightResult): boolean {
  return !preflight.ok;
}

/**
 * Pack mono Float32 samples as little-endian pcm_f32le bytes (Cartesia browser path).
 * Returns a detached ArrayBuffer suitable for binary WebSocket send.
 */
export function packPcmF32le(samples: Float32Array): ArrayBuffer {
  const out = new Float32Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i]!;
    out[i] = s < -1 ? -1 : s > 1 ? 1 : s;
  }
  return out.buffer;
}

/**
 * Convert mono Float32 at `inputRate` to pcm_s16le at `targetRate` with linear resampling.
 * Used when a 16 kHz integer path is required.
 */
export function resampleFloat32ToPcmS16le(
  samples: Float32Array,
  inputRate: number,
  targetRate: number
): ArrayBuffer {
  if (inputRate <= 0 || targetRate <= 0) {
    return new ArrayBuffer(0);
  }
  if (inputRate === targetRate) {
    const out = new Int16Array(samples.length);
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]!));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out.buffer;
  }

  const ratio = inputRate / targetRate;
  const outLen = Math.max(0, Math.floor(samples.length / ratio));
  const out = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const src = i * ratio;
    const i0 = Math.floor(src);
    const i1 = Math.min(samples.length - 1, i0 + 1);
    const frac = src - i0;
    const a = samples[i0] ?? 0;
    const b = samples[i1] ?? a;
    const sample = a + (b - a) * frac;
    const s = sample < -1 ? -1 : sample > 1 ? 1 : sample;
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out.buffer;
}

/** RMS of a Float32 frame — diagnostic only. */
export function float32Rms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i]!;
    sum += v * v;
  }
  return Math.sqrt(sum / samples.length);
}

/** Peak absolute amplitude. */
export function float32Peak(samples: Float32Array): number {
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.abs(samples[i]!);
    if (a > peak) peak = a;
  }
  return peak;
}

/**
 * Parse a Cartesia HTTP error body from a failed WebSocket upgrade / REST probe.
 * Never returns secrets.
 */
export function parseCartesiaErrorBody(body: string, statusCode?: number): SttPreflightResult {
  try {
    const json = JSON.parse(body) as { error_code?: string; message?: string; title?: string };
    return {
      ok: false,
      statusCode,
      errorCode: json.error_code,
      message: json.title || json.message || `Cartesia STT unavailable (${statusCode ?? 'unknown'})`,
    };
  } catch {
    return {
      ok: false,
      statusCode,
      message: statusCode ? `Cartesia STT unavailable (${statusCode})` : 'Cartesia STT unavailable',
    };
  }
}
