import { describe, it, expect } from 'vitest';
import { parsePointTag } from '@screentutor/shared';

describe('Point-Tag Parser Protocol', () => {
  it('handles [POINT:none]', () => {
    const res = parsePointTag('Check this out [POINT:none]');
    expect(res.spokenText).toBe('Check this out');
    expect(res.pointTarget).toEqual({
      x: null,
      y: null,
      label: '',
      rawTag: '[POINT:none]'
    });
  });

  it('handles [POINT:100,200:button]', () => {
    const res = parsePointTag('Look here [POINT:100,200:button]');
    expect(res.spokenText).toBe('Look here');
    expect(res.pointTarget).toEqual({
      x: 100,
      y: 200,
      label: 'button',
      rawTag: '[POINT:100,200:button]',
      screenNumber: undefined
    });
  });

  it('handles [POINT:100,200:submit button]', () => {
    const res = parsePointTag('Click this [POINT:100,200:submit button]');
    expect(res.spokenText).toBe('Click this');
    expect(res.pointTarget).toEqual({
      x: 100,
      y: 200,
      label: 'submit button',
      rawTag: '[POINT:100,200:submit button]',
      screenNumber: undefined
    });
  });

  it('handles [POINT:100,200:submit button:screen2]', () => {
    const res = parsePointTag('Look at screen two [POINT:100,200:submit button:screen2]');
    expect(res.spokenText).toBe('Look at screen two');
    expect(res.pointTarget).toEqual({
      x: 100,
      y: 200,
      label: 'submit button',
      rawTag: '[POINT:100,200:submit button:screen2]',
      screenNumber: 2
    });
  });

  it('handles malformed tags gracefully', () => {
    // Coords are letters
    const res1 = parsePointTag('Bad tag [POINT:abc,xyz:button] is ignored.');
    expect(res1.spokenText).toBe('Bad tag is ignored.');
    expect(res1.pointTarget.x).toBeNull();
    expect(res1.pointTarget.y).toBeNull();

    // Coords contain a letter
    const res1b = parsePointTag('Bad tag [POINT:100,abc:button] is ignored.');
    expect(res1b.pointTarget.x).toBeNull();
    expect(res1b.pointTarget.y).toBeNull();

    // Incomplete tag
    const res2 = parsePointTag('Unfinished [POINT:100,200 tag.');
    expect(res2.spokenText).toBe('Unfinished [POINT:100,200 tag.');
    expect(res2.pointTarget.x).toBeNull();

    // No label is actually valid coordinates but empty label
    const res3 = parsePointTag('Empty label [POINT:100,200:] here.');
    expect(res3.spokenText).toBe('Empty label here.');
    expect(res3.pointTarget.x).toBe(100);
    expect(res3.pointTarget.y).toBe(200);
    expect(res3.pointTarget.label).toBe('');
  });

  it('handles multiple tags (keeps last valid tag)', () => {
    const res = parsePointTag('First tag [POINT:100,200:first] and second tag [POINT:300,400:second]');
    expect(res.spokenText).toBe('First tag and second tag');
    expect(res.pointTarget).toEqual({
      x: 300,
      y: 400,
      label: 'second',
      rawTag: '[POINT:300,400:second]'
    });
  });

  it('handles no tag', () => {
    const res = parsePointTag('This response contains no tags.');
    expect(res.spokenText).toBe('This response contains no tags.');
    expect(res.pointTarget).toEqual({
      x: null,
      y: null,
      label: '',
      rawTag: '[POINT:none]'
    });
  });
});
