import { describe, test, expect } from 'vitest';
import { selectFireVariantV2 } from './fire-variant-v2.js';

describe('화재 상황 선택', () => {
  test.each([
    [0, 'X'],
    [1, 'Y'],
    [2, 'Z'],
  ] as const)('인덱스 %i → %s', (index, expected) => {
    expect(selectFireVariantV2(index)).toBe(expected);
  });

  test('유효하지 않은 인덱스를 거절한다', () => {
    for (const index of [-1, 3, 1.5, NaN, Infinity]) {
      expect(() => selectFireVariantV2(index))
        .toThrow(RangeError);
    }
  });
});
