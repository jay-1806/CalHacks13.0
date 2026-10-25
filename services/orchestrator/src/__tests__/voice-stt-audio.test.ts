import { describe, expect, it } from 'vitest';
import {
  float32Peak,
  float32Rms,
  isCartesiaQuotaFailure,
  packPcmF32le,
  parseCartesiaErrorBody,
  resampleFloat32ToPcmS16le,
  shouldUseWebSpeechFallback,
} from '@screentutor/shared';

describe('voice STT audio helpers (Part 6.6.4)', () => {
  it('detects Cartesia quota failures from preflight results', () => {
    expect(
      isCartesiaQuotaFailure({
        ok: false,
        statusCode: 402,
        errorCode: 'quota_exceeded',
        message: 'Model credits limit reached',
      })
    ).toBe(true);
    expect(isCartesiaQuotaFailure({ ok: true })).toBe(false);
    expect(shouldUseWebSpeechFallback({ ok: false, errorCode: 'quota_exceeded' })).toBe(true);
    expect(shouldUseWebSpeechFallback({ ok: true })).toBe(false);
  });

  it('parses Cartesia error bodies without leaking secrets', () => {
    const parsed = parseCartesiaErrorBody(
      JSON.stringify({
        error_code: 'quota_exceeded',
        title: 'Model credits limit reached',
        message: 'Please upgrade your subscription',
      }),
      402
    );
    expect(parsed).toMatchObject({
      ok: false,
      statusCode: 402,
      errorCode: 'quota_exceeded',
    });
    expect(JSON.stringify(parsed)).not.toMatch(/sk_|Bearer |access_token/i);
  });

  it('packs pcm_f32le without changing sample count', () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1, -1, 2, -2]);
    const buf = packPcmF32le(samples);
    const out = new Float32Array(buf);
    expect(out.length).toBe(7);
    expect(out[1]).toBeCloseTo(0.5);
    expect(out[5]).toBe(1);
    expect(out[6]).toBe(-1);
  });

  it('resamples float32 to pcm_s16le at a declared target rate', () => {
    // 8 samples at 16kHz → 4 samples at 8kHz
    const samples = new Float32Array([0, 0.25, 0.5, 0.25, 0, -0.25, -0.5, -0.25]);
    const buf = resampleFloat32ToPcmS16le(samples, 16000, 8000);
    const out = new Int16Array(buf);
    expect(out.length).toBe(4);
    const peak = Math.max(...[...out].map((v) => Math.abs(v)));
    // Input peak 0.5 → int16 peak ~16383
    expect(peak).toBeGreaterThan(10000);
  });

  it('keeps sample-rate agreement when rates match (no time-warp)', () => {
    const samples = new Float32Array([0.1, -0.1, 0.2, -0.2]);
    const same = new Int16Array(resampleFloat32ToPcmS16le(samples, 48000, 48000));
    expect(same.length).toBe(4);
  });

  it('computes rms/peak for non-silent frames', () => {
    const silent = new Float32Array(128);
    const spoken = new Float32Array(128);
    for (let i = 0; i < spoken.length; i++) spoken[i] = i % 2 === 0 ? 0.4 : -0.4;
    expect(float32Rms(silent)).toBe(0);
    expect(float32Peak(silent)).toBe(0);
    expect(float32Rms(spoken)).toBeGreaterThan(0.3);
    expect(float32Peak(spoken)).toBeCloseTo(0.4);
  });
});
