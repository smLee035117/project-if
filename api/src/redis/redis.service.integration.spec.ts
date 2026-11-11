import { randomUUID } from 'node:crypto';
import { createClient } from 'redis';
import { beforeAll, afterAll, expect, test } from 'vitest';

import { RedisService } from './redis.service.js';
import type { PlayData } from '../plays/types/play.js';
import e from 'express';

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
        await cleanupClient.del([
          `play:${id}`,
          `pending:play-result:${id}`,
        ]);
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

test('종료 상태로 갱신하면 pending 결과도 저장된다', async () => {
  
    const playId = `test-${randomUUID()}`;
    playIds.push(playId);

    const initial: PlayData = {
      userId: 4,
      userType: 0,
      score: 100,
      state: 'PLAYING',
      currentStep: 2,
      scenarioId: 'blackout_test_01',
    };

    const resultA: PlayData = {
      ...initial,
      state: 'CLEARED',
    
    };

     await service.savePlay(playId, initial);

     const resA = await service.updatePlayIfCurrent(playId, 2, resultA);

     expect(resA).toBe(true);

     const getRes = await service.getPlay(playId);

    const pending = await cleanupClient.get(`pending:play-result:${playId}`);     
    expect(pending).not.toBeNull();

    expect(getRes).toEqual(resultA);
    expect(JSON.parse(pending!)).toEqual(getRes);

});

test('CAS 검증에 실패하면 pending 결과를 저장하지 않는다', async () => {
  // 직접 구현

   // 1. playId 생성 및 정리 목록 등록

    // 2. 초기 PlayData 구성 (currentStep: 0)

    // 3. 종료 상태의 resultA 구성 (state: CLEARED)

    // 4. Redis에 initial 저장

    // 5. expectedStep을 1로 설정해 CAS 요청

    // 6. CAS 반환값이 false인지 검증

    // 7. Redis의 플레이 데이터를 다시 조회

    // 8. 조회 결과가 initial과 동일한지 검증

    // 9. pending 키 조회

    // 10. pending 데이터가 null인지 검증

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


    const resultA: PlayData = {
      ...initial,
      state: 'CLEARED',
    
    };

     await service.savePlay(playId, initial);

     const resA = await service.updatePlayIfCurrent(playId, 1, resultA);

     expect(resA).toBe(false);


     const getRes = await service.getPlay(playId);

     expect(getRes).toEqual(initial);

     const pending = await cleanupClient.get(`pending:play-result:${playId}`);     
    expect(pending).toBeNull();


});


test('pending 결과를 조회하고 삭제 후에는 null을 반환한다', async () => {
  // 직접 구현
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


      const resultA: PlayData = {
        ...initial,
        state: 'CLEARED',
      
      };

      await service.savePlay(playId, initial);

      const resA = await service.updatePlayIfCurrent(playId, initial.currentStep, resultA);
      expect(resA).toBe(true);

      const chk = await service.getPendingPlayResult(playId);
      expect(chk).toEqual(resultA);

      const pending = await cleanupClient.get(`pending:play-result:${playId}`);    
      expect(pending).not.toBeNull();
      await service.deletePendingPlayResult(playId);
      
      const pendingAfter = await cleanupClient.get(`pending:play-result:${playId}`);
      expect(pendingAfter).toBeNull();




      const getRes = await service.getPlay(playId);
      expect(getRes).not.toBeNull();

      expect(getRes).toEqual(resultA);

});
