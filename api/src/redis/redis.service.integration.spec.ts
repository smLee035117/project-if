import { randomUUID } from 'node:crypto';
import { createClient } from 'redis';
import { beforeAll, afterAll, expect, test } from 'vitest';

import { RedisService } from './redis.service.js';
import type { PlayData } from '../plays/types/play.js';

const service = new RedisService();

// 테스트 데이터 삭제용 연결
const cleanupClient = createClient({
  url: 'redis://127.0.0.1:6379',
});

//const playId = `test-${randomUUID()}`;
const playIds: string[] = [];

beforeAll(async () => {
  await cleanupClient.connect();
  await service.onModuleInit();
});

afterAll(async () => {
  try {
    if (cleanupClient.isReady) {
      for (const id of playIds) {
        await cleanupClient.del(`play:${id}`);
      }
    }
  } finally {
    if (cleanupClient.isOpen) {
      await cleanupClient.close();
    }

    await service.onModuleDestroy();
  }
});

test('이전 단계 기준의 저장 요청은 기존 결과를 덮어쓰지 않는다', async () => {

  const playId = `test-${randomUUID()}`;
  playIds.push(playId);

  const initial: PlayData = {
    userId: 4,
    userType: 0,
    score: 100,
    state: 'PLAYING',
    currentStep: 0,
    scenarioId: 'blackout_test_01',
  };

  // 두 요청이 같은 초기 상태를 읽고 계산한 결과
  const resultA: PlayData = {
    ...initial,
    score: 100,
    currentStep: 1,
  };

  const resultB: PlayData = {
    ...initial,
    score: 95,
    currentStep: 1,
  };

  await service.savePlay(playId, initial);

  
  const resA = await service.updatePlayIfCurrent(playId,0,resultA);
  expect(resA).toBe(true);  

  const resB = await service.updatePlayIfCurrent(playId,0,resultB);
  expect(resB).toBe(false);


  const getResA = await service.getPlay(playId);
  expect(getResA).toEqual(resultA);
  
});


test('동시 저장 요청 중 하나만 성공한다', async () => {

  const playId = `test-${randomUUID()}`;
  playIds.push(playId);

  const initial: PlayData = {
    userId: 4,
    userType: 0,
    score: 100,
    state: 'PLAYING',
    currentStep: 0,
    scenarioId: 'blackout_test_01',
  };

  // 두 요청이 같은 초기 상태를 읽고 계산한 결과
  const resultA: PlayData = {
    ...initial,
    score: 100,
    currentStep: 1,
  };

  const resultB: PlayData = {
    ...initial,
    score: 95,
    currentStep: 1,
  };


  await service.savePlay(playId, initial);

  const [resA, resB] = await Promise.all([
    service.updatePlayIfCurrent(playId, 0, resultA),
    service.updatePlayIfCurrent(playId, 0, resultB),
  ]);

  const isXor: boolean = resA !== resB; 

  expect(isXor).toBe(true);

  const getRes = await service.getPlay(playId);
  const expected = resA ? resultA : resultB;
  expect(getRes).toEqual(expected);

});