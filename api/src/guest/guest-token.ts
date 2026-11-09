import { randomBytes, createHash } from 'node:crypto';

// 게스트 식별 토큰 생성
export function generateGuestToken(): string {
  return randomBytes(32).toString('hex');
}

// 토큰을 SHA-256 해시로 변환
export function hashGuestToken(token: string): string {
  return createHash('sha256')
    .update(token)
    .digest('hex');
}