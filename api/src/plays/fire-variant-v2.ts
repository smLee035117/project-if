import { randomInt } from 'node:crypto';

export const FIRE_VARIANTS_V2 = ['X', 'Y', 'Z'] as const;

export type FireVariantV2 =
  typeof FIRE_VARIANTS_V2[number];

// 인덱스 인자는 결정적 테스트용입니다.
// 실제 플레이에서는 Node.js의 randomInt(3)를 사용합니다.
export function selectFireVariantV2(
  index: number = randomInt(FIRE_VARIANTS_V2.length),
): FireVariantV2 {
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index >= FIRE_VARIANTS_V2.length
  ) {
    throw new RangeError('화재 상황 선택 인덱스가 올바르지 않습니다.');
  }

  return FIRE_VARIANTS_V2[index]!;
}
