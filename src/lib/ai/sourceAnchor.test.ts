import { describe, expect, it } from 'vitest';
import { createTextAnchor, isTextAnchor } from './sourceAnchor';

describe('citation text anchors', () => {
  it('is stable across line-ending changes', () => {
    expect(createTextAnchor('alpha\r\nbeta')).toBe(createTextAnchor('alpha\nbeta'));
  });

  it('changes when the cited text changes', () => {
    expect(createTextAnchor('alpha')).not.toBe(createTextAnchor('beta'));
    expect(isTextAnchor(createTextAnchor('alpha'))).toBe(true);
  });
});
