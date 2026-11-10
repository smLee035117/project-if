import { randomUUID } from 'node:crypto';

export function createPlayId(): string {
  return randomUUID();
}